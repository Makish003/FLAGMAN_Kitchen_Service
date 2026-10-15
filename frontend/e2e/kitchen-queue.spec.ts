import {test,expect} from '@playwright/test';
import {setup,command,receipt,loginPage} from './workflow-helpers';

test('kitchen sees today across aliases; only manager can read the full journal',async({request})=>{
 const f=await setup(request);await receipt(request,f);
 const old=await(await command(request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json();
 expect((await command(request,f.manager.token,'/demo/time',{hours:24})).ok()).toBeTruthy();
 const expired=await(await command(request,f.cook.token,'/order-requests/'+old.id+'/decision',{expectedVersion:1,decision:'accept'})).json();expect(expired.status).toBe('rejected');
 const today=await setup(request);await receipt(request,today,2000);
 const orders=[];for(let i=0;i<4;i++)orders.push(await(await command(request,today.waiter.token,'/orders',{items:[{dishId:today.dish,portions:1}]})).json());
 await command(request,today.cook.token,'/order-requests/'+orders[0].id+'/decision',{expectedVersion:1,decision:'accept'});
 await command(request,today.waiter.token,'/order-requests/'+orders[0].id+'/serve',{expectedVersion:2});
 await command(request,today.cook.token,'/order-requests/'+orders[1].id+'/decision',{expectedVersion:1,decision:'reject',reasonCode:'other',reason:'Отказ'});
 for(const path of ['/cook/order-requests','/order-requests','/waiter/order-requests']){
  const list=await(await request.get('/api'+path,{headers:{Authorization:'Bearer '+today.cook.token}})).json();
  expect(list.items.some((o:any)=>o.id===old.id)).toBeFalsy();
  expect(list.items.filter((o:any)=>orders.some(x=>x.id===o.id)).map((o:any)=>o.id)).toEqual([orders[2].id,orders[3].id,orders[0].id,orders[1].id]);
 }
 const rejected=await(await request.get('/api/cook/order-requests?status=rejected&size=1',{headers:{Authorization:'Bearer '+today.cook.token}})).json();
 expect(rejected.total).toBe(1);expect(rejected.items[0].id).toBe(orders[1].id);
 for(const token of [today.cook.token,today.waiter.token,today.supplier.token])expect((await request.get('/api/history/orders',{headers:{Authorization:'Bearer '+token}})).status()).toBe(403);
 expect((await request.get('/api/history/orders',{headers:{Authorization:'Bearer '+today.manager.token}})).ok()).toBeTruthy();
 for(const status of ['accepted','rejected']){
  const log=await(await request.get('/api/history/orders?status='+status+'&size=1',{headers:{Authorization:'Bearer '+today.manager.token}})).json();
  expect(log.total).toBeGreaterThan(0);expect(log.items).toHaveLength(1);expect(log.items[0].status).toBe(status);
 }
 expect((await request.get('/api/cook/order-requests?status=invalid',{headers:{Authorization:'Bearer '+today.cook.token}})).status()).toBe(400);
 const all=await(await request.get('/api/order-requests?size=100',{headers:{Authorization:'Bearer '+today.manager.token}})).json();expect(all.items.some((o:any)=>o.id===old.id)).toBeTruthy();
});

for(const width of [1440,390,280])test('kitchen groups statuses and filters before pagination '+width,async({page})=>{
 await page.setViewportSize({width,height:960});const f=await setup(page.request);await receipt(page.request,f,1500);
 const orders=[];for(let i=0;i<3;i++)orders.push(await(await command(page.request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json());
 await command(page.request,f.cook.token,'/order-requests/'+orders[1].id+'/decision',{expectedVersion:1,decision:'accept'});
 await command(page.request,f.cook.token,'/order-requests/'+orders[2].id+'/decision',{expectedVersion:1,decision:'reject',reasonCode:'other',reason:'Отказ на кухне'});
 await loginPage(page,f.cook.login,f.cook.password,'/cook');
 await expect(page.getByText('Заказы за сегодня',{exact:true})).toBeVisible();
 for(const [label,index] of [['Ожидают приготовления',0],['Готовы к выдаче',1],['Отклонены',2]] as const){
  const group=page.getByRole('region',{name:label,exact:true});await expect(group.locator('.workflow-card').filter({hasText:orders[index].id.slice(0,8)})).toBeVisible();
 }
 await page.getByRole('button',{name:'Отклонены',exact:true}).click();
 await expect(page.locator('.workflow-card').filter({hasText:orders[2].id.slice(0,8)})).toBeVisible();
 await expect(page.locator('.workflow-card').filter({hasText:orders[0].id.slice(0,8)})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'../test-results/kitchen-queue-'+width+'.png',fullPage:true});
});

test('manager journal separates completed and rejected records',async({page})=>{
 const f=await setup(page.request);await receipt(page.request,f);
 const order=await(await command(page.request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json();
 await command(page.request,f.manager.token,'/demo/time',{hours:2});
 const rejected=await(await command(page.request,f.cook.token,'/order-requests/'+order.id+'/decision',{expectedVersion:1,decision:'accept'})).json();expect(rejected.status).toBe('rejected');
 const next=await setup(page.request);await receipt(page.request,next);
 const accepted=await(await command(page.request,next.waiter.token,'/orders',{items:[{dishId:next.dish,portions:1}]})).json();
 expect((await command(page.request,next.cook.token,'/order-requests/'+accepted.id+'/decision',{expectedVersion:1,decision:'accept'})).ok()).toBeTruthy();
 await page.request.post('/api/login',{headers:{'X-Requested-With':'Flagman'},data:{login:'manager',password:process.env.FLAGMAN_TEST_PASSWORD??process.env.FLAGMAN_PASSWORD??'test-password-123'}});
 await page.goto('/orders');
 const journal=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Журнал заказов',exact:true})});
 await journal.getByRole('button',{name:'Завершённые',exact:true}).click();
 await expect(journal.locator('tbody tr')).not.toHaveCount(0);
 await expect(journal.locator('tbody .badge.red')).toHaveCount(0);
 await journal.getByRole('button',{name:'Отклонённые',exact:true}).click();
 await expect(journal.locator('tbody tr')).not.toHaveCount(0);
 await expect(journal.locator('tbody .badge.green')).toHaveCount(0);
 await expect(journal.locator('tbody .badge.red').first()).toBeVisible();
 await page.screenshot({path:'../test-results/manager-order-journal.png',fullPage:true});
});
