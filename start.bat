@echo off
title Face Recognition Clock - Starting...

:: Get the directory where this bat file is located
set "SCRIPT_DIR=%~dp0"

:: Change to the script directory
cd /d "%SCRIPT_DIR%"

echo ========================================
echo   Face Recognition Clock System
echo   Starting servers...
echo ========================================
echo.

:: Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "client\node_modules" (
    echo [INFO] Installing client dependencies...
    cd client
    call npm install
    cd ..
)

if not exist "server\node_modules" (
    echo [INFO] Installing server dependencies...
    cd server
    call npm install
    cd ..
)

echo.
echo [INFO] Starting backend server...
start "Backend Server (Port 5000)" cmd /k "cd /d "%SCRIPT_DIR%server" && npm start"

timeout /t 2 /nobreak >nul

echo [INFO] Starting frontend client...
start "Frontend Client (Port 3000)" cmd /k "cd /d "%SCRIPT_DIR%client" && npm run dev"

echo.
echo ========================================
echo   Servers are starting...
echo.
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:3000
echo.
echo   Access the app at: http://localhost:3000
echo ========================================
echo.
echo Press any key to exit this window...
pause >nul
