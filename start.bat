@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title Smart Kiosk Platform - DEV

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not available in PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or not available in PATH.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json not found. Run this file from the project root.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env not found. This dev start uses the production DATABASE_URL from .env.
  pause
  exit /b 1
)

node scripts\start-dev.mjs
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Dev startup failed with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
