param([switch]$SkipBrowser,[ValidateRange(10,10000)][int]$ActiveBatches=1000,[ValidateRange(1,5)][int]$Operators=1)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$sdk = if (Test-Path '.tools/dotnet/dotnet.exe') { (Resolve-Path '.tools/dotnet/dotnet.exe').Path } else { 'dotnet' }
$run = Join-Path $root ('test-results/release-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Force $run | Out-Null
$names = @('FLAGMAN_PASSWORD','FLAGMAN_DB','FLAGMAN_DEMO','ASPNETCORE_ENVIRONMENT','BASE_URL','PLAYWRIGHT_BROWSERS_PATH','FLAGMAN_LOAD_ACTIVE','FLAGMAN_LOAD_OPERATORS')
$saved = @{}; foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }
$server = $null
$app = Join-Path $run 'app'
function Checked($exe, $arguments, $log) {
    $preference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; & $exe @arguments 2>&1 | Tee-Object -FilePath (Join-Path $run $log) } finally { $ErrorActionPreference = $preference }
    if ($LASTEXITCODE -ne 0) { throw "Check failed: $log" }
}
function Start-TestServer($mode) {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,0)
    $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    $env:BASE_URL = "http://127.0.0.1:$port"
    $env:FLAGMAN_DB = Join-Path $run "$mode.db"
    $env:FLAGMAN_DEMO = if ($mode -eq 'demo') { 'true' } else { 'false' }
    $env:ASPNETCORE_ENVIRONMENT = if ($mode -in @('demo','pilot')) { 'Development' } else { 'Production' }
    $script:server = Start-Process -FilePath $sdk -ArgumentList @((Join-Path $app 'Flagman.Api.dll'),'--urls',$env:BASE_URL) -WorkingDirectory $app -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run "$mode-server.log") -RedirectStandardError (Join-Path $run "$mode-errors.log")
    for ($i=0; $i -lt 60; $i++) {
        if ($server.HasExited) { throw "$mode server exited" }
        try { $ready = Invoke-RestMethod "$env:BASE_URL/api/ready"; if ($ready.status -eq 'ok') { return } } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw 'Readiness timed out'
}
try {
    $env:FLAGMAN_PASSWORD = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $env:FLAGMAN_LOAD_ACTIVE = [string]$ActiveBatches
    $env:FLAGMAN_LOAD_OPERATORS = [string]$Operators
    Checked $sdk @('run','--project','tests/Flagman.Tests.csproj','-c','Release') 'domain.log'
    Checked $sdk @('build','backend/Flagman.Api.csproj','-c','Release') 'backend.log'
    Checked $sdk @('build','tools/Flagman.Maintenance/Flagman.Maintenance.csproj','-c','Release') 'maintenance.log'
    Push-Location frontend
    try {
        if (-not (Test-Path node_modules)) { Checked 'npm.cmd' @('ci','--no-audit','--no-fund') 'npm-ci.log' }
        Checked 'npm.cmd' @('run','build') 'frontend.log'
    } finally { Pop-Location }
    Checked $sdk @('publish','backend/Flagman.Api.csproj','-c','Release','--no-restore','-o',$app) 'publish.log'
    Start-TestServer 'production'
    Checked 'node' @('scripts/production-smoke.cjs') 'production-smoke.log'
    Stop-Process -Id $server.Id; $server.WaitForExit(); $server = $null
    if (-not $SkipBrowser) {
        Start-TestServer 'pilot'
        if (Test-Path '.tools/browsers') { $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $root '.tools/browsers' }
        Push-Location frontend
        try { Checked 'npm.cmd' @('run','test:e2e','--','onboarding.spec.ts') 'onboarding.log' } finally { Pop-Location }
        Stop-Process -Id $server.Id; $server.WaitForExit(); $server = $null
    }
    Start-TestServer 'demo'
    if (-not $SkipBrowser) {
        if (Test-Path '.tools/browsers') { $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $root '.tools/browsers' }
        Push-Location frontend
        try { Checked 'npm.cmd' @('run','test:e2e') 'browser.log' } finally { Pop-Location }
    }
    Checked $sdk @('tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll','backup',$env:FLAGMAN_DB,(Join-Path $run 'backup.db')) 'backup.log'
    Checked $sdk @('tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll','restore',(Join-Path $run 'backup.db'),(Join-Path $run 'restored.db')) 'restore.log'
    Stop-Process -Id $server.Id; $server.WaitForExit(); $server = $null
    $shifted = if ($SkipBrowser) { '-' } else { Join-Path $run 'demo.db' }
    Checked 'node' @('scripts/config-check.cjs',$sdk,(Join-Path $app 'Flagman.Api.dll'),$shifted,$run) 'configuration.log'
    Checked $sdk @('tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll','fixture',(Join-Path $run 'load.db')) 'load-fixture.log'
    Start-TestServer 'load'
    Checked 'node' @('scripts/load-check.cjs') 'load.log'
    Checked $sdk @('tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll','verify',$env:FLAGMAN_DB) 'load-integrity.log'
    New-Item -ItemType Directory -Force (Join-Path $run 'screenshots') | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $root 'test-results') -Filter '*.png' -File | Copy-Item -Destination (Join-Path $run 'screenshots')
    if ($SkipBrowser) { 'Partial checks passed; browser omitted.' | Set-Content (Join-Path $run 'PARTIAL.txt') }
    else { "Local checks passed; pilot limit: $ActiveBatches active batches, $Operators concurrent operators, 10000 total batches, 100000 movements. Docker/TLS acceptance is separate." | Set-Content (Join-Path $run 'RESULT.txt') }
    Write-Output "Evidence: $run"
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id; $server.WaitForExit() }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name]) }
}
