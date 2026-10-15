param([switch]$Full)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskDotnet=if(Test-Path '.tools/dotnet/dotnet.exe'){(Resolve-Path '.tools/dotnet/dotnet.exe').Path}else{'dotnet'}
$taskRun=Join-Path (Get-Location) ('test-results/external-workflows-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRun | Out-Null
$taskNames=@('FLAGMAN_PASSWORD','FLAGMAN_TEST_PASSWORD','FLAGMAN_DB','FLAGMAN_DEMO','ASPNETCORE_ENVIRONMENT','ASPNETCORE_URLS','BASE_URL','FLAGMAN_BROWSER','Logging__EventLog__LogLevel__Default')
$taskPrevious=@{};foreach($taskName in $taskNames){$taskPrevious[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process')}
function Check-Exit([string]$step){if($LASTEXITCODE -ne 0){throw "$step failed (exit $LASTEXITCODE). Evidence: $taskRun"}}
function Run-Browser([string]$name,[bool]$demo,[string[]]$specs){
 $taskListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$taskListener.Start();$taskPort=$taskListener.LocalEndpoint.Port;$taskListener.Stop()
 $taskFolder=Join-Path $taskRun $name;New-Item -ItemType Directory -Path $taskFolder | Out-Null
 $env:FLAGMAN_PASSWORD=[Guid]::NewGuid().ToString();$env:FLAGMAN_TEST_PASSWORD=$env:FLAGMAN_PASSWORD
 $env:FLAGMAN_DB=Join-Path $taskFolder 'isolated.db';$env:FLAGMAN_DEMO=if($demo){'true'}else{'false'}
 $env:ASPNETCORE_ENVIRONMENT='Development';$env:ASPNETCORE_URLS="http://localhost:$taskPort";$env:BASE_URL=$env:ASPNETCORE_URLS
 # Avoid Windows EventLog access in restricted local verification processes.
 $env:Logging__EventLog__LogLevel__Default='None'
 if(!$env:FLAGMAN_BROWSER -and (Test-Path '.tools/browsers/chromium-1248/chrome-win64/chrome.exe')){$env:FLAGMAN_BROWSER=(Resolve-Path '.tools/browsers/chromium-1248/chrome-win64/chrome.exe').Path}
 $taskContent=(Resolve-Path 'backend').Path
 $taskProcess=Start-Process -FilePath $taskDotnet -ArgumentList @('backend/bin/Debug/net8.0/Flagman.Api.dll','--contentRoot',('"'+$taskContent+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskFolder 'server.log') -RedirectStandardError (Join-Path $taskFolder 'server-error.log')
 try{
  $taskReady=$false;for($taskAttempt=0;$taskAttempt -lt 60;$taskAttempt++){try{Invoke-RestMethod "$env:BASE_URL/api/ready" | Out-Null;$taskReady=$true;break}catch{Start-Sleep -Milliseconds 250}}
  if(!$taskReady){throw "$name server did not become ready"}
  & npm.cmd --prefix frontend run test:e2e -- @specs --output (Join-Path $taskFolder 'browser') 2>&1 | Tee-Object (Join-Path $taskFolder 'browser.log');Check-Exit $name
 }finally{if(!$taskProcess.HasExited){Stop-Process -Id $taskProcess.Id}}
}
try{
 & $taskDotnet run --project tests/Flagman.Tests.csproj 2>&1 | Tee-Object (Join-Path $taskRun 'domain.log');Check-Exit 'Domain runner'
 & npm.cmd --prefix frontend run build 2>&1 | Tee-Object (Join-Path $taskRun 'frontend-build.log');Check-Exit 'Frontend build'
 Run-Browser 'targeted' $true @('roles.spec.ts','authorization-paths.spec.ts','supply-workflow.spec.ts','waiter-orders.spec.ts','manual-writeoff.spec.ts','offer-publication.spec.ts','pending-actor.spec.ts','reauth-workflow.spec.ts','workflow-touch.spec.ts')
 Run-Browser 'production-onboarding' $false @('onboarding.spec.ts')
 if($Full){Run-Browser 'full' $true @()}
 Write-Output "Verification evidence: $taskRun"
}finally{foreach($taskName in $taskNames){[Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process')}}
