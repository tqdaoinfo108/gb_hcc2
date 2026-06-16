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
:: automation-core holds the Playwright + WebRTC engine. There is no separate
:: recorder/sidecar process any more — the Tauri shell spawns automation-core's
:: engine (bin/engine.js) as a child over stdio when you run `npm run tauri:dev`.
:: We still install it so Chromium + @roamhq/wrtc are ready for that engine.
if not exist "automation-core\node_modules" (
  echo Installing automation-core dependencies + Chromium...
  cd automation-core && npm install && npx playwright install chromium && cd ..
)

:: Clear stale Next.js build caches to prevent chunk mismatch errors
if exist "kiosk_cms\.next"    rmdir /s /q "kiosk_cms\.next"
if exist "kiosk_client\.next" rmdir /s /q "kiosk_client\.next"

:: Free dev ports so a stale dev server doesn't block a clean start.
echo.
echo Freeing dev ports (3000 3001 3002)...
for %%p in (3000 3001 3002) do (
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%p " ^| findstr LISTENING') do (
    echo   port %%p held by PID %%a - killing
    taskkill /F /PID %%a >nul 2>nul
  )
)
:: Give the OS a moment to release the sockets before re-binding.
ping -n 2 127.0.0.1 >nul

echo.
echo Starting all services...
start "kiosk_api"    cmd /k "cd /d "%~dp0kiosk_api"    && npm run dev"
start "kiosk_cms"    cmd /k "cd /d "%~dp0kiosk_cms"    && npm run dev"
:: kiosk_client chạy qua Tauri shell — Next dev server được Tauri khởi động nội bộ.
:: Recorder, executor, và automation-core engine đều chạy trong cùng tiến trình này.
start "kiosk_client (Tauri)" cmd /k "cd /d "%~dp0kiosk_client" && npm run tauri:dev"

echo.
echo   kiosk_api    -^> http://localhost:3001
echo   kiosk_cms    -^> http://localhost:3002  (workflow editor)
echo   kiosk_client -^> Tauri desktop app  (Next.js served nội bộ trên :3000)
echo.
echo   Recorder: gõ Ctrl+Alt+Shift+R trong cửa sổ Tauri, hoặc tap 5 lần góc trên-trái.
echo   Dev overlay (Ctrl+Alt+F2) CHỈ hoạt động trên browser, không phải Tauri.
echo.
pause >nul
