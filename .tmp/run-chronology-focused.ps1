$ErrorActionPreference='Stop'
$env:DOTNET_CLI_HOME=Join-Path (Get-Location) '.tmp/chronology-dotnet-home'
$env:FLAGMAN_PASSWORD=[Guid]::NewGuid().ToString();$env:FLAGMAN_TEST_PASSWORD=$env:FLAGMAN_PASSWORD
$env:FLAGMAN_DB=Join-Path (Get-Location) ('.tmp/chronology-'+[Guid]::NewGuid().ToString('N')+'.db')
$env:FLAGMAN_DEMO='true';$env:ASPNETCORE_ENVIRONMENT='Development';$env:Logging__EventLog__LogLevel__Default='None'
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$env:ASPNETCORE_URLS="http://127.0.0.1:$port";$env:BASE_URL=$env:ASPNETCORE_URLS
$env:FLAGMAN_BROWSER='C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
$process=Start-Process -FilePath '.tmp/chronology-api/Flagman.Api.exe' -ArgumentList @('--contentRoot',('"'+(Join-Path (Get-Location) 'backend')+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput '.tmp/chronology-server.log' -RedirectStandardError '.tmp/chronology-server-error.log'
try {
 $ready=$false;for($attempt=0;$attempt -lt 60;$attempt++){try{Invoke-RestMethod "$env:BASE_URL/api/ready" | Out-Null;$ready=$true;break}catch{Start-Sleep -Milliseconds 250}}
 if(!$ready){Get-Content '.tmp/chronology-server-error.log';throw 'Isolated server not ready'}
 & npm.cmd --prefix frontend run test:e2e -- kitchen-queue.spec.ts order-card-chronology.spec.ts --grep "kitchen sees|newest cards"
 if($LASTEXITCODE -ne 0){throw 'Kitchen chronology checks failed'}
} finally {if(!$process.HasExited){Stop-Process -Id $process.Id}}

