param([switch]$Demo, [switch]$Empty, [string]$Database)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $Database) {
    $Database = if ($env:FLAGMAN_DB) { $env:FLAGMAN_DB } else {
        Join-Path $root $(if ($Demo) { 'backend\data\demo\flagman.db' } else { 'backend\data\production\flagman.db' })
    }
}
$databasePath = [IO.Path]::GetFullPath($Database)
$mode = if ($Demo -and -not $Empty) { 'demo' } else { 'empty' }
$sdk = if (Test-Path -LiteralPath "$root\.tools\dotnet\dotnet.exe") { "$root\.tools\dotnet\dotnet.exe" } else { 'dotnet' }
Write-Output "Reset target: $databasePath ($mode). The server must be stopped."
& $sdk build "$root\tools\Flagman.Maintenance\Flagman.Maintenance.csproj" -c Release --nologo
if ($LASTEXITCODE) { throw 'Maintenance build failed; database was not reset.' }
& $sdk "$root\tools\Flagman.Maintenance\bin\Release\net8.0\Flagman.Maintenance.dll" reset $databasePath $mode
if ($LASTEXITCODE) { throw 'Database reset failed. See the error above.' }
