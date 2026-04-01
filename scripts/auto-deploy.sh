#!/bin/bash
# =============================================================================
# The Lab — Auto-Deploy Watcher
# =============================================================================
# Polls GitHub every 120 seconds. When new commits are detected on main,
# pulls and rebuilds the Docker container automatically.
#
# QUICK START:
#   nohup ~/Desktop/the-lab/scripts/auto-deploy.sh &
#
# INSTALL AS MACOS SERVICE (survives reboots):
#   1. Copy the plist:
#      cp scripts/install-auto-deploy.plist ~/Library/LaunchAgents/com.thelab.auto-deploy.plist
#   2. Edit the plist — replace REPO_PATH with your actual repo path
#      (e.g. /Users/quimmierbulatao/Desktop/the-lab)
#      and LOG_PATH with your log directory (e.g. /Users/quimmierbulatao/lab-logs)
#   3. Load the service:
#      launchctl load ~/Library/LaunchAgents/com.thelab.auto-deploy.plist
#   4. Verify it's running:
#      ps aux | grep auto-deploy
# =============================================================================

REPO_DIR="$HOME/Desktop/the-lab"
LOG_FILE="$HOME/lab-logs/auto-deploy.log"
PID_FILE="/tmp/the-lab-auto-deploy.pid"
CHECK_INTERVAL=120

# Prevent duplicate instances
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Auto-deploy already running (PID $(cat "$PID_FILE"))"
    exit 1
fi
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Auto-deploy started (PID $$, checking every ${CHECK_INTERVAL}s)"

while true; do
    cd "$REPO_DIR" || { log "ERROR: Cannot cd to $REPO_DIR"; sleep "$CHECK_INTERVAL"; continue; }

    git fetch origin main 2>/dev/null

    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)

    if [ "$LOCAL" != "$REMOTE" ]; then
        log "New commits detected (local: ${LOCAL:0:7}, remote: ${REMOTE:0:7}). Deploying..."
        git pull origin main 2>&1 | tee -a "$LOG_FILE"
        docker compose up -d --build the-lab 2>&1 | tee -a "$LOG_FILE"
        log "Deploy complete"
    fi

    sleep "$CHECK_INTERVAL"
done
