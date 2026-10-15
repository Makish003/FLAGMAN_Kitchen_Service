import {test,expect} from '@playwright/test';
import {setup,command,receipt,stock,loginPage} from './workflow-helpers';
import {chooseOption} from './helpers';

test('rejection ingredient list stays with submitted recipe after edits',async({request})=>{
 const f=await setup(request);await receipt(request,f);
 const order=await(await command(request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json();
 expect((await command(request,f.manager.token,'/dishes',{id:f.dish,name:'Новая рецептура',category:'Тест',ingredients:[{productId:f.cream,quantity:100}]})).ok()).toBeTruthy();
 const saved=await(await request.get('/api/order-requests/'+order.id,{headers:{Authorization:'Bearer '+f.cook.token}})).json();
 expect(saved.rejectionProducts.map((p:any)=>p.id)).toEqual([f.product]);
 const path='/order-requests/'+order.id+'/decision';
 expect((await command(request,f.cook.token,path,{expectedVersion:1,decision:'reject',reasonCode:'product_shortage',productIds:[f.cream]})).status()).toBe(400);
 expect((await command(request,f.cook.token,path,{expectedVersion:1,decision:'reject',reasonCode:'product_shortage',productIds:[f.product]})).ok()).toBeTruthy();
});

test('server validates reason and order products before releasing reserve',async({request})=>{
 const f=await setup(request);await receipt(request,f);
 const o=await(await command(request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json();const path='/order-requests/'+o.id+'/decision';
 for(const body of [
  {reason:'Текст без категории'},
  {reasonCode:'invented',reason:'Текст'},
  {reasonCode:'expired_product'},
  {reasonCode:'expired_product',productIds:[f.cream]},
  {reasonCode:'product_shortage',productIds:[f.product,f.product]},
  {reasonCode:'other',reason:'  '},
  {reasonCode:'equipment_failure'},
 ])expect((await command(request,f.cook.token,path,{expectedVersion:1,decision:'reject',...body})).status()).toBe(400);
 let balance=await stock(request,f.manager.token,f.product);expect(balance.physical).toBe(500);expect(balance.reserved).toBe(500);
 const key=crypto.randomUUID(),body={expectedVersion:1,decision:'reject',reasonCode:'expired_product',productIds:[f.product]};
 const response=await command(request,f.cook.token,path,body,key);expect(response.ok()).toBeTruthy();const result=await response.json();expect(result.reason).toContain('Просроченный продукт: Томаты');expect(result.rejection.products[0].id).toBe(f.product);
 expect((await command(request,f.cook.token,path,body,key)).ok()).toBeTruthy();
 expect((await command(request,f.cook.token,path,{...body,reasonCode:'spoiled_product'},key)).status()).toBe(409);
 balance=await stock(request,f.manager.token,f.product);expect(balance.physical).toBe(500);expect(balance.reserved).toBe(0);expect(balance.usable).toBe(500);
 for(const token of [f.waiter.token,f.manager.token]){const saved=await(await request.get('/api/order-requests/'+o.id,{headers:{Authorization:'Bearer '+token}})).json();expect(saved.rejection.code).toBe('expired_product');expect(saved.reason).toBe(result.reason);}
});

for(const width of [1440,390,280])test('cook chooses product reason and Other explanation '+width,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:960});
 const f=await setup(page.request);await receipt(page.request,f,1000);
 const orders=[];for(let i=0;i<2;i++)orders.push(await(await command(page.request,f.waiter.token,'/orders',{items:[{dishId:f.dish,portions:1}]})).json());
 await loginPage(page,f.cook.login,f.cook.password,'/cook');
 const card=page.locator('.workflow-card').filter({hasText:orders[0].id.slice(0,8)});await card.getByRole('button',{name:'Отклонить заказ',exact:true}).click();
 let dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Отклонить',exact:true})).toBeDisabled();
 await chooseOption(dialog,'Причина отказа','expired_product');await expect(dialog.getByRole('button',{name:'Отклонить',exact:true})).toBeDisabled();
 await chooseOption(dialog,'Продукт',''+f.product);await expect(dialog.getByRole('combobox',{name:'Продукт',exact:true})).toHaveValue('Томаты '+f.dish.slice(2));
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.screenshot({path:'../test-results/kitchen-reject-product-'+width+'.png',fullPage:true});
 await dialog.getByRole('button',{name:'Отклонить',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(card).toContainText('Просроченный продукт: Томаты');
 const second=page.locator('.workflow-card').filter({hasText:orders[1].id.slice(0,8)});await second.getByRole('button',{name:'Отклонить заказ',exact:true}).click();dialog=page.getByRole('dialog');
 await chooseOption(dialog,'Причина отказа','product_shortage');await chooseOption(dialog,'Продукт',f.product);
 await chooseOption(dialog,'Причина отказа','other');await expect(dialog.getByRole('combobox',{name:'Продукт',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Отклонить',exact:true})).toBeDisabled();
 await dialog.getByLabel('Описание причины',{exact:true}).fill('  ');await expect(dialog.getByRole('button',{name:'Отклонить',exact:true})).toBeDisabled();
 await dialog.getByLabel('Описание причины',{exact:true}).fill('Невозможно приготовить по особому пожеланию гостя');
 await page.screenshot({path:'../test-results/kitchen-reject-other-'+width+'.png',fullPage:true});
 await dialog.getByRole('button',{name:'Отклонить',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(second).toContainText('Другое: Невозможно приготовить');
 const record=await(await page.request.get('/api/order-requests/'+orders[1].id,{headers:{Authorization:'Bearer '+f.manager.token}})).json();expect(record.rejection.products).toEqual([]);expect(record.rejection.code).toBe('other');
 await loginPage(page,f.waiter.login,f.waiter.password,'/waiter');await expect(page.locator('.workflow-card').filter({hasText:orders[0].id.slice(0,8)})).toContainText('Просроченный продукт: Томаты');await expect(page.locator('.workflow-card').filter({hasText:orders[1].id.slice(0,8)})).toContainText('Другое: Невозможно приготовить');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect((await stock(page.request,f.manager.token,f.product)).physical).toBe(1000);
});
