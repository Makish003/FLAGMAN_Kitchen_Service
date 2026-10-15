param([switch]$Full,[switch]$BrowserOnly,[string[]]$Specs,[string]$BuildDirectory='test-results/kitchen-final-build/')
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskRun=Join-Path (Get-Location) ('test-results/kitchen-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $taskRun | Out-Null
$taskDotnet=if(Test-Path '.tools/dotnet/dotnet.exe'){(Resolve-Path '.tools/dotnet/dotnet.exe').Path}else{'dotnet'}
$taskOutput=Join-Path (Get-Location) $BuildDirectory
if(!$BrowserOnly){
& npm.cmd --prefix frontend run build 2>&1 | Tee-Object (Join-Path $taskRun 'frontend-build.log')
if($LASTEXITCODE){throw 'Frontend build failed'}
& $taskDotnet build tests/Flagman.Tests.csproj --no-restore "-p:BaseOutputPath=$taskOutput"
if($LASTEXITCODE){throw 'Build failed'}
& $taskDotnet (Join-Path $taskOutput 'Debug/net8.0/Flagman.Tests.dll') 2>&1 | Tee-Object (Join-Path $taskRun 'domain.log')
if($LASTEXITCODE){throw 'Domain checks failed'}
}
$taskNames=@('FLAGMAN_PASSWORD','FLAGMAN_TEST_PASSWORD','FLAGMAN_DB','FLAGMAN_DEMO','ASPNETCORE_ENVIRONMENT','ASPNETCORE_URLS','BASE_URL','FLAGMAN_BROWSER','Logging__EventLog__LogLevel__Default')
$taskPrevious=@{};foreach($taskName in $taskNames){$taskPrevious[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process')}
$taskProcess=$null
try{
 $taskListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$taskListener.Start();$taskPort=$taskListener.LocalEndpoint.Port;$taskListener.Stop()
 $env:FLAGMAN_PASSWORD=[Guid]::NewGuid().ToString();$env:FLAGMAN_TEST_PASSWORD=$env:FLAGMAN_PASSWORD
 $env:FLAGMAN_DB=Join-Path $taskRun 'isolated.db';$env:FLAGMAN_DEMO='true'
 $env:ASPNETCORE_ENVIRONMENT='Development';$env:ASPNETCORE_URLS="http://127.0.0.1:$taskPort";$env:BASE_URL=$env:ASPNETCORE_URLS
 $env:Logging__EventLog__LogLevel__Default='None'
 if(!$env:FLAGMAN_BROWSER){$env:FLAGMAN_BROWSER='C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'}
 $taskContent=(Resolve-Path 'backend').Path
 $taskProcess=Start-Process -FilePath $taskDotnet -ArgumentList @((Join-Path $taskOutput 'Debug/net8.0/Flagman.Api.dll'),'--contentRoot',('"'+$taskContent+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRun 'server.log') -RedirectStandardError (Join-Path $taskRun 'server-error.log')
 $taskReady=$false;for($taskAttempt=0;$taskAttempt -lt 60;$taskAttempt++){try{Invoke-RestMethod "$env:BASE_URL/api/ready" | Out-Null;$taskReady=$true;break}catch{Start-Sleep -Milliseconds 250}}
 if(!$taskReady){throw 'Isolated server did not become ready'}
 $taskSpecs=@(if($Specs){$Specs}elseif($Full){@()}else{@('kitchen-rejections.spec.ts','kitchen-orders.spec.ts','waiter-orders.spec.ts','roles.spec.ts','workflow-design.spec.ts','workflow-touch.spec.ts','pending-actor.spec.ts')})
 & npm.cmd --prefix frontend run test:e2e -- @taskSpecs --output (Join-Path $taskRun 'browser') 2>&1 | Tee-Object (Join-Path $taskRun 'browser.log')
 if($LASTEXITCODE){throw "Browser checks failed. Evidence: $taskRun"}
 Write-Output "Verification evidence: $taskRun"
}finally{
 if($taskProcess -and !$taskProcess.HasExited){Stop-Process -Id $taskProcess.Id}
 foreach($taskName in $taskNames){[Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process')}
}
