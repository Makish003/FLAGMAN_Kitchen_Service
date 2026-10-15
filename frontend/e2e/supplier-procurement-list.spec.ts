import {test,expect} from '@playwright/test';
import {command,setup,loginPage} from './workflow-helpers';

for(const partial of [false,true])test(`responded procurement appears only in supplier deliveries (${partial?'partial':'full'})`,async({page,request})=>{
 const f=await setup(request);
 const create=async()=>{
  const result=await command(request,f.manager.token,'/procurement-requests',{supplierId:f.supplier.id,items:[{id:'line',productId:f.product,quantity:10,unit:'kg'}]});
  expect(result.ok(),await result.text()).toBeTruthy();return result.json();
 };
 const pending=await create(),responded=await create();
 await loginPage(page,f.supplier.login,f.supplier.password,'/supplier');
 const purchaseCard=page.locator('.procurement-request-card').filter({hasText:responded.id.slice(0,8)});
 await purchaseCard.getByRole('button',{name:'Ответить по строкам'}).click();
 const dialog=page.getByRole('dialog');
 if(partial){await dialog.getByLabel('Подтверждено',{exact:true}).fill('8');await dialog.getByLabel('Причина уменьшения или отказа').fill('Недостаточно товара');}
 await dialog.getByLabel(/^Срок годности/).fill(new Date(new Date(f.now).getTime()+86400000).toISOString().slice(0,16));
 await dialog.getByRole('button',{name:'Отправить ответ',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(purchaseCard).toHaveCount(0);
 await expect(page.locator('.procurement-request-card').filter({hasText:pending.id.slice(0,8)})).toBeVisible();
 const deliveryCard=page.locator('.workflow-card').filter({hasText:'Закупка '+responded.id.slice(0,8)});
 await expect(deliveryCard).toBeVisible();
 for(const path of ['/supplier/procurement-requests','/procurement-requests']){
  const response=await request.get('/api'+path+'?size=1',{headers:{Authorization:'Bearer '+f.supplier.token}});
  const list=await response.json();expect(list.total).toBe(1);expect(list.items.map((x:any)=>x.id)).toEqual([pending.id]);
 }
 // Managers retain the procurement history and its link to the delivery.
 const history=await(await request.get('/api/procurement-requests/'+responded.id,{headers:{Authorization:'Bearer '+f.manager.token}})).json();
 expect(history.status).toBe(partial?'partially_accepted':'accepted');
 const delivery=await(await request.get('/api/delivery-requests/'+history.deliveryRequestId,{headers:{Authorization:'Bearer '+f.manager.token}})).json();
 const accepted=await command(request,f.manager.token,'/delivery-requests/'+delivery.id+'/acceptance',{expectedVersion:1,items:delivery.items.map((l:any)=>({lineId:l.id,acceptedQuantity:l.quantity}))});
 expect(accepted.ok(),await accepted.text()).toBeTruthy();
 await page.reload();
 await expect(purchaseCard).toHaveCount(0);
 await expect(deliveryCard).toBeVisible();
 await expect(deliveryCard.getByText('Принята',{exact:true})).toBeVisible();
});
