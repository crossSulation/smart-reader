#!/bin/bash
# Smart Reader Frontend 启动脚本

echo "Starting Smart Reader Frontend..."
echo ""

# 切换到脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# 检查是否在项目目录中
if [ ! -f "package.json" ]; then
  echo "Error: package.json not found in current directory"
  echo "Please run this script from the frontend directory"
  read -p "Press Enter to continue..."
  exit 1
fi

# 安装依赖（如果需要）
echo "Installing frontend dependencies..."
yarn install --frozen-lockfile

if [ $? -ne 0 ]; then
  echo "Warning: yarn install failed, continuing anyway..."
fi

echo ""
echo "Starting React development server..."
yarn dev
