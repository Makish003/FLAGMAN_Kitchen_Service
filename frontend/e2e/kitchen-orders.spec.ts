import {test,expect} from '@playwright/test';
import {setup,command,receipt,stock,loginPage} from './workflow-helpers';

test('reserve combined ingredients atomically and release on cook rejection',async({request})=>{
 const f=await setup(request);await receipt(request,f,700);
 const second=f.dish+'-second';
 expect((await command(request,f.manager.token,'/dishes',{id:second,name:'Второе блюдо',category:'Тест',ingredients:[{productId:f.product,quantity:300}]})).ok()).toBeTruthy();
 expect((await command(request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1},{dishId:second,portions:1}]})).status()).toBe(409);
 let balance=await stock(request,f.manager.token,f.product);expect(balance.usable).toBe(700);expect(balance.reserved).toBe(0);
 const order=await(await command(request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json();
 balance=await stock(request,f.manager.token,f.product);expect(balance.physical).toBe(700);expect(balance.reserved).toBe(500);expect(balance.usable).toBe(200);
 const menu=await(await request.get('/api/waiter/menu',{headers:{Authorization:'Bearer '+f.waiter.token}})).json();expect(menu.find((d:any)=>d.id===second).availablePortions).toBe(0);
 expect((await command(request,f.cook.token,'/order-requests/'+order.id+'/decision',{expectedVersion:1,decision:'reject',reasonCode:'other',reason:'Не готовим'})).ok()).toBeTruthy();
 balance=await stock(request,f.manager.token,f.product);expect(balance.physical).toBe(700);expect(balance.reserved).toBe(0);expect(balance.usable).toBe(700);
 const races=await Promise.all([0,1].map(()=>command(request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})));expect(races.map(r=>r.status()).sort()).toEqual([201,409]);
});

test('cook readiness, waiter ownership, versions and operation recovery',async({request})=>{
 const f=await setup(request);await receipt(request,f);
 const o=await(await command(request,f.waiter.token,'/order-requests',{items:[{dishId:f.dish,portions:1}]})).json();
 const serve='/order-requests/'+o.id+'/serve',decision='/order-requests/'+o.id+'/decision';
 expect((await command(request,f.waiter.token,serve,{expectedVersion:1})).status()).toBe(409);
 for(const token of [f.waiter.token,f.supplier.token,f.manager.token])expect((await command(request,token,decision,{expectedVersion:1,decision:'accept'})).status()).toBe(403);
 for(const path of ['/snapshot','/accounts','/waiter/menu','/supplier/catalog'])expect((await request.get('/api'+path,{headers:{Authorization:'Bearer '+f.cook.token}})).status()).toBe(403);
 expect((await command(request,f.cook.token,'/order-requests',{items:[{dishId:f.dish,portions:1}]})).status()).toBe(403);
 const list=await(await request.get('/api/cook/order-requests',{headers:{Authorization:'Bearer '+f.cook.token}})).json();
 const row=list.items.find((x:any)=>x.id===o.id);expect(row.items[0].dishName).toBe('Блюдо '+f.dish.slice(2));expect(JSON.stringify(row)).not.toMatch(/recipeFingerprint|unitCost|passwordHash/);
 const key=crypto.randomUUID(),body={expectedVersion:1,decision:'accept'};
 const ready=await(await command(request,f.cook.token,decision,body,key)).json();expect(ready.status).toBe('ready');
 expect((await stock(request,f.manager.token,f.product)).physical).toBe(0);
 expect((await command(request,f.cook.token,decision,body,key)).ok()).toBeTruthy();
 expect((await command(request,f.cook.token,decision,body)).status()).toBe(409);
 expect((await request.get('/api/operations/order-decision/'+key,{headers:{Authorization:'Bearer '+f.cook.token}})).ok()).toBeTruthy();
 expect((await request.get('/api/operations/order-decision/'+key,{headers:{Authorization:'Bearer '+f.manager.token}})).status()).toBe(404);
 expect((await command(request,f.cook.token,serve,{expectedVersion:2})).status()).toBe(403);
 expect((await command(request,f.manager.token,serve,{expectedVersion:2})).status()).toBe(404);
 const other=await setup(request);
 expect((await command(request,other.waiter.token,serve,{expectedVersion:2})).status()).toBe(404);
 expect((await command(request,f.waiter.token,serve,{expectedVersion:1})).status()).toBe(409);
 const serveKeys=[crypto.randomUUID(),crypto.randomUUID()];
 const responses=await Promise.all(serveKeys.map(k=>command(request,f.waiter.token,serve,{expectedVersion:2},k)));
 expect(responses.map(r=>r.status()).sort()).toEqual([200,409]);
 const winner=serveKeys[responses.findIndex(r=>r.ok())];
 const replay=await command(request,f.waiter.token,serve,{expectedVersion:2},winner);expect((await replay.json()).status).toBe('served');expect((await request.get('/api/operations/order-serve/'+winner,{headers:{Authorization:'Bearer '+f.waiter.token}})).ok()).toBeTruthy();
 const final=await(await request.get('/api/order-requests/'+o.id,{headers:{Authorization:'Bearer '+f.manager.token}})).json();
 expect(final.status).toBe('served');expect(final.servedById).toBe(f.waiter.id);expect(final.decisionActorId).toBe(f.cook.id);expect(final.servedAt).toBeTruthy();
 expect((await stock(request,f.manager.token,f.product)).physical).toBe(0);
});

for(const width of [1440,390,280])test('waiter cook waiter complete UI '+width,async({page,browser})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:960});
 const f=await setup(page.request);await receipt(page.request,f);
 await loginPage(page,f.waiter.login,f.waiter.password,'/waiter');
 await page.locator('.dish-card').filter({hasText:'Блюдо '+f.dish.slice(2)}).getByRole('button',{name:'В корзину'}).click();
 await page.getByRole('button',{name:'Отправить заказ',exact:true}).click();
 const waiterOrder=page.locator('.workflow-card').filter({hasText:'Блюдо '+f.dish.slice(2)});
 await expect(waiterOrder).toContainText('Ожидает приготовления');
 await expect(page.locator('.dish-card').filter({hasText:'Блюдо '+f.dish.slice(2)}).getByRole('button',{name:'В корзину'})).toBeDisabled();await expect(waiterOrder.getByRole('button',{name:'Подтвердить выдачу'})).toHaveCount(0);
 const context=await browser.newContext({viewport:{width,height:960}});const kitchen=await context.newPage();
 try{
  await loginPage(kitchen,f.cook.login,f.cook.password,'/cook');
  await expect(kitchen.getByText('Кабинет повара',{exact:true})).toBeVisible();
  const card=kitchen.locator('.workflow-card').filter({hasText:'Блюдо '+f.dish.slice(2)});await expect(card).toBeVisible();
  await card.getByRole('button',{name:'Готово',exact:true}).click();await expect(card).toContainText('Готов к выдаче');
  await expect(waiterOrder).toContainText('Готов к выдаче');
  await waiterOrder.getByRole('button',{name:'Подтвердить выдачу'}).click();await expect(waiterOrder).toContainText('Выдан');await expect(card).toContainText('Выдан');
  for(const p of [page,kitchen])expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await kitchen.screenshot({path:'../test-results/kitchen-'+width+'.png',fullPage:true});
 }finally{await context.close();}
});
