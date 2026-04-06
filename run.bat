@echo off
setlocal
cd /d "%~dp0"

echo [AutoTrans Pro] Server is starting...

if not exist "node_modules" (
    echo [System] Installing dependencies...
    cmd /c npm install
)

echo [System] Opening browser and starting server...
start http://localhost:3008
npm start

pause
