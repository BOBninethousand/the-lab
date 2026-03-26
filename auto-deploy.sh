#!/bin/bash
cd ~/Desktop/the-lab

echo "🔄 Auto-deploy watcher started — checking every 2 minutes"

while true; do
  git fetch origin main --quiet 2>/dev/null

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)

  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date) — New changes detected, deploying..."
    git pull origin main
    docker compose down --remove-orphans
    docker compose build --no-cache
    docker compose up -d --build --remove-orphans
    echo "$(date) — Deploy complete!"
  fi

  sleep 120
done
