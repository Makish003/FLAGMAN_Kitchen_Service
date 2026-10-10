// Isolated demo server; passwords exist only in process memory/environment.
const {spawn}=require('node:child_process');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(__dirname,'../.tools/browsers');
const {chromium}=require('../frontend/node_modules/playwright');
const root=path.resolve(__dirname,'..'), mode=process.argv[2]||'after';
const browserPath=process.env.FLAGMAN_BROWSER||path.join(root,'.tools/browsers/chromium-1248/chrome-win64/chrome.exe');
const password=randomUUID(), baseURL=`http://127.0.0.1:${({before:5096,tests:5097,suite:5098,after:5099,onboarding:5100,'before-large':5101,strict:5103})[mode]||5099}`;
const env={...process.env,FLAGMAN_PASSWORD:password,FLAGMAN_DEMO:mode==='onboarding'?'false':'true',BASE_URL:baseURL,FLAGMAN_BROWSER:browserPath,ASPNETCORE_ENVIRONMENT:'Development',FLAGMAN_DB:path.join(root,`backend/data/motion-${mode}-${Date.now()}/flagman.db`)};
const server=spawn(path.join(root,'.tools/dotnet/dotnet.exe'),[path.join(root,'backend/bin/Debug/net8.0/Flagman.Api.dll'),'--urls',baseURL,...(mode==='before-large'?['--webroot',path.join(root,'tmp/motion-baseline/backend/wwwroot')]:[])],{cwd:path.join(root,'backend'),env,stdio:'ignore',windowsHide:true});
async function run(){
  let ready=false;
  for(let i=0;i<120;i++){
    if(server.exitCode!==null)throw Error(`Isolated server exited: ${server.exitCode}`);
    try{await fetch(baseURL+'/api/session');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}
  }
  if(!ready)throw Error('Isolated server did not start');
  if(['tests','suite','onboarding','strict'].includes(mode)){
    let vite;
    try{
      if(mode==='strict'){
        const {createServer}=await import('../frontend/node_modules/vite/dist/node/index.js');
        vite=await createServer({root:path.join(root,'frontend'),configFile:path.join(root,'frontend/vite.config.ts'),server:{host:'127.0.0.1',port:5102,strictPort:true,proxy:{'/api':{target:baseURL,changeOrigin:false}}}});
        await vite.listen();
      }
      const args=['node_modules/@playwright/test/cli.js','test',...(['tests','strict'].includes(mode)?['e2e/motion.spec.ts']:mode==='onboarding'?['e2e/onboarding.spec.ts']:[]),...process.argv.slice(3)];
      const child=spawn(process.execPath,args,{cwd:path.join(root,'frontend'),env:{...env,...(vite?{BASE_URL:'http://127.0.0.1:5102'}:{})},stdio:'inherit',windowsHide:true});
      process.exitCode=await new Promise(r=>child.on('exit',r));return;
    }finally{await vite?.close();}
  }
  const out=path.join(root,'test-results/motion',mode);mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:browserPath});
  try{
    for(const rate of [1,4]){
      const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:out}});
      const profileRoot=mode==='before-large'?path.join(root,'tmp/motion-baseline/backend/wwwroot'):path.join(root,'backend/wwwroot');
      // Development static-web-assets can override --webroot. Serve the exact selected
      // build for both captures and keep API requests on the same isolated backend.
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==baseURL||url.pathname.startsWith('/api/'))return route.continue();
        const asset=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';
        return route.fulfill({path:path.join(profileRoot,asset)});
      });
      await context.addInitScript(()=>{
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject:()=>1,onCommitFiberRoot:()=>performance.mark('react-commit'),onCommitFiberUnmount:()=>{},checkDCE:()=>{}};
      });
      const page=await context.newPage();
      await context.request.post(baseURL+'/api/login',{headers:{'X-Requested-With':'Flagman'},data:{password}});
      await context.request.post(baseURL+'/api/demo/seed',{headers:{'X-Requested-With':'Flagman'}});
      if(mode!=='before')for(let i=0;i<10;i++){
        const response=await context.request.post(baseURL+'/api/deliveries',{headers:{'X-Requested-With':'Flagman','Idempotency-Key':`motion-load-${i}`},data:{number:`MOTION-${i}`,items:Array.from({length:100},()=>({productId:'tomato',quantity:100,unit:'g',shelfLifeHours:72}))}});
        if(!response.ok())throw Error(`Profile fixture failed: ${response.status()}`);
      }
      await page.goto(baseURL);await page.locator('.date-line').waitFor();
      await page.waitForFunction(()=>document.querySelector('.section-motion')?.getAnimations().length===0||!document.querySelector('.section-motion'));
      const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
      await page.screenshot({path:path.join(out,`desktop-${rate}.png`)});
      await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
      for(let i=0;i<20;i++){
        await page.evaluate(i=>performance.mark(`dialog-${i}-start`),i);
        await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();await page.locator('dialog[open]').waitFor();
        if(i===0){await page.waitForFunction(()=>document.querySelector('dialog').getAnimations().length===0);await page.screenshot({path:path.join(out,`dialog-${rate}.png`)});}
        await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'detached'});
        await page.evaluate(i=>performance.mark(`dialog-${i}-end`),i);
      }
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,`mobile-${rate}.png`)});
      await page.evaluate(()=>performance.mark('menu-start'));await page.getByRole('button',{name:'Открыть навигацию'}).click();
      await page.locator('.nav-close').click();await page.waitForFunction(()=>!document.querySelector('.workspace').inert);
      await page.evaluate(()=>performance.mark('menu-end'));
      await page.goto(baseURL+'/stock');await page.locator('.date-line').waitFor();
      await page.evaluate(()=>performance.mark('search-start'));await page.getByRole('textbox',{name:'Продукт, партия или ID поставки…'}).fill('томат');
      await page.getByText('Найдено 1002 партий по всему складу').waitFor();await page.evaluate(()=>performance.mark('search-end'));
      const complete=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');
      const {stream}=await complete;let trace='';while(true){const data=await cdp.send('IO.read',{handle:stream});trace+=data.data;if(data.eof)break;}await cdp.send('IO.close',{handle:stream});
      writeFileSync(path.join(out,`trace-${rate}.json`),trace);
      const events=JSON.parse(trace).traceEvents;
      const active=new Map(),intervals=[];
      for(const event of events){
        if(event.name!=='Animation')continue;
        const key=`${event.pid}:${event.id2?.local}`;
        if(event.ph==='b'&&event.args?.data?.displayName?.startsWith('motion-'))active.set(key,event);
        if(event.ph==='e'&&active.has(key)){intervals.push({start:active.get(key).ts,end:event.ts,name:active.get(key).args.data.displayName});active.delete(key);}
      }
      const within=(event,interval)=>event.ts>interval.start+20000&&event.ts<interval.end-20000;
      const animationMetrics=intervals.filter(interval=>interval.end-interval.start>40000).map(interval=>({name:interval.name,ms:(interval.end-interval.start)/1000,layouts:events.filter(event=>event.name==='Layout'&&event.ph==='X'&&within(event,interval)).length,commits:events.filter(event=>event.name==='react-commit'&&within(event,interval)).length}));
      writeFileSync(path.join(out,`animation-metrics-${rate}.json`),JSON.stringify(animationMetrics,null,2));
      writeFileSync(path.join(out,`summary-${rate}.json`),JSON.stringify({browser:browser.version(),rate,desktop:'1440x960',mobile:'390x844',build:await page.locator('script[src]').getAttribute('src'),snapshot:await (await context.request.get(baseURL+'/api/snapshot')).json(),layout:events.filter(e=>e.name==='Layout'&&e.ph==='X').length,longTasks:events.filter(e=>e.name==='RunTask'&&e.dur>50000).map(e=>({ts:e.ts,ms:e.dur/1000})),dialogCount:await page.locator('dialog').count(),overflow:await page.evaluate(()=>document.body.style.overflow)},null,2));
      const video=page.video();await context.close();await video?.saveAs(path.join(out,`video-${rate}.webm`));
    }
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
