#!/bin/bash
# Smart Reader Backend 启动脚本

echo "Starting Smart Reader Backend..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

if ! command -v uv &> /dev/null; then
  echo "Error: uv is not installed. Install it from https://docs.astral.sh/uv/getting-started/installation/"
  exit 1
fi

if [ ! -f "uv.lock" ]; then
  echo "Running uv sync to install dependencies..."
  uv sync
fi

echo "Starting FastAPI server..."
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
