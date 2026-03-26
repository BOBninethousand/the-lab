#!/bin/bash
# =============================================================================
# The Lab — Self-Healing Auto-Deploy System
# =============================================================================
# Zero-touch deployment: handles code pushes, new services, crashes, rollbacks,
# tunnel recovery, disk cleanup, and self-updating.
# =============================================================================

set -o pipefail

# --- Configuration ---
PROJECT_DIR=~/Desktop/the-lab
LOG_DIR=~/lab-logs
LOG_FILE="$LOG_DIR/startup.log"
LOG_MAX_SIZE=10485760  # 10MB in bytes
CHECK_INTERVAL=120     # seconds between checks
MIN_DISK_MB=2048       # minimum free disk space (2GB)
MAX_RESTARTS=3         # restart loop threshold
RESTART_WINDOW=300     # seconds to count restarts (5 min)
MAX_CONSECUTIVE_FAILURES=3
GIT_RETRY_COUNT=3
GIT_RETRY_DELAY=30
LAB_PORT=8000
N8N_CONTAINER="n8n"

cd "$PROJECT_DIR" || { echo "FATAL: Cannot cd to $PROJECT_DIR"; exit 1; }
mkdir -p "$LOG_DIR"

CONSECUTIVE_FAILURES=0

# --- Logging ---

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_section() {
  echo "" >> "$LOG_FILE"
  log "===== $1 ====="
}

# --- Log Rotation (scenario 21) ---

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    local size
    size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$size" -gt "$LOG_MAX_SIZE" ]; then
      mv "$LOG_FILE" "$LOG_FILE.old"
      log "Log rotated (was ${size} bytes)"
    fi
  fi
}

# --- Disk Space Check (scenario 12) ---

check_disk_space() {
  local free_mb
  free_mb=$(df -m "$PROJECT_DIR" | awk 'NR==2 {print $4}')
  if [ "$free_mb" -lt "$MIN_DISK_MB" ]; then
    log "WARNING: Low disk space (${free_mb}MB free). Pruning Docker..."
    docker system prune -f >> "$LOG_FILE" 2>&1
    docker image prune -a -f --filter "until=72h" >> "$LOG_FILE" 2>&1
    free_mb=$(df -m "$PROJECT_DIR" | awk 'NR==2 {print $4}')
    log "Disk space after prune: ${free_mb}MB free"
    if [ "$free_mb" -lt "$MIN_DISK_MB" ]; then
      log "CRITICAL: Still low on disk after prune (${free_mb}MB)"
    fi
  fi
}

# --- Docker Daemon Check (scenario 11) ---

wait_for_docker() {
  while ! docker info > /dev/null 2>&1; do
    log "Waiting for Docker daemon..."
    sleep 10
  done
}

# --- Git Pull with Retry (scenario 14) ---

git_pull_with_retry() {
  local attempt=0
  while [ $attempt -lt $GIT_RETRY_COUNT ]; do
    if git pull origin main >> "$LOG_FILE" 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    log "Git pull failed (attempt $attempt/$GIT_RETRY_COUNT), retrying in ${GIT_RETRY_DELAY}s..."
    sleep "$GIT_RETRY_DELAY"
  done
  log "ERROR: Git pull failed after $GIT_RETRY_COUNT attempts, skipping this cycle"
  return 1
}

# --- Self-Update Check (scenario 26) ---

check_self_update() {
  if git diff HEAD~1 --name-only 2>/dev/null | grep -q "auto-deploy.sh"; then
    log "auto-deploy.sh was updated — restarting with new version"
    exec bash "$PROJECT_DIR/auto-deploy.sh"
  fi
}

# --- Detect What Changed (scenarios 4-8, 23) ---

detect_changes() {
  local old_commit="$1"
  local new_commit="$2"
  local changed_files
  changed_files=$(git diff --name-only "$old_commit" "$new_commit" 2>/dev/null)

  # Log diff stat (scenario 23)
  log "Changes:"
  git diff --stat "$old_commit" "$new_commit" >> "$LOG_FILE" 2>&1

  COMPOSE_CHANGED=false
  DEPS_CHANGED=false
  KB_CHANGED=false
  ENV_CHANGED=false

  echo "$changed_files" | while read -r f; do
    case "$f" in
      docker-compose.yml) COMPOSE_CHANGED=true ;;
      */package.json|*/package-lock.json|*/requirements.txt) DEPS_CHANGED=true ;;
      *.env*) ENV_CHANGED=true ;;
      *kb*.json) KB_CHANGED=true ;;
    esac
  done

  # Re-check with grep since the while subshell doesn't export
  echo "$changed_files" | grep -q "docker-compose.yml" && COMPOSE_CHANGED=true
  echo "$changed_files" | grep -qE "package.json|requirements.txt" && DEPS_CHANGED=true
  echo "$changed_files" | grep -q "\.env" && ENV_CHANGED=true
  echo "$changed_files" | grep -q "kb.*\.json" && KB_CHANGED=true

  [ "$DEPS_CHANGED" = true ] && log "Dependencies updated (package.json or requirements.txt changed)"
  [ "$ENV_CHANGED" = true ] && log "Environment file changed — rebuild will pick it up"
  [ "$COMPOSE_CHANGED" = true ] && log "docker-compose.yml changed — doing full down + up cycle"
  [ "$KB_CHANGED" = true ] && log "Knowledge base JSON changed — will auto-import after deploy"
}

# --- Deploy (scenarios 1-8) ---

deploy() {
  local old_commit="$1"

  log_section "DEPLOYING"

  # Detect what changed
  detect_changes "$old_commit" "HEAD"

  # Check disk before building (scenario 12)
  check_disk_space

  # Full cycle if docker-compose.yml changed (scenario 8), otherwise normal restart
  if [ "$COMPOSE_CHANGED" = true ]; then
    log "Full down + up cycle (compose file changed)"
    docker compose down --remove-orphans >> "$LOG_FILE" 2>&1
  fi

  # Build (scenario 6, 7 — Dockerfile and dependency changes handled by Docker layer cache)
  log "Building..."
  if ! docker compose build --no-cache >> "$LOG_FILE" 2>&1; then
    # Scenario 15 — build failed, log output
    log "ERROR: Build failed. Last 50 lines of build output:"
    docker compose build --no-cache 2>&1 | tail -50 >> "$LOG_FILE"
    return 1
  fi

  # Start (scenarios 1-3)
  log "Starting containers..."
  if ! docker compose up -d --build --remove-orphans >> "$LOG_FILE" 2>&1; then
    # Scenario 13 — check for port conflict
    if docker compose up -d --build --remove-orphans 2>&1 | grep -q "port is already allocated"; then
      log "Port conflict detected — killing conflicting process"
      local conflict_port
      conflict_port=$(docker compose up -d 2>&1 | grep -oP '0\.0\.0\.0:\K\d+' | head -1)
      if [ -n "$conflict_port" ]; then
        lsof -ti:$conflict_port | xargs kill -9 2>/dev/null
        log "Killed process on port $conflict_port, retrying..."
        docker compose up -d --build --remove-orphans >> "$LOG_FILE" 2>&1
      fi
    else
      log "ERROR: docker compose up failed"
      return 1
    fi
  fi

  # Log container status (scenario 24)
  log "Container status:"
  docker compose ps >> "$LOG_FILE" 2>&1

  # Auto-import KB files if changed (scenario 4)
  if [ "$KB_CHANGED" = true ]; then
    import_knowledge_base
  fi

  # Check/start N8N (scenario 19)
  check_n8n

  log "Deploy complete!"
  return 0
}

# --- Knowledge Base Auto-Import (scenario 4) ---

import_knowledge_base() {
  log "Auto-importing knowledge base files..."
  sleep 5  # Wait for backend to be ready

  for kb_file in "$PROJECT_DIR"/the-lab-kb-*.json; do
    [ -f "$kb_file" ] || continue
    local filename
    filename=$(basename "$kb_file")
    log "Importing $filename..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      "http://localhost:$LAB_PORT/api/knowledge/bulk" \
      -H "Content-Type: application/json" \
      -d @"$kb_file" 2>/dev/null)
    if [ "$response" = "200" ]; then
      log "Imported $filename successfully"
    else
      log "WARNING: Failed to import $filename (HTTP $response)"
    fi
  done
}

# --- N8N Check (scenarios 19-20) ---

check_n8n() {
  if docker ps -a --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
    if ! docker ps --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
      log "N8N container stopped — restarting..."
      docker start "$N8N_CONTAINER" >> "$LOG_FILE" 2>&1
    fi
  else
    log "WARNING: N8N container missing — needs manual recreation"
  fi
}

# --- Health Check + Self-Healing (scenarios 9-10) ---

health_check() {
  local unhealthy=false

  # Check each service
  for svc in $(docker compose ps --services 2>/dev/null); do
    local container_id
    container_id=$(docker compose ps -q "$svc" 2>/dev/null)
    [ -z "$container_id" ] && continue

    local state
    state=$(docker inspect --format='{{.State.Status}}' "$container_id" 2>/dev/null)

    if [ "$state" != "running" ]; then
      log "WARNING: Service '$svc' is $state — attempting restart..."
      docker compose up -d "$svc" >> "$LOG_FILE" 2>&1
      unhealthy=true
    fi

    # Scenario 10 — detect restart loop
    local restart_count
    restart_count=$(docker inspect --format='{{.RestartCount}}' "$container_id" 2>/dev/null || echo 0)
    local started_at
    started_at=$(docker inspect --format='{{.State.StartedAt}}' "$container_id" 2>/dev/null)

    if [ "$restart_count" -gt "$MAX_RESTARTS" ]; then
      # Check if restarts happened within the window
      local started_epoch
      started_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${started_at%%.*}" "+%s" 2>/dev/null || date -d "${started_at%%.*}" "+%s" 2>/dev/null || echo 0)
      local now_epoch
      now_epoch=$(date "+%s")
      local diff=$((now_epoch - started_epoch))

      if [ "$diff" -lt "$RESTART_WINDOW" ]; then
        log "CRITICAL: Service '$svc' in restart loop ($restart_count restarts in ${diff}s) — rolling back"
        rollback
        return
      fi
    fi
  done

  # Check The Lab HTTP health
  if ! curl -sf "http://localhost:$LAB_PORT/api/health" > /dev/null 2>&1; then
    log "WARNING: The Lab health check failed — restarting the-lab service"
    docker compose restart the-lab >> "$LOG_FILE" 2>&1
  fi

  # Check N8N (scenario 19)
  check_n8n
}

# --- Rollback (scenario 10) ---

rollback() {
  log_section "ROLLBACK"
  log "Rolling back to previous commit..."

  local current_commit
  current_commit=$(git rev-parse HEAD)
  git checkout HEAD~1 >> "$LOG_FILE" 2>&1

  log "Rolled back from $current_commit to $(git rev-parse HEAD)"
  docker compose down --remove-orphans >> "$LOG_FILE" 2>&1
  docker compose build --no-cache >> "$LOG_FILE" 2>&1
  docker compose up -d --build --remove-orphans >> "$LOG_FILE" 2>&1

  log "Rollback deploy complete. Container status:"
  docker compose ps >> "$LOG_FILE" 2>&1
}

# --- Cloudflare Tunnel Check (scenarios 16-18) ---

check_tunnels() {
  local tunnel_count
  tunnel_count=$(pgrep -c cloudflared 2>/dev/null || echo 0)

  if [ "$tunnel_count" -eq 0 ]; then
    log "WARNING: No Cloudflare tunnels running — relaunching"

    # Launch tunnel for The Lab (port 8000)
    nohup cloudflared tunnel --url http://localhost:$LAB_PORT >> "$LOG_DIR/tunnel-lab.log" 2>&1 &
    log "Launched tunnel for The Lab (:$LAB_PORT)"

    sleep 5

    # Launch tunnel for N8N (port 5678) if N8N exists
    if docker ps --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
      nohup cloudflared tunnel --url http://localhost:5678 >> "$LOG_DIR/tunnel-n8n.log" 2>&1 &
      log "Launched tunnel for N8N (:5678)"
    fi

    # Scenario 17 — log new tunnel URLs
    sleep 5
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel-lab.log" 2>/dev/null | tail -1 | while read -r url; do
      log "Lab tunnel URL: $url"
    done
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel-n8n.log" 2>/dev/null | tail -1 | while read -r url; do
      log "N8N tunnel URL: $url"
    done

  elif [ "$tunnel_count" -eq 1 ]; then
    # Scenario 18 — one tunnel died, check which one
    log "WARNING: Only $tunnel_count tunnel running — checking which is missing"
    # Relaunch missing tunnel (heuristic: check if lab tunnel log is stale)
    if ! pgrep -f "tunnel.*$LAB_PORT" > /dev/null 2>&1; then
      nohup cloudflared tunnel --url http://localhost:$LAB_PORT >> "$LOG_DIR/tunnel-lab.log" 2>&1 &
      log "Relaunched Lab tunnel"
    fi
    if docker ps --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
      if ! pgrep -f "tunnel.*5678" > /dev/null 2>&1; then
        nohup cloudflared tunnel --url http://localhost:5678 >> "$LOG_DIR/tunnel-n8n.log" 2>&1 &
        log "Relaunched N8N tunnel"
      fi
    fi
  fi
}

# =============================================================================
# Main Loop
# =============================================================================

log_section "AUTO-DEPLOY STARTED"
log "Project: $PROJECT_DIR"
log "Check interval: ${CHECK_INTERVAL}s"

# Ensure Docker is available
wait_for_docker

while true; do
  # Rotate log if needed (scenario 21)
  rotate_log

  # Fetch latest from GitHub
  git fetch origin main --quiet 2>/dev/null

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)

  # --- New Code Detected ---
  if [ "$LOCAL" != "$REMOTE" ]; then
    log_section "NEW CHANGES DETECTED"
    log "Local:  $LOCAL"
    log "Remote: $REMOTE"

    # Pull with retry (scenario 14)
    if git_pull_with_retry; then
      # Self-update check (scenario 26)
      check_self_update

      # Deploy
      if deploy "$LOCAL"; then
        CONSECUTIVE_FAILURES=0
      else
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
        log "Deploy failed ($CONSECUTIVE_FAILURES consecutive)"

        # Scenario 25 — stop after too many failures
        if [ "$CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
          log "CRITICAL: $MAX_CONSECUTIVE_FAILURES consecutive deploy failures — stopping auto-deploy"
          log "Manual intervention needed. Last working commit: $LOCAL"
          # Keep running but skip deploys until a successful health check
          while true; do
            sleep "$CHECK_INTERVAL"
            if curl -sf "http://localhost:$LAB_PORT/api/health" > /dev/null 2>&1; then
              log "Health check passed — resuming auto-deploy"
              CONSECUTIVE_FAILURES=0
              break
            fi
          done
        fi
      fi
    fi
  fi

  # --- Periodic Health Checks (every cycle, not just on deploy) ---
  wait_for_docker
  health_check
  check_tunnels

  sleep "$CHECK_INTERVAL"
done
