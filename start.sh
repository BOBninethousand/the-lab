#!/bin/bash
set -e

echo ""
echo "  ⬡ The Lab — Starting up..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "  Python 3 not found. Install it first."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "  Node.js not found. Install it first."
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Backend setup
echo "  Setting up backend..."
cd "$PROJECT_DIR/backend"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# Create .env if missing
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  Created .env from template — fill in your API keys."
fi

# Create data dirs
mkdir -p data/{memories,journals,documents,crew_logs,chats}

# Frontend setup
echo "  Setting up frontend..."
cd "$PROJECT_DIR/frontend"
npm install --silent

# Start both
echo ""
echo "  Starting backend on http://localhost:8000"
cd "$PROJECT_DIR/backend"
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "  Starting frontend on http://localhost:5173"
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  ⬡ The Lab is running"
echo "    Dashboard:  http://localhost:5173"
echo "    API docs:   http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
