@echo off
setlocal EnableExtensions

:: ============================================================================
::  Smart Kiosk - Build Release (MSI)
::  Theo HUONG_DAN_BUILD_RELEASE.md (muc 5 + 9):
::    - Dong bo .env
::    - Build ung dung Windows MSI (Tauri) voi API release da nhung
::    - Copy file .msi vao thu muc deploy\
::
::  Cach dung:
::    build_release.bat
::    set TAURI_API_URL=http://... & build_release.bat   (ghi de truoc khi chay)
:: ============================================================================

cd /d "%~dp0"
title Smart Kiosk - Build Release (MSI)

if "%TAURI_API_URL%"=="" set "TAURI_API_URL=http://apihcc.gvbsoft.vn"
if "%TAURI_WS_URL%"==""  set "TAURI_WS_URL=http://apihcc.gvbsoft.vn"

echo ============================================================
echo   Build MSI - Smart Government Kiosk
echo   TAURI_API_URL = %TAURI_API_URL%
echo   TAURI_WS_URL  = %TAURI_WS_URL%
echo ============================================================
echo.

:: --- 1. Kiem tra cong cu bat buoc -----------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay Node.js trong PATH.
  goto :fail
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay Rust/cargo trong PATH ^(can de build MSI^).
  goto :fail
)

:: --- 2. Dong bo .env -------------------------------------------------------
if not exist ".env" goto :skip_env
echo [1/5] Dong bo .env...
call node scripts\sync-env.mjs
if errorlevel 1 (
  echo [ERROR] sync-env that bai.
  goto :fail
)
goto :env_done
:skip_env
echo [1/5] Bo qua: khong co file .env o thu muc goc.
:env_done

:: --- 3. Cai dependency neu thieu -------------------------------------------
if exist "kiosk_client\node_modules" (
  echo [2/5] kiosk_client\node_modules da co.
) else (
  echo [2/5] Cai dependency kiosk_client...
  pushd kiosk_client
  call npm install
  popd
)

if not exist "automation-core\node_modules" (
  echo       Cai dependency automation-core + Chromium...
  pushd automation-core
  call npm install
  call npx playwright install chromium
  popd
)

:: --- 4. Build MSI ----------------------------------------------------------
echo [3/5] Build MSI ^(npm run tauri:build^)... co the mat vai phut.
pushd kiosk_client
call npm run tauri:build
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
  echo [ERROR] tauri:build that bai ^(ma loi %RC%^).
  goto :fail
)

:: --- 5. Copy MSI vao deploy\ -----------------------------------------------
set "MSI_DIR=kiosk_client\src-tauri\target\release\bundle\msi"
set "OUT_DIR=deploy"
if not exist "%MSI_DIR%" (
  echo [ERROR] Khong thay thu muc MSI: %MSI_DIR%
  goto :fail
)
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

echo [4/5] Copy file .msi vao %OUT_DIR%\ ...
set "COPIED="
for %%F in ("%MSI_DIR%\*.msi") do call :copy_one "%%~fF"
if not defined COPIED (
  echo [ERROR] Khong tim thay file .msi nao trong %MSI_DIR%
  goto :fail
)

:: --- 6. Checksum SHA256 ----------------------------------------------------
echo [5/5] SHA256 cua MSI trong %OUT_DIR%\ :
powershell -NoProfile -Command "Get-ChildItem '%OUT_DIR%\*.msi' | ForEach-Object { $h=(Get-FileHash $_.FullName -Algorithm SHA256).Hash; Write-Host ('   {0}' -f $_.Name); Write-Host ('     {0}' -f $h) }"

echo.
echo ============================================================
echo   HOAN TAT. MSI nam trong thu muc: %OUT_DIR%\
echo ============================================================
pause
exit /b 0

:copy_one
copy /Y %1 "%OUT_DIR%\" >nul
echo       - %~nx1
set "COPIED=1"
goto :eof

:fail
echo.
echo *** BUILD THAT BAI - xem thong bao loi ben tren ***
pause
exit /b 1
