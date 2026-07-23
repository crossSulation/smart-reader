#!/bin/bash
# Smart Reader Application 启动脚本
# 包含后端、前端或两者一起启动的选项

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

show_menu() {
  clear
  echo "========================================"
  echo "         Smart Reader Application"
  echo "========================================"
  echo ""
  echo "Please choose an option:"
  echo ""
  echo "1. Start Backend server (Development)"
  echo "2. Start Frontend server"
  echo "3. Start Both servers"
  echo "4. Start Backend server (Staging)"
  echo "5. Start Backend server (Production)"
  echo "0. Exit"
  echo ""
}

start_backend_dev() {
  echo ""
  echo "Starting backend server (Development)..."
  echo ""
  cd "$BACKEND_DIR" || exit 1
  source fresh_env/bin/activate
  python run_dev.py
  read -p "Press Enter to continue..."
}

start_backend_stage() {
  echo ""
  echo "Starting backend server (Staging)..."
  echo ""
  cd "$BACKEND_DIR" || exit 1
  source fresh_env/bin/activate
  python run_stage.py
  read -p "Press Enter to continue..."
}

start_backend_prod() {
  echo ""
  echo "Starting backend server (Production)..."
  echo ""
  cd "$BACKEND_DIR" || exit 1
  source fresh_env/bin/activate
  python run_prod.py
  read -p "Press Enter to continue..."
}

start_frontend() {
  echo ""
  echo "Starting frontend server..."
  echo ""
  if [ ! -d "$FRONTEND_DIR" ]; then
    echo "Error: frontend directory not found: $FRONTEND_DIR"
    read -p "Press Enter to continue..."
    return
  fi
  cd "$FRONTEND_DIR" || return

  echo "Installing frontend dependencies..."
  yarn install --frozen-lockfile
  if [ $? -ne 0 ]; then
    echo "Warning: yarn install failed, continuing anyway..."
  fi

  echo ""
  echo "Starting React development server..."
  yarn dev
  read -p "Press Enter to continue..."
}

start_both() {
  echo ""
  echo "Starting backend server (Development) in background..."
  echo ""
  cd "$BACKEND_DIR" || return
  source fresh_env/bin/activate
  python run_dev.py &
  BACKEND_PID=$!
  cd "$SCRIPT_DIR" || return

  sleep 3

  echo ""
  echo "Starting frontend server..."
  echo ""
  if [ ! -d "$FRONTEND_DIR" ]; then
    echo "Error: frontend directory not found: $FRONTEND_DIR"
    kill $BACKEND_PID 2>/dev/null
    read -p "Press Enter to continue..."
    return
  fi
  cd "$FRONTEND_DIR" || return
  echo "Installing frontend dependencies..."
  yarn install --frozen-lockfile
  echo ""
  echo "Starting React development server..."
  yarn dev

  echo ""
  echo "Both servers started successfully!"
  echo "Backend:  http://127.0.0.1:8000"
  echo "Frontend: http://localhost:3000"
  echo ""
  echo "Press Ctrl+C to stop frontend. Backend PID: $BACKEND_PID"
  echo "To stop backend: kill $BACKEND_PID"

  wait $BACKEND_PID 2>/dev/null
  read -p "Press Enter to continue..."
}

while true; do
  show_menu
  read -p "Please enter an option (0-5): " choice

  case "$choice" in
    1) start_backend_dev ;;
    2) start_frontend ;;
    3) start_both ;;
    4) start_backend_stage ;;
    5) start_backend_prod ;;
    0)
      echo ""
      echo "Goodbye!"
      exit 0
      ;;
    *)
      echo "Invalid option, please try again."
      sleep 1
      ;;
  esac
done
