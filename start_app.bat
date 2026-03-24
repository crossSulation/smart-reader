@echo off
REM Smart Reader Application 启动脚本
REM 包含后端、前端或两者一起启动的选项

set BACKEND_DIR=%~dp0backend
set FRONTEND_DIR=%~dp0frontend

:menu
cls
echo ========================================
echo         Smart Reader Application
echo ========================================
echo.
echo Please choose an option:
echo.
echo 1. start Backend server (Development)
echo 2. start Frontend server
echo 3. start Both server
echo 4. start Backend server (Staging)
echo 5. start Backend server (Production)
echo 0. Exit
echo.
set /p choice="Please enter an option (0-5): "

if "%choice%"=="1" goto start_backend_dev
if "%choice%"=="2" goto start_frontend
if "%choice%"=="3" goto start_both
if "%choice%"=="4" goto start_backend_stage
if "%choice%"=="5" goto start_backend_prod
if "%choice%"=="0" goto exit
goto menu

:start_backend_dev
echo.
echo starting backend server (Development)...
echo.
cd /d "%BACKEND_DIR%"
call fresh_env\Scripts\activate.bat
python run_dev.py
pause
goto menu

:start_backend_stage
echo.
echo starting backend server (Staging)...
echo.
cd /d "%BACKEND_DIR%"
call fresh_env\Scripts\activate.bat
python run_stage.py
pause
goto menu

:start_backend_prod
echo.
echo starting backend server (Production)...
echo.
cd /d "%BACKEND_DIR%"
call fresh_env\Scripts\activate.bat
python run_prod.py
pause
goto menu

:start_frontend
echo.
echo starting frontend server ...
echo.
if not exist "%FRONTEND_DIR%" (
    echo error: frontend directory not exist: %FRONTEND_DIR%
    pause
    goto menu
)
cd /d "%FRONTEND_DIR%"
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
goto menu

:start_both
echo.
echo starting backend server (Development)...
echo.
start cmd /k "cd /d %BACKEND_DIR% && call fresh_env\Scripts\activate.bat && python run_dev.py"

timeout /t 3 /nobreak >nul

echo.
echo starting frontend server...
echo.
if not exist "%FRONTEND_DIR%" (
    echo error: frontend directory not exist: %FRONTEND_DIR%
    pause
    goto menu
)
start cmd /k "cd /d %FRONTEND_DIR% && yarn install && yarn dev"

echo.
echo Both server started successfully!
echo Backend addr: http://127.0.0.1:8000
echo Frontend addr: http://localhost:3000
echo.
pause
goto menu

:exit
echo.
echo Thinks!
exit /b