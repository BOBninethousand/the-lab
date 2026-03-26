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
LAB_PORT=8000
N8N_CONTAINER="n8n"
LOCK_FILE="/tmp/lab-deploy.lock"

cd "$PROJECT_DIR" || { echo "FATAL: Cannot cd to $PROJECT_DIR"; exit 1; }
mkdir -p "$LOG_DIR"

CONSECUTIVE_FAILURES=0
LAST_FAILED_COMMIT=""

# --- Logging ---

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_section() {
  echo "" >> "$LOG_FILE"
  log "===== $1 ====="
}

# --- Lock File (prevent overlapping deploys) ---

acquire_lock() {
  if [ -f "$LOCK_FILE" ]; then
    local lock_pid
    lock_pid=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$lock_pid" 2>/dev/null; then
      log "Deploy already in progress (pid $lock_pid), skipping cycle"
      return 1
    fi
    # Stale lock file — previous deploy crashed
    log "Removing stale lock file (pid $lock_pid not running)"
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
  return 0
}

release_lock() {
  rm -f "$LOCK_FILE"
}

# --- Log Rotation ---

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

# --- Disk Space Check ---

check_disk_space() {
  local free_mb
  free_mb=$(df -m "$PROJECT_DIR" | awk 'NR==2 {print $4}')
  if [ "$free_mb" -lt "$MIN_DISK_MB" ]; then
    log "WARNING: Low disk space (${free_mb}MB free). Pruning Docker..."
    docker system prune -f >> "$LOG_FILE" 2>&1
    docker image prune -a -f --filter "until=72h" >> "$LOG_FILE" 2>&1
    free_mb=$(df -m "$PROJECT_DIR" | awk 'NR==2 {print $4}')
    log "Disk space after prune: ${free_mb}MB free"
  fi
}

# --- Docker Daemon Check ---

wait_for_docker() {
  while ! docker info > /dev/null 2>&1; do
    log "Waiting for Docker daemon..."
    sleep 10
  done
}

# --- Git Pull (with stash fallback for merge conflicts) ---

git_pull() {
  # Try normal pull first
  if git pull origin main >> "$LOG_FILE" 2>&1; then
    return 0
  fi

  # Pull failed — try stash + pull as fallback (handles merge conflicts)
  log "Git pull failed, trying stash + pull fallback..."
  git stash >> "$LOG_FILE" 2>&1
  if git pull origin main >> "$LOG_FILE" 2>&1; then
    log "Stash + pull succeeded"
    return 0
  fi

  log "ERROR: Git pull failed even after stash — skipping this cycle"
  return 1
}

# --- Self-Update Check ---

check_self_update() {
  if git diff HEAD~1 --name-only 2>/dev/null | grep -q "auto-deploy.sh"; then
    log "auto-deploy.sh was updated — restarting with new version"
    release_lock
    exec bash "$PROJECT_DIR/auto-deploy.sh"
  fi
}

# --- Detect What Changed ---

detect_changes() {
  local old_commit="$1"
  local changed_files
  changed_files=$(git diff --name-only "$old_commit" HEAD 2>/dev/null)

  # Log diff stat
  log "Changes:"
  git diff --stat "$old_commit" HEAD >> "$LOG_FILE" 2>&1

  COMPOSE_CHANGED=false
  DEPS_CHANGED=false
  KB_CHANGED=false
  ENV_CHANGED=false

  echo "$changed_files" | grep -q "docker-compose.yml" && COMPOSE_CHANGED=true
  echo "$changed_files" | grep -qE "package.json|requirements.txt" && DEPS_CHANGED=true
  echo "$changed_files" | grep -q "\.env" && ENV_CHANGED=true
  echo "$changed_files" | grep -q "kb.*\.json" && KB_CHANGED=true

  [ "$DEPS_CHANGED" = true ] && log "Dependencies updated (package.json or requirements.txt changed)"
  [ "$ENV_CHANGED" = true ] && log "Environment file changed — rebuild will pick it up"
  [ "$COMPOSE_CHANGED" = true ] && log "docker-compose.yml changed"
  [ "$KB_CHANGED" = true ] && log "Knowledge base JSON changed — will auto-import after deploy"
}

# --- Deploy ---
# Single command: docker compose up -d --build --remove-orphans
# Keeps running containers online while rebuilding. No down + up cycle needed.

deploy() {
  local old_commit="$1"

  log_section "DEPLOYING"

  detect_changes "$old_commit"
  check_disk_space

  # Single build + start command — keeps The Lab online during rebuild
  log "Building and starting containers..."
  if ! docker compose up -d --build --remove-orphans >> "$LOG_FILE" 2>&1; then
    # Check for port conflict
    local up_output
    up_output=$(docker compose up -d --build --remove-orphans 2>&1)
    if echo "$up_output" | grep -q "port is already allocated"; then
      log "Port conflict detected — killing conflicting process"
      local conflict_port
      conflict_port=$(echo "$up_output" | grep -oE '0\.0\.0\.0:[0-9]+' | head -1 | cut -d: -f2)
      if [ -n "$conflict_port" ]; then
        lsof -ti:"$conflict_port" | xargs kill -9 2>/dev/null
        log "Killed process on port $conflict_port, retrying..."
        docker compose up -d --build --remove-orphans >> "$LOG_FILE" 2>&1
      fi
    else
      log "ERROR: Deploy failed. Build output:"
      echo "$up_output" | tail -50 >> "$LOG_FILE"
      return 1
    fi
  fi

  # Log container status
  log "Container status:"
  docker compose ps >> "$LOG_FILE" 2>&1

  # Auto-import KB files if changed
  if [ "$KB_CHANGED" = true ]; then
    import_knowledge_base
  fi

  check_n8n

  log "Deploy complete!"
  return 0
}

# --- Knowledge Base Auto-Import ---

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

# --- N8N Check ---

check_n8n() {
  if docker ps -a --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
    if ! docker ps --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
      log "N8N container stopped — restarting..."
      docker start "$N8N_CONTAINER" >> "$LOG_FILE" 2>&1
    fi
  fi
}

# --- Health Check + Self-Healing ---

health_check() {
  for svc in $(docker compose ps --services 2>/dev/null); do
    local container_id
    container_id=$(docker compose ps -q "$svc" 2>/dev/null)
    [ -z "$container_id" ] && continue

    local state
    state=$(docker inspect --format='{{.State.Status}}' "$container_id" 2>/dev/null)

    if [ "$state" != "running" ]; then
      log "WARNING: Service '$svc' is $state — attempting restart..."
      docker compose up -d "$svc" >> "$LOG_FILE" 2>&1
    fi

    # Detect restart loop
    local restart_count
    restart_count=$(docker inspect --format='{{.RestartCount}}' "$container_id" 2>/dev/null || echo 0)
    if [ "$restart_count" -gt "$MAX_RESTARTS" ]; then
      local started_at
      started_at=$(docker inspect --format='{{.State.StartedAt}}' "$container_id" 2>/dev/null)
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

  check_n8n
}

# --- Rollback ---

rollback() {
  log_section "ROLLBACK"
  log "Rolling back to previous commit..."

  local current_commit
  current_commit=$(git rev-parse HEAD)
  git checkout HEAD~1 >> "$LOG_FILE" 2>&1

  log "Rolled back from $current_commit to $(git rev-parse HEAD)"
  docker compose up -d --build --remove-orphans >> "$LOG_FILE" 2>&1

  log "Rollback deploy complete. Container status:"
  docker compose ps >> "$LOG_FILE" 2>&1
}

# --- Cloudflare Tunnel Check ---

check_tunnels() {
  local tunnel_count
  tunnel_count=$(pgrep -c cloudflared 2>/dev/null || echo 0)

  if [ "$tunnel_count" -eq 0 ]; then
    log "WARNING: No Cloudflare tunnels running — relaunching"

    nohup cloudflared tunnel --url http://localhost:$LAB_PORT >> "$LOG_DIR/tunnel-lab.log" 2>&1 &
    log "Launched tunnel for The Lab (:$LAB_PORT)"

    sleep 5

    if docker ps --format '{{.Names}}' | grep -q "$N8N_CONTAINER"; then
      nohup cloudflared tunnel --url http://localhost:5678 >> "$LOG_DIR/tunnel-n8n.log" 2>&1 &
      log "Launched tunnel for N8N (:5678)"
    fi

    sleep 5
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel-lab.log" 2>/dev/null | tail -1 | while read -r url; do
      log "Lab tunnel URL: $url"
    done
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel-n8n.log" 2>/dev/null | tail -1 | while read -r url; do
      log "N8N tunnel URL: $url"
    done

  elif [ "$tunnel_count" -eq 1 ]; then
    log "WARNING: Only $tunnel_count tunnel running — checking which is missing"
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

# Clean up stale lock on startup
rm -f "$LOCK_FILE"

wait_for_docker

while true; do
  rotate_log

  git fetch origin main --quiet 2>/dev/null

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)

  # --- New Code Detected ---
  if [ "$LOCAL" != "$REMOTE" ]; then

    # Skip if same commit already failed 3 times
    if [ "$REMOTE" = "$LAST_FAILED_COMMIT" ] && [ "$CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
      # Don't retry — wait for a NEW commit
      :
    else
      # Reset failure counter if this is a different commit
      if [ "$REMOTE" != "$LAST_FAILED_COMMIT" ]; then
        CONSECUTIVE_FAILURES=0
        LAST_FAILED_COMMIT=""
      fi

      log_section "NEW CHANGES DETECTED"
      log "Local:  $LOCAL"
      log "Remote: $REMOTE"

      # Acquire deploy lock
      if acquire_lock; then
        # Pull with stash fallback
        if git_pull; then
          check_self_update

          if deploy "$LOCAL"; then
            CONSECUTIVE_FAILURES=0
            LAST_FAILED_COMMIT=""
          else
            CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
            LAST_FAILED_COMMIT="$REMOTE"
            log "Deploy failed ($CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES consecutive)"

            if [ "$CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
              log "CRITICAL: $MAX_CONSECUTIVE_FAILURES consecutive failures for commit $REMOTE — waiting for new commit"
            fi
          fi
        fi

        release_lock
      fi
    fi
  fi

  # --- Periodic Health Checks (every cycle) ---
  wait_for_docker
  health_check
  check_tunnels

  sleep "$CHECK_INTERVAL"
done
