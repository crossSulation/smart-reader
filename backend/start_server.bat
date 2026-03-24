@echo off
REM Smart Reader Backend 启动脚本
REM 切换到backend目录

echo Starting Smart Reader Backend...
echo.

REM 切换到脚本所在目录
cd /d %~dp0

REM 激活虚拟环境
call fresh_env\Scripts\activate.bat

if errorlevel 1 (
    echo Error: Could not activate virtual environment
    pause
    exit /b 1
)

echo Virtual environment activated.
echo.

REM 运行开发服务器
echo Starting FastAPI server...
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause