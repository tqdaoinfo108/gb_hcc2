[CmdletBinding()]
param(
  [string]$OutputDir,
  [switch]$IncludeNodeModules,
  [string]$ReleaseApiUrl,
  [string]$ReleaseWsUrl
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $OutputDir) {
  $OutputDir = Join-Path $Root "deploy\hcc-server-release"
}
$OutputDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$WorkDir,
    [Parameter(Mandatory = $true)][string]$Command
  )
  Push-Location $WorkDir
  try {
    Write-Host ">> $Command" -ForegroundColor Cyan
    cmd.exe /c $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
  } finally {
    Pop-Location
  }
}

function New-CleanDir {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-FileIfExists {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (Test-Path $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
}

function Copy-DirIfExists {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (Test-Path $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
}

function Copy-AppRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Directories,
    [string[]]$Files = @("package.json", "package-lock.json")
  )

  $SourceRoot = Join-Path $Root $Name
  $TargetRoot = Join-Path $OutputDir $Name
  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

  foreach ($file in $Files) {
    Copy-FileIfExists (Join-Path $SourceRoot $file) (Join-Path $TargetRoot $file)
  }
  foreach ($directory in $Directories) {
    Copy-DirIfExists (Join-Path $SourceRoot $directory) (Join-Path $TargetRoot $directory)
  }
  Copy-FileIfExists (Join-Path $Root ".env") (Join-Path $TargetRoot ".env")

  if ($IncludeNodeModules) {
    Copy-DirIfExists (Join-Path $SourceRoot "node_modules") (Join-Path $TargetRoot "node_modules")
  }
}

Write-Host "== Smart Kiosk Windows Server release package ==" -ForegroundColor Green
Write-Host "Root:    $Root"
Write-Host "Output:  $OutputDir"
Write-Host "Modules: $(if ($IncludeNodeModules) { 'included' } else { 'not included' })"

# --- resolve production API URL for this release ---
# Priority: param → TAURI_API_URL in .env → fallback localhost
if (-not $ReleaseApiUrl -or -not $ReleaseWsUrl) {
  $envContent = Get-Content (Join-Path $Root ".env") -Raw -ErrorAction SilentlyContinue
  if (-not $ReleaseApiUrl -and $envContent -match '(?m)^TAURI_API_URL=(.+)') {
    $ReleaseApiUrl = $Matches[1].Trim()
  }
  if (-not $ReleaseWsUrl -and $envContent -match '(?m)^TAURI_WS_URL=(.+)') {
    $ReleaseWsUrl = $Matches[1].Trim()
  }
}
if (-not $ReleaseApiUrl) { $ReleaseApiUrl = "http://localhost:3001" }
if (-not $ReleaseWsUrl)  { $ReleaseWsUrl  = $ReleaseApiUrl }

Write-Host "Release API URL : $ReleaseApiUrl" -ForegroundColor Yellow
Write-Host "Release WS URL  : $ReleaseWsUrl"  -ForegroundColor Yellow

# Set NEXT_PUBLIC_* so Next.js bakes the production URL into the bundle
$env:NEXT_PUBLIC_API_URL = $ReleaseApiUrl
$env:NEXT_PUBLIC_WS_URL  = $ReleaseWsUrl

Invoke-Checked $Root "node scripts\sync-env.mjs"
Invoke-Checked (Join-Path $Root "packages\shared-types") "npm run build"
Invoke-Checked (Join-Path $Root "kiosk_api") "npm run build"
Invoke-Checked (Join-Path $Root "kiosk_cms") "npm run build"
Invoke-Checked (Join-Path $Root "kiosk_client") "npm run build"

# Restore so subsequent local-dev commands are not affected
Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
Remove-Item Env:NEXT_PUBLIC_WS_URL  -ErrorAction SilentlyContinue

New-CleanDir $OutputDir
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDir "logs") | Out-Null

Copy-FileIfExists (Join-Path $Root ".env") (Join-Path $OutputDir ".env")
Copy-FileIfExists (Join-Path $Root ".env.example") (Join-Path $OutputDir ".env.example")

Copy-AppRuntime "kiosk_api" @("dist", "prisma", "uploads")
Copy-AppRuntime "kiosk_cms" @(".next", "public", "prisma") @("package.json", "package-lock.json", "next.config.ts")
Copy-AppRuntime "kiosk_client" @(".next", "public") @("package.json", "package-lock.json", "next.config.ts", "device.json")
Copy-AppRuntime "kiosk_runner" @("src")

$SharedTarget = Join-Path $OutputDir "packages\shared-types"
New-Item -ItemType Directory -Force -Path $SharedTarget | Out-Null
Copy-FileIfExists (Join-Path $Root "packages\shared-types\package.json") (Join-Path $SharedTarget "package.json")
Copy-DirIfExists (Join-Path $Root "packages\shared-types\dist") (Join-Path $SharedTarget "dist")
if ($IncludeNodeModules) {
  Copy-DirIfExists (Join-Path $Root "packages\shared-types\node_modules") (Join-Path $SharedTarget "node_modules")
}

$InstallDeps = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not available in PATH.
  pause
  exit /b 1
)

echo Installing runtime dependencies. This is only needed once per server/update.

echo.
echo [1/4] Backend dependencies
cd /d "%~dp0kiosk_api"
call npm ci
if errorlevel 1 exit /b 1

echo.
echo [2/4] CMS dependencies
cd /d "%~dp0kiosk_cms"
call npm ci
if errorlevel 1 exit /b 1

echo.
echo [3/4] Client dependencies
cd /d "%~dp0kiosk_client"
call npm ci
if errorlevel 1 exit /b 1

echo.
echo [4/4] Runner dependencies and browser
cd /d "%~dp0kiosk_runner"
call npm ci
if errorlevel 1 exit /b 1
call npx playwright install chromium
if errorlevel 1 exit /b 1

echo.
echo Dependencies are ready.
pause
'@
Set-Content -Path (Join-Path $OutputDir "install-deps.bat") -Value $InstallDeps -Encoding ASCII

$RunBackend = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0kiosk_api"
set API_PORT=3001
echo [backend] Syncing Prisma client with schema...
call npx prisma generate --schema=prisma/schema.prisma
echo [backend] Applying pending DB migrations...
call npx prisma migrate deploy --schema=prisma/schema.prisma
echo [backend] Starting API...
node dist/main.js
'@
Set-Content -Path (Join-Path $OutputDir "run-backend.bat") -Value $RunBackend -Encoding ASCII

$RunCms = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0kiosk_cms"
echo [cms] Syncing Prisma client with schema...
call npx prisma generate --schema=prisma/schema.prisma
echo [cms] Starting Admin CMS...
npm run start
'@
Set-Content -Path (Join-Path $OutputDir "run-cms.bat") -Value $RunCms -Encoding ASCII

$RunClient = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0kiosk_client"
npm run start
'@
Set-Content -Path (Join-Path $OutputDir "run-client.bat") -Value $RunClient -Encoding ASCII

$RunRunner = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0kiosk_runner"
set API_BASE=http://localhost:3001
set RUNNER_ID=runner-01
set BROWSER_MODE=hidden
npm start
'@
Set-Content -Path (Join-Path $OutputDir "run-runner.bat") -Value $RunRunner -Encoding ASCII

$StartAll = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "logs" mkdir logs

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not available in PATH.
  pause
  exit /b 1
)

if not exist "kiosk_api\node_modules" (
  echo [INFO] node_modules not found. Running install-deps.bat first...
  call "%~dp0install-deps.bat"
  if errorlevel 1 exit /b 1
)

set API_PORT=3001
set CMS_PORT=3002
set KIOSK_PORT=3000
set API_BASE=http://localhost:3001
set RUNNER_ID=runner-01
set BROWSER_MODE=hidden

echo Starting Smart Kiosk services...
echo Backend    : http://localhost:3001
echo Admin CMS  : http://localhost:3002
echo Client     : http://localhost:3000
echo Runner     : runner-01
echo.

start "HCC Backend :3001" cmd /k call "%~dp0run-backend.bat"
timeout /t 3 /nobreak >nul
start "HCC Admin CMS :3002" cmd /k call "%~dp0run-cms.bat"
start "HCC Client :3000" cmd /k call "%~dp0run-client.bat"
start "HCC Runner" cmd /k call "%~dp0run-runner.bat"

echo All services launched. Use stop-all.bat to stop ports 3000, 3001, 3002 and the runner.
pause
'@
Set-Content -Path (Join-Path $OutputDir "start-all.bat") -Value $StartAll -Encoding ASCII

$StopAll = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo Stopping Smart Kiosk services...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(3000,3001,3002); foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { if ($_ -and $_ -ne 0) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -match 'kiosk_runner|src[/\\]runner\.js') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Done.
pause
'@
Set-Content -Path (Join-Path $OutputDir "stop-all.bat") -Value $StopAll -Encoding ASCII

$Readme = @"
Smart Kiosk Windows Server Release
==================================

Ports:
- Backend API: http://localhost:3001
- Admin CMS:   http://localhost:3002
- Client:      http://localhost:3000
- Runner:      runner-01, API_BASE=http://localhost:3001

Deploy nhanh:
1. Build local:
   powershell -ExecutionPolicy Bypass -File scripts\package-windows-server-release.ps1

2. Copy cả thư mục này lên server:
   $OutputDir

3. Trên server bấm:
   start-all.bat

Nếu server không có mạng hoặc muốn copy lên là chạy ngay:
   powershell -ExecutionPolicy Bypass -File scripts\package-windows-server-release.ps1 -IncludeNodeModules

Yêu cầu server:
- Windows Server / Windows 10+
- Node.js đúng major version với máy build
- Playwright Chromium sẽ được cài ở lần đầu nếu chưa copy node_modules/browser

Config:
- Sửa file .env trong thư mục release nếu cần đổi DB, MinIO, domain hoặc secret.
- DB và MinIO hiện được copy từ .env local.

Dừng dịch vụ:
   stop-all.bat
"@
Set-Content -Path (Join-Path $OutputDir "README_DEPLOY.txt") -Value $Readme -Encoding UTF8

Write-Host ""
Write-Host "Release package is ready:" -ForegroundColor Green
Write-Host "  $OutputDir"
Write-Host ""
Write-Host "Server entry point:" -ForegroundColor Green
Write-Host "  start-all.bat"
