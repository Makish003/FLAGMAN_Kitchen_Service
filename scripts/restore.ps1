param([Parameter(Mandatory=$true)][string]$Backup,[Parameter(Mandatory=$true)][string]$NewDatabase,[Parameter(Mandatory=$true)][string]$CurrentDatabase)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$sdk=if(Test-Path "$root/.tools/dotnet/dotnet.exe"){ "$root/.tools/dotnet/dotnet.exe" }else{'dotnet'}
$maintenance=if(Test-Path "$root/maintenance/Flagman.Maintenance.dll"){ "$root/maintenance/Flagman.Maintenance.dll" }else{ "$root/tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll" }
if(Test-Path -LiteralPath $NewDatabase){throw 'Restore requires a new path'}
$pre=([IO.Path]::GetFullPath($CurrentDatabase))+'.before-restore-'+[guid]::NewGuid().ToString('N')+'.db'
& $sdk $maintenance backup $CurrentDatabase $pre
if($LASTEXITCODE){throw 'Pre-restore backup failed'}
& $sdk $maintenance restore $Backup $NewDatabase
if($LASTEXITCODE){throw 'Restore failed; keep current database'}
Write-Output "Verified restore: $NewDatabase. Stop the API before switching FLAGMAN_DB; use new keys and increment FLAGMAN_SESSION_VERSION."
