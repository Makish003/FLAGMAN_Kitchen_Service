import {test,expect} from '@playwright/test';
import {setup,command,receipt,loginPage} from './workflow-helpers';
test('admin event log streams workflow events and manager menu is persisted',async({page})=>{
 test.setTimeout(120000);
 const f=await setup(page.request),headers={Authorization:'Bearer '+f.manager.token};
 const login='limited-'+crypto.randomUUID(),password=crypto.randomUUID(),name='Менеджер '+crypto.randomUUID();
 const response=await page.request.post('/api/accounts',{headers,data:{login,password,name,role:'manager',visiblePages:['stock','orders']}});
 expect(response.ok()).toBeTruthy();const manager=await response.json();
 const key=await(await page.request.post('/api/accounts/'+manager.id+'/keys',{headers})).json();
 for(const actor of [key.token,f.waiter.token,f.supplier.token,f.cook.token])for(const route of ['/history/eventLog','/HISTORY/EVENTLOG'])expect((await page.request.get('/api'+route,{headers:{Authorization:'Bearer '+actor}})).status()).toBe(403);
 const delivery=await receipt(page.request,f,1500);
 const order=await(await command(page.request,f.waiter.token,'/order-requests',{items:[{dishId:f.dish,portions:1}]})).json();
 expect((await command(page.request,f.cook.token,'/order-requests/'+order.id+'/decision',{expectedVersion:1,decision:'accept'})).ok()).toBeTruthy();
 await page.goto('/event-log');await expect(page.getByRole('heading',{name:'Все события ресторана'})).toBeVisible();
 const search=page.getByRole('textbox',{name:'Поиск по продукту, номеру или ID'});
 await search.fill(order.id);await expect(page.getByRole('row').filter({hasText:order.id}).getByText('Заказ готов к выдаче',{exact:true})).toBeVisible();
 // This event is emitted after the log page has subscribed to updates.
 expect((await command(page.request,f.waiter.token,'/order-requests/'+order.id+'/serve',{expectedVersion:2})).ok()).toBeTruthy();
 await expect(page.getByRole('row').filter({hasText:order.id}).getByText('Заказ выдан гостю',{exact:true})).toBeVisible();
 await search.fill(delivery.deliveryId);await expect(page.getByRole('row').filter({hasText:delivery.deliveryId}).getByText('Поставка принята на склад',{exact:true})).toBeVisible();
 await page.request.post('/api/demo/time',{headers,data:{hours:2}});
 await search.fill(f.product.slice(2));await expect(page.getByRole('row').filter({hasText:f.product.slice(2)}).getByText('Истёк срок годности продукта',{exact:true})).toBeVisible();
 await search.fill('');
 await page.screenshot({path:'../.tmp/admin-event-verification/log-desktop.png',fullPage:true});
 for(const width of [390,280]){await page.setViewportSize({width,height:850});await expect(page.getByRole('heading',{name:'Все события ресторана'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 await page.screenshot({path:'../.tmp/admin-event-verification/log-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:960});
 await page.goto('/accounts');
 const card=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
 await card.getByRole('button',{name:'Изменить аккаунт'}).click();
 await expect(page.getByRole('checkbox',{name:'Склад и партии',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Обзор кухни',exact:true})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Сроки годности',exact:true}).check();
 await page.getByRole('button',{name:'Сохранить аккаунт'}).click();
 await expect(page.getByRole('button',{name:'Создать аккаунт',exact:true})).toBeVisible();
 await loginPage(page,login,password,'/overview');await expect(page).toHaveURL(/\/stock(?:\?|$)/);
 const nav=page.getByRole('navigation');
 await expect(nav.getByRole('button')).toHaveCount(3);
 await expect(nav.getByRole('button',{name:'Сроки годности',exact:true})).toBeVisible();
 await expect(nav.getByRole('button',{name:'Обзор кухни',exact:true})).toHaveCount(0);
 await page.goto('/event-log');await expect(page).toHaveURL(/\/stock(?:\?|$)/);
 await page.goto('/analytics');await expect(page).toHaveURL(/\/stock(?:\?|$)/);
 await page.reload();await expect(nav.getByRole('button')).toHaveCount(3);
 for(const width of [390,280]){await page.setViewportSize({width,height:850});await page.getByRole('button',{name:'Открыть навигацию',exact:true}).click();await expect(nav.getByRole('button',{name:'Склад и партии',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Навигация кухни'}).getByRole('button',{name:'Закрыть навигацию',exact:true}).click();await expect(page.getByRole('dialog',{name:'Навигация кухни'})).toHaveCount(0);}
});
