@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Smart Kiosk Platform - DEV

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not available in PATH.
  pause & exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env not found. Please create a root .env file first.
  pause & exit /b 1
)

echo Syncing .env to all project directories...
node scripts\sync-env.mjs
if errorlevel 1 (
  echo [ERROR] Failed to sync .env files.
  pause & exit /b 1
)

:: Install dependencies if node_modules missing
if not exist "kiosk_api\node_modules" (
  echo Installing kiosk_api dependencies...
  cd kiosk_api && npm install && cd ..
) else if not exist "kiosk_api\node_modules\.prisma" (
  echo Generating Prisma client...
  cd kiosk_api && npx prisma generate && cd ..
)
if not exist "kiosk_cms\node_modules" (
  echo Installing kiosk_cms dependencies...
  cd kiosk_cms && npm install && cd ..
)
if not exist "kiosk_client\node_modules" (
  echo Installing kiosk_client dependencies...
  cd kiosk_client && npm install && cd ..
)

:: Clear stale Next.js build caches to prevent chunk mismatch errors
if exist "kiosk_cms\.next"    rmdir /s /q "kiosk_cms\.next"
if exist "kiosk_client\.next" rmdir /s /q "kiosk_client\.next"

echo.
echo Starting all services...
start "kiosk_api"    cmd /k "cd /d "%~dp0kiosk_api"    && npm run dev"
start "kiosk_cms"    cmd /k "cd /d "%~dp0kiosk_cms"    && npm run dev"
start "kiosk_client" cmd /k "cd /d "%~dp0kiosk_client" && npm run dev"

echo.
echo   kiosk_api    -^> http://localhost:4000
echo   kiosk_cms    -^> http://localhost:3001
echo   kiosk_client -^> http://localhost:3000
echo.
pause >nul
