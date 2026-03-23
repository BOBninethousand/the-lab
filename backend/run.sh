#!/bin/bash

# The Lab - AI Agent Operations Hub
# Production startup script

set -e

echo "The Lab - Starting AI Agent Operations Hub"
echo "==========================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.example to .env and configure your API keys"
    exit 1
fi

# Check if required API keys are set
if grep -q "OPENAI_API_KEY=$\|OPENAI_API_KEY= *$" .env; then
    echo "Warning: OPENAI_API_KEY is not configured"
fi

if grep -q "ANTHROPIC_API_KEY=$\|ANTHROPIC_API_KEY= *$" .env; then
    echo "Warning: ANTHROPIC_API_KEY is not configured"
fi

# Create data directory if it doesn't exist
mkdir -p data

# Install dependencies if needed
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/upgrade dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Start the server
echo ""
echo "Starting FastAPI server..."
echo "API documentation: http://localhost:8000/docs"
echo "WebSocket: ws://localhost:8000/ws"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

uvicorn app.main:app --host 0.0.0.0 --port 8000
