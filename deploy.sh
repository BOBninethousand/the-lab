#!/bin/bash
set -e

echo ""
echo "  ⬡ The Lab — Deploying..."
echo ""

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Build frontend
echo "  Building frontend..."
cd "$PROJECT_DIR/frontend"
npm install --silent
npm run build

# Build Docker image
echo "  Building Docker image..."
cd "$PROJECT_DIR"
docker build -t the-lab .

# Start
echo "  Starting containers..."
docker compose up -d

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "  ⬡ The Lab is deployed"
echo "    Local:   http://localhost:8000"
echo "    Network: http://$LOCAL_IP:8000"
echo ""
echo "  To expose online with Cloudflare Tunnel:"
echo "    brew install cloudflare/cloudflare/cloudflared"
echo "    cloudflared tunnel --url http://localhost:8000"
echo ""
