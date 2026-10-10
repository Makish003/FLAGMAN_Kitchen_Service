import { chooseOption } from './helpers';
import { test, expect } from '@playwright/test';
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5080';
const password = process.env.FLAGMAN_PASSWORD!;
test('dashboard, all pages, stock forms, order, expiry and mobile layout', async ({page}) => {
  test.setTimeout(90000);
  await page.goto('/'); await page.getByLabel('Пароль управляющего').fill(password); await page.getByRole('button',{name:'Открыть кухню'}).click();
  await expect(page.getByRole('heading',{name:'Обзор кухни',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Загрузить демо'}).click();
  await expect(page.getByText('Демонстрационный склад готов')).toBeVisible();
  await page.getByRole('button',{name:'Закрыть сообщение'}).click();
  await page.screenshot({path:'../test-results/overview-desktop.png',fullPage:true});
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:960});
    for(const route of ['overview','stock','analytics']) {
      await page.goto('/'+route);await expect(page.locator('.date-line')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`../test-results/${route}-${width}.png`,fullPage:true});
    }
    await page.getByRole('button',{name:'Новый заказ',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:`../test-results/form-${width}.png`,fullPage:true});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1440,height:960});
  for (const title of ['Склад и партии','Поставки','Меню и рецептуры','Заказы','Стоп-лист','Горячие предложения','Аналитика и закупки','Демонстрация']) {
    await page.getByRole('navigation').getByRole('button',{name:title,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }
  await page.getByRole('navigation').getByRole('button',{name:'Склад и партии',exact:true}).click();
  await page.getByRole('button',{name:'Добавить продукт',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel('Название',{exact:true}).fill('Тестовый продукт');await dialog.getByText('Идентификатор для интеграций',{exact:true}).click();await dialog.getByLabel('ID',{exact:true}).fill('test-product');await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(page.getByText('Продукт добавлен',{exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Меню и рецептуры',exact:true}).click();await page.getByRole('button',{name:'Добавить блюдо',exact:true}).click();
  dialog=page.getByRole('dialog');await dialog.getByLabel('Название',{exact:true}).fill('Тестовое блюдо');await dialog.getByText('Идентификатор для интеграций',{exact:true}).click();await dialog.getByLabel('ID',{exact:true}).fill('test-dish');await chooseOption(dialog,'Продукт','test-product');await dialog.getByLabel(/^Количество/).fill('100');await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(page.getByText('Рецептура сохранена',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();dialog=page.getByRole('dialog');await dialog.getByLabel('Номер поставки').fill('UI-TEST');await chooseOption(dialog,'Продукт','test-product');await dialog.getByLabel('Количество',{exact:true}).fill('500');await dialog.getByLabel('Срок хранения, часов').fill('1');await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByText('Поставка принята. Остатки обновлены.')).toBeVisible();
  await page.getByRole('button',{name:'Новый заказ',exact:true}).click();dialog=page.getByRole('dialog');await chooseOption(dialog,'Блюдо','test-dish');await dialog.getByLabel('Порций',{exact:true}).fill('2');await dialog.getByRole('button',{name:'Принять заказ'}).click();await expect(page.getByText('Заказ принят. Ингредиенты списаны по FEFO.')).toBeVisible();
  await page.getByRole('button',{name:'Новый заказ',exact:true}).click();dialog=page.getByRole('dialog');await chooseOption(dialog,'Блюдо','test-dish');await dialog.getByLabel('Порций',{exact:true}).fill('4');await dialog.getByRole('button',{name:'Принять заказ'}).click();await expect(dialog.getByRole('heading',{name:'Заказ отклонён'})).toBeVisible();await expect(dialog.getByText('100 г не хватает · доступно 300 г')).toBeVisible();await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Демонстрация',exact:true}).click();await page.getByLabel('Сдвиг вперёд, часов').fill('2');await page.getByRole('button',{name:'Перевести время'}).click();await expect(page.getByText('Демонстрационная операция выполнена')).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Стоп-лист',exact:true}).click();await expect(page.getByRole('heading',{name:'Тестовое блюдо',exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Обзор кухни',exact:true}).click();await page.setViewportSize({width:390,height:844});
  await expect(page.locator('aside')).not.toBeInViewport();
  if(await page.getByRole('button',{name:'Закрыть сообщение'}).isVisible())await page.getByRole('button',{name:'Закрыть сообщение'}).click();
  await page.screenshot({path:'../test-results/overview-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Открыть навигацию'}).click();await page.getByRole('navigation').getByRole('button',{name:'Поставки',exact:true}).click();await expect(page.getByRole('heading',{name:'Поставки',exact:true})).toBeVisible();
});
test('API authorization, idempotency, concurrency and two SSE clients with replay', async ({request}) => {
  const headers={'X-Requested-With':'Flagman'};
  const login=await request.post('/api/login',{headers,data:{password}});expect(login.ok()).toBe(true);
  const unauth=await fetch(baseURL+'/api/snapshot');expect(unauth.status).toBe(401);
  const csrf=await request.post('/api/products',{data:{id:'forbidden',name:'X',unit:'g'}});expect(csrf.status()).toBe(403);
  const cookie=(await request.storageState()).cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  const controller=new AbortController();const clients=await Promise.all([0,1].map(()=>fetch(baseURL+'/api/events',{headers:{Cookie:cookie},signal:controller.signal})));
  const readers=clients.map(r=>r.body!.getReader());const decoder=new TextDecoder();for(const reader of readers){expect(decoder.decode((await reader.read()).value)).toContain('event: sync');}
  const productId='api-'+Date.now();expect((await request.post('/api/products',{headers,data:{id:productId,name:'API продукт',unit:'g'}})).ok()).toBe(true);
  expect((await request.post('/api/dishes',{headers,data:{id:productId,name:'API блюдо',category:'Тест',ingredients:[{productId,quantity:100}]}})).ok()).toBe(true);
  const input={number:'API-TEST',items:[{productId,quantity:100,unit:'g',shelfLifeHours:24}]};const deliveryHeaders={...headers,'Idempotency-Key':productId};const d1=await request.post('/api/deliveries',{headers:deliveryHeaders,data:input});const d2=await request.post('/api/deliveries',{headers:deliveryHeaders,data:input});expect((await d1.json()).id).toBe((await d2.json()).id);
  const conflict=await request.post('/api/deliveries',{headers:deliveryHeaders,data:{...input,number:'changed'}});expect(conflict.status()).toBe(409);
  const results=await Promise.all([1,2].map(i=>request.post('/api/orders',{headers:{...headers,'Idempotency-Key':productId+'-'+i},data:{items:[{dishId:productId,portions:1}]}})));expect(results.map(r=>r.status()).sort()).toEqual([201,422]);
  const target=(await (await request.get('/api/snapshot')).json()).revision;
  for(const reader of readers){let received='';while(!received.includes(`"id":${target},`)){const next=await reader.read();received+=decoder.decode(next.value);if(received.length>100000)throw Error('SSE target not received');}expect(received).toContain('event: change');}
  controller.abort();
  const replayController=new AbortController();const replay=await fetch(baseURL+'/api/events',{headers:{Cookie:cookie,'Last-Event-ID':String(target-1)},signal:replayController.signal});const reader=replay.body!.getReader();let data='';while(!data.includes(`id: ${target}\n`)){data+=decoder.decode((await reader.read()).value);}expect(data).toContain(`id: ${target}\n`);replayController.abort();
});
test('background expiration without orders, no repeated write-off, generator start and stop', async ({request}) => {
  const headers={'X-Requested-With':'Flagman'};await request.post('/api/login',{headers,data:{password}});
  const productId='expiry-'+Date.now();await request.post('/api/products',{headers,data:{id:productId,name:'Срок тест',unit:'g'}});
  await request.post('/api/dishes',{headers,data:{id:productId,name:'Срок блюдо',category:'Тест',ingredients:[{productId,quantity:100}]}});
  const now=(await(await request.get('/api/snapshot')).json()).now;
  const expiry=new Date(new Date(now).getTime()+5000).toISOString();
  const delivery=await request.post('/api/deliveries',{headers:{...headers,'Idempotency-Key':productId},data:{number:'AUTO-EXPIRY',items:[{productId,quantity:100,unit:'g',expiresAt:expiry}]}});expect(delivery.ok()).toBe(true);
  await expect.poll(async()=>{const s=await(await request.get('/api/snapshot')).json();return s.dishes.find((d:{id:string})=>d.id===productId).portions;},{timeout:10000}).toBe(0);
  await expect.poll(async()=>{const s=await(await request.get('/api/snapshot')).json();return s.movements.filter((m:{productId:string;kind:string})=>m.productId===productId&&m.kind==='expiry').length;}).toBe(1);
  const again=await(await request.get('/api/snapshot')).json();expect(again.movements.filter((m:{productId:string;kind:string})=>m.productId===productId&&m.kind==='expiry')).toHaveLength(1);
  const started=await request.post('/api/generator/start',{headers,data:{seed:123,intervalSeconds:1}});expect((await started.json()).running).toBe(true);
  await expect.poll(async()=>(await(await request.get('/api/generator')).json()).index).toBeGreaterThan(1);
  const stopped=await request.post('/api/generator/stop',{headers});expect((await stopped.json()).running).toBe(false);
});

test('lost committed response survives reload and recovers original order exactly once', async ({page,request})=>{
  const headers={'X-Requested-With':'Flagman'};
  await request.post('/api/login',{headers,data:{password}});
  const id='recover-'+Date.now();
  await request.post('/api/products',{headers,data:{id,name:'Восстановление',unit:'g'}});
  await request.post('/api/dishes',{headers,data:{id,name:'Блюдо восстановления',category:'Тест',ingredients:[{productId:id,quantity:100}]}});
  await request.post('/api/deliveries',{headers:{...headers,'Idempotency-Key':id},data:{number:id,items:[{productId:id,quantity:500,unit:'g',shelfLifeHours:24}]}});
  await page.goto('/orders');await page.getByLabel('Пароль управляющего').fill(password);await page.getByRole('button',{name:'Открыть кухню'}).click();
  await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
  await chooseOption(page.getByRole('dialog'),'Блюдо',id);
  await page.route('**/api/orders',async route=>{await route.fetch();await route.abort('failed');});
  await page.getByRole('button',{name:'Принять заказ'}).click();await expect(page.getByRole('alert').last()).toContainText('Результат операции неизвестен');
  await page.reload();await expect(page.getByRole('button',{name:'Восстановить результат'})).toBeVisible();
  await page.getByRole('button',{name:'Восстановить результат'}).click();await expect(page.getByRole('button',{name:'Восстановить результат'})).toHaveCount(0);
  const snapshot=await(await request.get('/api/snapshot')).json();expect(snapshot.orders.filter((o:any)=>o.items.some((i:any)=>i.dishId===id))).toHaveLength(1);expect(snapshot.products.find((p:any)=>p.id===id).usable).toBe(400);
});
