@echo off
setlocal EnableExtensions

:: ============================================================================
::  Smart Kiosk - Build Release
::  Theo HUONG_DAN_BUILD_RELEASE.md (muc 4 + 5 + 9).
::
::  Ket qua deu nam trong thu muc  deploy\ :
::    - deploy\hcc-server-release\   : backend (kiosk_api) + cms + client web
::    - deploy\*.msi                 : ung dung kiosk Windows (Tauri)
::
::  Cach dung:
::    build_release.bat            ->  build CA server release + MSI  (mac dinh)
::    build_release.bat server     ->  chi build ban server (3 project)
::    build_release.bat msi        ->  chi build MSI kiosk
::
::    set TAURI_API_URL=http://... & build_release.bat   (ghi de API truoc khi chay)
:: ============================================================================

cd /d "%~dp0"
title Smart Kiosk - Build Release

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

if "%TAURI_API_URL%"=="" set "TAURI_API_URL=http://apihcc.gvbsoft.vn"
if "%TAURI_WS_URL%"==""  set "TAURI_WS_URL=http://apihcc.gvbsoft.vn"

echo ============================================================
echo   Smart Kiosk - Build Release   [MODE=%MODE%]
echo     all    = server release + MSI
echo     server = chi 3 project server
echo     msi    = chi MSI kiosk
echo   API release = %TAURI_API_URL%
echo ============================================================
echo.

:: --- Kiem tra cong cu ------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay Node.js trong PATH.
  goto :fail
)

:: cargo chi can khi build MSI
if /I "%MODE%"=="server" goto :after_cargo
where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay Rust/cargo trong PATH - can de build MSI.
  goto :fail
)
:after_cargo

:: --- Cai dependency toan workspace (api/cms/client/automation-core) --------
echo [deps] npm install ^(workspace root^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] npm install that bai.
  goto :fail
)

:: ============ PHASE 1: SERVER RELEASE =====================================
if /I "%MODE%"=="msi" goto :phase_msi
echo.
echo === [SERVER] Dong goi backend + cms + client web ===
call npm run package:server
if errorlevel 1 (
  echo [ERROR] package:server that bai.
  goto :fail
)
echo [SERVER] OK -^> deploy\hcc-server-release
if /I "%MODE%"=="server" goto :done

:: ============ PHASE 2: MSI KIOSK ==========================================
:phase_msi
echo.
echo === [MSI] Build ung dung kiosk Windows ^(Tauri^) ===
pushd kiosk_client
call npm run tauri:build
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
  echo [ERROR] tauri:build that bai ^(ma loi %RC%^).
  goto :fail
)

set "MSI_DIR=kiosk_client\src-tauri\target\release\bundle\msi"
set "OUT_DIR=deploy"
if not exist "%MSI_DIR%" (
  echo [ERROR] Khong thay thu muc MSI: %MSI_DIR%
  goto :fail
)
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

set "COPIED="
for %%F in ("%MSI_DIR%\*.msi") do call :copy_one "%%~fF"
if not defined COPIED (
  echo [ERROR] Khong tim thay file .msi nao trong %MSI_DIR%
  goto :fail
)
echo [MSI] OK -^> deploy\

:: ============ DONE =========================================================
:done
echo.
echo ============================================================
echo   HOAN TAT. Ket qua trong thu muc deploy\ :
if /I not "%MODE%"=="msi"    echo     - hcc-server-release\   ^(backend + cms + client web^)
if /I not "%MODE%"=="server" echo     - *.msi                 ^(ung dung kiosk^)
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
