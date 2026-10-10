const {spawn}=require('child_process');const net=require('net');const path=require('path');
const [sdk,dll,shiftedDb,root]=process.argv.slice(2);let child;
async function stop(){if(!child)return;const c=child;child=null;if(c.exitCode!==null)return;await new Promise(resolve=>{c.once('exit',resolve);c.kill();});}
async function start(db,password,expectFailure=false,demo=false){
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  child=spawn(sdk,[dll,'--urls',`http://127.0.0.1:${port}`],{cwd:path.dirname(dll),windowsHide:true,env:{...process.env,FLAGMAN_DB:db,FLAGMAN_DEMO:demo?'true':'false',ASPNETCORE_ENVIRONMENT:'Production',FLAGMAN_PASSWORD:password},stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d);
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<300;i++){
    if(child.exitCode!==null){if(expectFailure&&child.exitCode!==0&&stderr.includes('Demo clock detected')){child=null;return;}throw Error('Unexpected startup failure');}
    try{const r=await fetch(base+'/api/ready');if(r.ok){if(expectFailure)throw Error('Shifted demo database was accepted');return base;}}catch(e){if(e.message==='Shifted demo database was accepted')throw e;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Startup timeout');
}
async function main(){
  if(shiftedDb!=='-')await start(shiftedDb,process.env.FLAGMAN_PASSWORD,true);
  if(shiftedDb!=='-'){
    const read=async db=>{const base=await start(db,process.env.FLAGMAN_PASSWORD,false,true);const login=await fetch(base+'/api/login',{method:'POST',headers:{'X-Requested-With':'Flagman','Content-Type':'application/json'},body:JSON.stringify({password:process.env.FLAGMAN_PASSWORD})});const snapshot=await(await fetch(base+'/api/snapshot',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}})).json();await stop();return JSON.stringify({products:snapshot.products,dishes:snapshot.dishes,orders:snapshot.orders,deliveries:snapshot.deliveries,movements:snapshot.movements,totals:snapshot.totals,batches:snapshot.batches.map(b=>({id:b.id,remainingQuantity:b.remainingQuantity}))});};
    if(await read(shiftedDb)!==await read(path.join(root,'restored.db')))throw Error('Restart/restore changed inventory or history');
    console.log('Restart and restored application: stock, recipes, orders, deliveries and movement history match');
  }
  const db=path.join(root,'rotation.db');let base=await start(db,process.env.FLAGMAN_PASSWORD);const headers={'X-Requested-With':'Flagman','Content-Type':'application/json'};
  const login=await fetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({password:process.env.FLAGMAN_PASSWORD})});if(!login.ok)throw Error('Login failed');const cookie=login.headers.get('set-cookie').split(';')[0];await stop();
  base=await start(db,process.env.FLAGMAN_PASSWORD+'-rotated');const old=await fetch(base+'/api/session',{headers:{Cookie:cookie}});if(old.status!==401)throw Error('Old session survived password rotation');
  const forged=await fetch(base+'/api/login',{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:'{}'});if(forged.status!==403)throw Error('Origin policy failed');
  for(let i=0;i<11;i++){const r=await fetch(base+'/api/login',{method:'POST',headers,body:'{"password":"incorrect"}'});if(i<10&&r.status!==401)throw Error('Login limit changed');if(i===10&&(r.status!==429||!r.headers.get('retry-after')))throw Error('429 contract failed');}
  console.log('Configuration checks: shifted demo rejected, password rotation revokes sessions, Origin rejected, 429 + Retry-After OK');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(stop);
