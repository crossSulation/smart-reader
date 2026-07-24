#!/bin/bash
# Smart Reader Backend 启动脚本

echo "Starting Smart Reader Backend..."
echo ""

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# 激活虚拟环境
source fresh_env/bin/activate

if [ $? -ne 0 ]; then
  echo "Error: Could not activate virtual environment"
  read -p "Press Enter to continue..."
  exit 1
fi

echo "Virtual environment activated."
echo ""

# 运行开发服务器
echo "Starting FastAPI server..."
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
