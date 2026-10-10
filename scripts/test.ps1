$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$sdk = if (Test-Path -LiteralPath '.tools\dotnet\dotnet.exe') { '.tools\dotnet\dotnet.exe' } else { 'dotnet' }
& $sdk run --project tests/Flagman.Tests.csproj
if ($LASTEXITCODE) { throw 'Domain / SQLite checks failed' }
Push-Location frontend
try { & npm.cmd run build; if ($LASTEXITCODE) { throw 'Frontend build failed' } } finally { Pop-Location }
Write-Output 'For E2E, start a fresh demo database, then run npm run test:e2e in frontend with the same FLAGMAN_PASSWORD.'
