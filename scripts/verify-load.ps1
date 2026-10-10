param([Parameter(Mandatory=$true)][string]$Artifact,[ValidateRange(1,5)][int]$Operators=5,[ValidateRange(1,10)][int]$Runs=3,[switch]$WithPlanner,[string]$DataDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
$app=(Resolve-Path -LiteralPath $Artifact).Path
$sdk=if(Test-Path '.tools/dotnet/dotnet.exe'){(Resolve-Path '.tools/dotnet/dotnet.exe').Path}else{'dotnet'}
$run=Join-Path $root ('test-results/load-matrix-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory $run|Out-Null
$dataRun=$run
if($DataDirectory){$dataRun=Join-Path ([IO.Path]::GetFullPath($DataDirectory)) ([IO.Path]::GetFileName($run));New-Item -ItemType Directory $dataRun|Out-Null}
$names=@('FLAGMAN_PASSWORD','FLAGMAN_DB','FLAGMAN_DEMO','ASPNETCORE_ENVIRONMENT','BASE_URL','FLAGMAN_LOAD_ACTIVE','FLAGMAN_LOAD_OPERATORS','FLAGMAN_LOAD_PLANNER')
$saved=@{};foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name)}
$results=@();$server=$null
try{
 $env:FLAGMAN_PASSWORD=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N');$env:FLAGMAN_DEMO='false';$env:ASPNETCORE_ENVIRONMENT='Development'
 $env:FLAGMAN_LOAD_ACTIVE='1000';$env:FLAGMAN_LOAD_OPERATORS=[string]$Operators;$env:FLAGMAN_LOAD_PLANNER=if($WithPlanner){'true'}else{'false'}
 for($i=1;$i -le $Runs;$i++){
  $env:FLAGMAN_DB=Join-Path $dataRun "run-$i.db"
  & $sdk 'tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll' fixture $env:FLAGMAN_DB *> (Join-Path $run "fixture-$i.log")
  if($LASTEXITCODE){throw 'Fixture failed'}
  $listener=New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop();$env:BASE_URL="http://127.0.0.1:$port"
  $server=Start-Process -FilePath $sdk -ArgumentList @((Join-Path $app 'Flagman.Api.dll'),'--urls',$env:BASE_URL) -WorkingDirectory $app -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run "server-$i.log") -RedirectStandardError (Join-Path $run "errors-$i.log")
  $ready=$false
  for($n=0;$n -lt 60;$n++){if($server.HasExited){throw 'Server exited'};& node -e "fetch(process.argv[1]+'/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" $env:BASE_URL;if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 500}
  if(-not $ready){throw 'Readiness timed out'}
  $preference=$ErrorActionPreference;try{$ErrorActionPreference='Continue';& node 'scripts/load-check.cjs' 2>&1|Tee-Object -FilePath (Join-Path $run "load-$i.log");$loadExit=$LASTEXITCODE}finally{$ErrorActionPreference=$preference}
  & $sdk 'tools/Flagman.Maintenance/bin/Release/net8.0/Flagman.Maintenance.dll' verify $env:FLAGMAN_DB *> (Join-Path $run "integrity-$i.log")
  $integrityExit=$LASTEXITCODE
  $results+=@{run=$i;loadExit=$loadExit;integrityExit=$integrityExit;operators=$Operators;optimizer=[bool]$WithPlanner}
  Stop-Process -Id $server.Id;$server.WaitForExit();$server=$null
 }
 $results|ConvertTo-Json|Set-Content (Join-Path $run 'RESULTS.json')
 Write-Output "Evidence: $run"
 if(@($results|Where-Object {$_.loadExit -ne 0 -or $_.integrityExit -ne 0}).Count){throw 'One or more load targets failed; all measurements retained'}
}finally{if($server -and -not $server.HasExited){Stop-Process -Id $server.Id;$server.WaitForExit()};foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name])}}
