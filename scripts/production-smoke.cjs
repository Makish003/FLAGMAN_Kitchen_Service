const {acceptDelivery,acceptOrder}=require('./workflow-test-helpers.cjs');
async function main(){
  const base=process.env.BASE_URL; const headers={'X-Requested-With':'Flagman','Content-Type':'application/json'};
  const login=await fetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({login:'manager',password:process.env.FLAGMAN_PASSWORD})});
  if(login.status!==200)throw Error('Production login failed');
  const cookie=login.headers.get('set-cookie');if(!cookie?.includes('secure')||!cookie?.includes('httponly'))throw Error('Cookie policy failed');
  const authenticated={...headers,Cookie:cookie.split(';')[0]};
  for(const [path,method,body,status] of [['/api/session','GET',undefined,200],['/api/demo/seed','POST','{}',403],['/api/demo/time','POST','{"hours":1}',403],['/api/unknown','GET',undefined,404],['/api/orders','POST','{"items":[null]}',400]]){
    const r=await fetch(base+path,{method,headers:authenticated,body});if(r.status!==status)throw Error(`${path}: ${r.status}, expected ${status}`);
    await r.json();
  }
  async function write(path,body,status=200,key){const r=await fetch(base+'/api'+path,{method:path==='/settings'?'PUT':'POST',headers:{...authenticated,...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});if(r.status!==status)throw Error(`${path}: ${r.status}, expected ${status}`);return r.json();}
  await write('/products',{id:'smoke',name:'Проверка production',unit:'g'});
  const recipe={id:'smoke',name:'Историческая рецептура',category:'Тест',ingredients:[{productId:'smoke',quantity:100}]};await write('/dishes',recipe);
  const delivery={id:'smoke-delivery',number:'SMOKE',items:[{productId:'smoke',quantity:500,unit:'g',shelfLifeHours:24}]};const submittedDelivery=await write('/deliveries',delivery,201,'smoke-delivery');await write('/deliveries',{...delivery,number:'changed'},409,'smoke-delivery');await acceptDelivery(base,authenticated,submittedDelivery,'smoke-acceptance');
  const submittedOrder=await write('/orders',{items:[{dishId:'smoke',portions:1}]},201,'smoke-order');const order=await acceptOrder(base,authenticated,submittedOrder,'smoke-decision');await write('/dishes',{...recipe,ingredients:[{productId:'smoke',quantity:200}]},409);
  await write('/dishes',{...recipe,id:'smoke-v2',name:'Новая версия'});await write('/archive/dishes/smoke',{});await write('/archive/products/smoke',{},409);await write('/archive/dishes/smoke-v2',{});await write('/archive/products/smoke',{});
  await write('/settings',{timezone:'Europe/Moscow'});
  const snapshot=await(await fetch(base+'/api/snapshot',{headers:authenticated})).json();if(!snapshot.orders.some(o=>o.id===order.orderId&&o.items[0].dishId==='smoke')||!snapshot.dishes.find(d=>d.id==='smoke')?.archived)throw Error('Archive lost history');
  const audit=await(await fetch(base+'/api/history/audit',{headers:authenticated})).json();if(!audit.items.some(a=>a.action==='settings.changed'&&a.sessionId)||!audit.items.some(a=>a.action==='recipe.saved'))throw Error('Audit missing');
  console.log('Production smoke: Secure/HttpOnly, demo disabled, JSON 404 and invalid payload OK');
  console.log('Historical recipes, explicit new version, archive, workflow acceptance and idempotency body conflict and session audit: OK');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
