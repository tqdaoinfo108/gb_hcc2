# Build the kiosk MSI locally and publish it as an OTA release.
# Mirrors what the GitHub Actions pipeline does, for manual / emergency deploys.
#
#   pwsh scripts/deploy-ota.ps1 -Version 1.0.5
#   pwsh scripts/deploy-ota.ps1 -Version 1.0.5 -ApiUrl http://apihcc.gvbsoft.vn -Rollout 20
#   pwsh scripts/deploy-ota.ps1 -Version 1.0.5 -SkipBuild -MsiPath "C:\path\app.msi"
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$ApiUrl = $(if ($env:OTA_API_URL) { $env:OTA_API_URL } else { "http://apihcc.gvbsoft.vn" }),
  [string]$Token = $env:OTA_DEPLOY_TOKEN,
  [int]$Rollout = 100,
  [switch]$Mandatory,
  [switch]$NoPublish,
  [switch]$SkipBuild,
  [string]$MsiPath,
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "Missing deploy token. Pass -Token or set `$env:OTA_DEPLOY_TOKEN."
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must be semver, e.g. 1.0.5 (got '$Version')." }

if (-not $SkipBuild) {
  Write-Host "==> Stamping version $Version" -ForegroundColor Cyan
  & node (Join-Path $root "scripts/set-version.mjs") $Version
  if ($LASTEXITCODE -ne 0) { throw "set-version failed" }

  Write-Host "==> Building MSI (API: $ApiUrl)" -ForegroundColor Cyan
  Push-Location (Join-Path $root "kiosk_client")
  try {
    $env:TAURI_API_URL = $ApiUrl
    $env:TAURI_WS_URL = $ApiUrl
    $env:NEXT_PUBLIC_APP_VERSION = $Version
    cmd.exe /c "npm run tauri:build"
    if ($LASTEXITCODE -ne 0) { throw "tauri:build failed" }
  } finally { Pop-Location }
}

if (-not $MsiPath) {
  $MsiPath = (Get-ChildItem (Join-Path $root "kiosk_client/src-tauri/target/release/bundle/msi/*.msi") |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not $MsiPath -or -not (Test-Path $MsiPath)) { throw "MSI not found. Build first or pass -MsiPath." }
Write-Host "==> Package: $MsiPath" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($Notes)) { $Notes = "Manual deploy $Version" }
$publish = if ($NoPublish) { "false" } else { "true" }
$mandatoryStr = if ($Mandatory) { "true" } else { "false" }

Write-Host "==> Deploying to $ApiUrl/ota/deploy (rollout=$Rollout%, mandatory=$mandatoryStr, publish=$publish)" -ForegroundColor Cyan
& curl.exe -sS -f -X POST "$ApiUrl/ota/deploy" `
  -H "x-deploy-token: $Token" `
  -F "file=@$MsiPath;type=application/octet-stream" `
  -F "version=$Version" `
  -F "notes=$Notes" `
  -F "rolloutPercent=$Rollout" `
  -F "isMandatory=$mandatoryStr" `
  -F "publish=$publish" `
  -F "channel=STABLE" `
  -F "createdByName=Manual deploy"
if ($LASTEXITCODE -ne 0) { throw "OTA deploy request failed" }
Write-Host "`n==> Done." -ForegroundColor Green
