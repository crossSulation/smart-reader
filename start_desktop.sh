#!/bin/bash
# Smart Reader Desktop launcher (Tauri 2 + FastAPI backend)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

check_requirements() {
  local has_error=0

  if [ ! -f "$BACKEND_DIR/run_dev.py" ]; then
    echo "Error: backend run file not found at $BACKEND_DIR/run_dev.py"
    has_error=1
  fi

  if [ ! -f "$BACKEND_DIR/fresh_env/bin/activate" ]; then
    echo "Error: backend virtual environment activation script not found."
    echo "Expected: $BACKEND_DIR/fresh_env/bin/activate"
    has_error=1
  fi

  if [ ! -f "$FRONTEND_DIR/package.json" ]; then
    echo "Error: frontend package.json not found at $FRONTEND_DIR/package.json"
    has_error=1
  fi

  if ! command -v npm &> /dev/null; then
    echo "Error: npm is not available in PATH."
    has_error=1
  fi

  if [ $has_error -eq 0 ]; then
    echo "Basic checks passed."
    echo "Note: Ensure frontend dependencies are installed and Tauri CLI is available."
    echo "      Run: cd frontend && npm install"
    echo "Note: Tauri desktop launch requires Rust toolchain (rustup/rustc/cargo)."
  fi

  return $has_error
}

if [ "$1" = "--check" ]; then
  check_requirements
  exit $?
fi

echo "========================================"
echo "   Smart Reader Desktop Launcher"
echo "========================================"
echo ""

check_requirements
if [ $? -ne 0 ]; then
  echo ""
  echo "Startup checks failed."
  exit 1
fi

echo ""
echo "Starting backend server..."
cd "$BACKEND_DIR" || exit 1
source fresh_env/bin/activate
python run_dev.py &
BACKEND_PID=$!
cd "$SCRIPT_DIR" || exit 1

echo "Waiting for backend to boot..."
sleep 3

echo ""
echo "Starting Tauri desktop app..."
cd "$FRONTEND_DIR" || exit 1
npm run tauri:dev

echo ""
echo "Desktop app closed. Stopping backend (PID: $BACKEND_PID)..."
kill $BACKEND_PID 2>/dev/null
wait $BACKEND_PID 2>/dev/null
echo "Done."
