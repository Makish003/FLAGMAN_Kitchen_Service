param([switch]$Demo, [ValidateRange(1,65535)][int]$Port = 5080)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try { $portProbe.Start() }
catch [System.Net.Sockets.SocketException] {
    if ($_.Exception.SocketErrorCode -eq [System.Net.Sockets.SocketError]::AddressAlreadyInUse) {
        Write-Host "Port $Port is already in use. Open http://127.0.0.1:$Port if the app is already running."
        Write-Host 'To restart, stop the existing server first. To use another port: .\scripts\start.cmd -Port 5081'
        exit 1
    }
    throw
}
finally { $portProbe.Stop() }
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
