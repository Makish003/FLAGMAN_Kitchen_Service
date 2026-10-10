param([switch]$Demo, [int]$Port = 5080)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $env:FLAGMAN_PASSWORD -or $env:FLAGMAN_PASSWORD.Length -lt 10) { throw 'Set FLAGMAN_PASSWORD (at least 10 characters) before starting.' }
$localSdk = Join-Path (Get-Location) '.tools\dotnet\dotnet.exe'
$sdk = if (Test-Path -LiteralPath $localSdk) { $localSdk } else { 'dotnet' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
if (-not (Test-Path -LiteralPath 'frontend\node_modules')) {
    Push-Location frontend
    try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci failed' } } finally { Pop-Location }
}
Push-Location frontend
try { & npm.cmd run build; if ($LASTEXITCODE) { throw 'Frontend build failed' } } finally { Pop-Location }
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:FLAGMAN_DEMO = if ($Demo) { 'true' } else { 'false' }
if (-not $env:FLAGMAN_DB) { $env:FLAGMAN_DB = Join-Path (Get-Location) $(if ($Demo) { 'backend/data/demo/flagman.db' } else { 'backend/data/production/flagman.db' }) }
& $sdk run --project backend/Flagman.Api.csproj --urls "http://127.0.0.1:$Port"
exit $LASTEXITCODE
