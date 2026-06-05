@echo off
setlocal

REM Smart Reader Desktop launcher (Tauri 2 + FastAPI backend)
set ROOT_DIR=%~dp0
set BACKEND_DIR=%ROOT_DIR%backend
set FRONTEND_DIR=%ROOT_DIR%frontend

if /I "%~1"=="--check" goto check_only

echo ========================================
echo    Smart Reader Desktop Launcher
echo ========================================
echo.

call :check_requirements
if errorlevel 1 (
    echo.
    echo Startup checks failed.
    exit /b 1
)

echo.
echo Starting backend server in a new terminal...
start "Smart Reader Backend" cmd /k "cd /d %BACKEND_DIR% && call fresh_env\Scripts\activate.bat && python run_dev.py"

echo Waiting for backend boot...
timeout /t 3 /nobreak >nul

echo.
echo Starting Tauri desktop app...
cd /d "%FRONTEND_DIR%"
npm run tauri:dev

exit /b %errorlevel%

:check_only
call :check_requirements
exit /b %errorlevel%

:check_requirements
if not exist "%BACKEND_DIR%\run_dev.py" (
    echo Error: backend run file not found at %BACKEND_DIR%\run_dev.py
    exit /b 1
)

if not exist "%BACKEND_DIR%\fresh_env\Scripts\activate.bat" (
    echo Error: backend virtual environment activation script not found.
    echo Expected: %BACKEND_DIR%\fresh_env\Scripts\activate.bat
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo Error: frontend package.json not found at %FRONTEND_DIR%\package.json
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo Error: npm is not available in PATH.
    exit /b 1
)

echo Basic checks passed.
echo Note: Ensure frontend dependencies are installed and Tauri CLI is available.
echo       Run: cd frontend ^&^& npm install
echo Note: Tauri desktop launch requires Rust toolchain (rustup/rustc/cargo).
exit /b 0
