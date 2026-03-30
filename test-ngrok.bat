@echo off
title Face Recognition Clock - ngrok Testing

echo ========================================
echo   Face Recognition Clock - ngrok Test
echo ========================================
echo.

:: Check if ngrok exists
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ngrok is not installed!
    echo.
    echo Download from: https://ngrok.com/download
    echo Extract and add to PATH, or run from ngrok folder
    echo.
    pause
    exit /b 1
)

echo [INFO] Starting backend server...
start "Backend Server" cmd /k "cd server && npm start"

timeout /t 3 /nobreak >nul

echo [INFO] Starting ngrok tunnel (port 5000)...
echo.
echo A new window will open with your ngrok URL
echo Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
echo.
echo Then update client\.env with:
echo VITE_API_URL=https://YOUR-NGROK-URL.ngrok.io
echo.
echo Restart frontend with: npm run dev
echo.
pause

start ngrok http 5000

echo Press any key when ngrok is running...
pause >nul

echo.
echo ========================================
echo   Next Steps:
echo ========================================
echo.
echo 1. Copy the ngrok HTTPS URL from the new window
echo 2. Edit client\.env file
echo 3. Replace: VITE_API_URL=https://YOUR-URL.ngrok.io
echo 4. Restart frontend: cd client && npm run dev
echo 5. Access on mobile: http://YOUR-PC-IP:3000
echo.
echo ========================================
