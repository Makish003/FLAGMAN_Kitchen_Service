param()
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
$target=Join-Path $root ('test-results/clean-source-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory $target|Out-Null
$files=& git ls-files --cached --others --exclude-standard
foreach($file in $files){
 $source=Join-Path $root $file;if(-not(Test-Path -LiteralPath $source -PathType Leaf)){continue}
 $destination=Join-Path $target $file;New-Item -ItemType Directory -Force (Split-Path $destination -Parent)|Out-Null;Copy-Item -LiteralPath $source -Destination $destination
}
$sdk=if(Test-Path '.tools/dotnet/dotnet.exe'){(Resolve-Path '.tools/dotnet/dotnet.exe').Path}else{'dotnet'}
$names=@('PATH','FLAGMAN_PASSWORD','FLAGMAN_DB','FLAGMAN_DEMO','ASPNETCORE_ENVIRONMENT','BASE_URL','FLAGMAN_EVIDENCE');$saved=@{};foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name)}
$server=$null
try{
 $env:PATH=(Split-Path $sdk -Parent)+';'+$env:PATH
 $env:FLAGMAN_EVIDENCE=$target
 Push-Location (Join-Path $target 'frontend')
 try{& npm.cmd ci --no-fund *> (Join-Path $target 'npm-ci.log');if($LASTEXITCODE){throw 'Clean npm ci failed'};& npm.cmd run build *> (Join-Path $target 'frontend.log');if($LASTEXITCODE){throw 'Clean frontend build failed'}}finally{Pop-Location}
 & $sdk run --project (Join-Path $target 'tests/Flagman.Tests.csproj') -c Release *> (Join-Path $target 'domain.log');if($LASTEXITCODE){throw 'Clean domain failed'}
 $app=Join-Path $target 'publish'
 & $sdk publish (Join-Path $target 'backend/Flagman.Api.csproj') -c Release -o $app *> (Join-Path $target 'publish.log');if($LASTEXITCODE){throw 'Clean publish failed'}
 $env:FLAGMAN_PASSWORD=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N');$env:FLAGMAN_DB=Join-Path $target 'clean-production.db';$env:FLAGMAN_DEMO='false';$env:ASPNETCORE_ENVIRONMENT='Production'
 $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop();$env:BASE_URL="http://127.0.0.1:$port"
 $server=Start-Process -FilePath $sdk -ArgumentList @((Join-Path $app 'Flagman.Api.dll'),'--urls',$env:BASE_URL) -WorkingDirectory $app -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $target 'server.log') -RedirectStandardError (Join-Path $target 'errors.log')
 $ready=$false;for($i=0;$i -lt 60;$i++){if($server.HasExited){throw 'Clean server exited'};& node -e "fetch(process.argv[1]+'/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" $env:BASE_URL;if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 500};if(-not $ready){throw 'Clean readiness timeout'}
 & node (Join-Path $target 'scripts/production-smoke.cjs') *> (Join-Path $target 'production-smoke.log');if($LASTEXITCODE){throw 'Clean smoke failed'}
 'Clean source export without .tools/node_modules/data: npm ci, build, domain, publish and fresh production launch passed. Not a published Git checkout.'|Set-Content (Join-Path $target 'RESULT.txt')
 Write-Output "Evidence: $target"
}finally{if($server -and -not $server.HasExited){Stop-Process -Id $server.Id;$server.WaitForExit()};foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name])}}
