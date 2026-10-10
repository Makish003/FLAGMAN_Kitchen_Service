param([Parameter(Mandatory=$true)][string]$Database,[Parameter(Mandatory=$true)][string]$Directory,[int]$Daily=7,[int]$Weekly=4)
$ErrorActionPreference='Stop'
if($Daily -lt 1 -or $Weekly -lt 1){throw 'Retention must be positive'}
$root=Split-Path $PSScriptRoot -Parent
$sdk=if(Test-Path "$root/.tools/dotnet/dotnet.exe"){ "$root/.tools/dotnet/dotnet.exe" }else{'dotnet'}
$maintenance=if(Test-Path "$root/maintenance/Flagman.Maintenance.dll"){ "$root/maintenance/Flagman.Maintenance.dll" }else{ "$root/tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll" }
$backupRoot=[IO.Path]::GetFullPath($Directory);New-Item -ItemType Directory -Force $backupRoot|Out-Null
$target=Join-Path $backupRoot ('daily-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6)+'.db')
& $sdk $maintenance backup $Database $target
if($LASTEXITCODE){throw 'Backup failed; existing copies retained'}
if((Get-Date).DayOfWeek -eq 'Sunday'){Copy-Item -LiteralPath $target -Destination (Join-Path $backupRoot ('weekly-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.db'))}
foreach($policy in @(@('daily-*.db',$Daily),@('weekly-*.db',$Weekly))){
  Get-ChildItem -LiteralPath $backupRoot -Filter $policy[0] -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip $policy[1] | ForEach-Object {
    if([IO.Path]::GetDirectoryName($_.FullName) -ne $backupRoot){throw 'Unsafe retention path'}
    Remove-Item -LiteralPath $_.FullName
  }
}
Write-Output "Verified backup: $target"
