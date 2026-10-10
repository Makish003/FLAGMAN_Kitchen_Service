param([Parameter(Mandatory=$true)][string]$Evidence,[string]$Version='1.1.0-rc1')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$evidencePath=(Resolve-Path -LiteralPath $Evidence).Path
if(-not(Test-Path -LiteralPath (Join-Path $evidencePath 'RESULT.txt'))){throw 'Successful full verification evidence required'}
if($Version -notmatch '^[a-zA-Z0-9.-]+$'){throw 'Invalid version'}
$target=Join-Path $root ('output/flagman-'+$Version+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $target|Out-Null
Copy-Item -LiteralPath (Join-Path $evidencePath 'app') -Destination (Join-Path $target 'app') -Recurse
$sdk=if(Test-Path "$root/.tools/dotnet/dotnet.exe"){ "$root/.tools/dotnet/dotnet.exe" }else{'dotnet'}
& $sdk publish "$root/tools/Flagman.Maintenance/Flagman.Maintenance.csproj" -c Release --no-restore -o (Join-Path $target 'maintenance')
if($LASTEXITCODE){throw 'Maintenance publish failed'}
New-Item -ItemType Directory -Path (Join-Path $target 'docs')|Out-Null
Copy-Item -LiteralPath "$root/docs/RUNBOOK.md","$root/docs/OPERATOR.md","$root/docs/DESIGN_APPLICATION.md","$root/docs/PRODUCT_TASKS.md","$root/docs/PRODUCT_VERIFICATION.md" -Destination (Join-Path $target 'docs')
New-Item -ItemType Directory -Path (Join-Path $target 'scripts')|Out-Null
Copy-Item -LiteralPath "$root/scripts/backup.ps1","$root/scripts/restore.ps1" -Destination (Join-Path $target 'scripts')
@{version=$Version;schema=2;verifiedEvidence=[IO.Path]::GetFileName($evidencePath);createdUtc=[DateTime]::UtcNow.ToString('o');dockerVerified=$false;pilotActiveBatches=1000;pilotConcurrentWriters=1}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $target 'release.json')
$unsafe=Get-ChildItem -LiteralPath $target -Recurse -File|Where-Object { $_.Extension -in @('.db','.db-wal','.db-shm') -or $_.Name -like 'key-*.xml' -or $_.Name -eq '.env' }
if($unsafe){throw 'Private data detected; package refused'}
$zip=$target+'.zip'
Compress-Archive -Path "$target/*" -DestinationPath $zip
$hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
"$hash  $([IO.Path]::GetFileName($zip))"|Set-Content -LiteralPath ($zip+'.sha256')
Write-Output "Artifact: $zip"
Write-Output "SHA256: $hash"
