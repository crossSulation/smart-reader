@echo off
REM Smart Reader Frontend 启动脚本
REM 切换到frontend目录

echo Starting Smart Reader Frontend...
echo.

REM 切换到脚本所在目录
cd /d %~dp0

REM 检查是否在项目目录中
if not exist "package.json" (
    echo Error: package.json not found in current directory
    echo Please run this script from the frontend directory
    pause
    exit /b 1
)

REM 安装依赖（如果需要）
echo Installing frontend dependencies...
yarn install --frozen-lockfile

if errorlevel 1 (
    echo Warning: yarn install failed, continuing anyway...
)

echo.
echo Starting React development server...
yarn dev

pause