@echo off
setlocal
cd /d "%~dp0"

echo [AutoTrans Pro - Test Version] Server is starting on PORT 3010...

if not exist ".env" (
    echo [System] Error: .env file is missing!
    pause
    exit /b
)

echo [System] Opening browser and starting test server...
start http://localhost:3010
node server.js

pause
