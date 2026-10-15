import {test,expect} from '@playwright/test';

test('generator API commits orders and deliveries and retains the event journal',async({request})=>{
  const headers={'X-Requested-With':'Flagman'};
  expect((await request.post('/api/login',{headers,data:{login:'manager',password:process.env.FLAGMAN_PASSWORD!}})).ok()).toBe(true);
  await request.post('/api/demo/seed',{headers});
  await request.post('/api/generator/stop',{headers});
  const seed=Date.now()%1000000000;
  await request.post('/api/generator/start',{headers,data:{seed,intervalSeconds:1}});
  await expect.poll(async()=>(await(await request.get('/api/generator')).json()).index,{timeout:20000}).toBeGreaterThanOrEqual(3);
  await request.post('/api/generator/stop',{headers});
  const state=await(await request.get('/api/generator')).json();
  const history=await(await request.get(`/api/history/generatorEvents?q=${seed}`)).json();
  expect(history.total).toBe(state.index);
  for(const event of history.items){
    const entity=event.kind==='delivery'?'delivery-requests':'order-requests';
    const details=await(await request.get(`/api/${entity}/${event.entityId}`)).json();
    expect(details.id).toBe(event.entityId);
    expect(details.status).toBe('submitted');
  }
  await request.post('/api/generator/start',{headers,data:{seed,intervalSeconds:1}});
  await expect.poll(async()=>(await(await request.get('/api/generator')).json()).nextIndex,{timeout:20000}).toBeGreaterThan(state.nextIndex);
  await request.post('/api/generator/stop',{headers});
});

test('generator persists visible operations, logs results and resumes the same seed',async({page,request})=>{
  const headers={'X-Requested-With':'Flagman'};
  await request.post('/api/login',{headers,data:{login:'manager',password:process.env.FLAGMAN_PASSWORD!}});
  await request.post('/api/demo/seed',{headers});
  await request.post('/api/generator/stop',{headers});
  await page.goto('/generator');
  await page.getByLabel('Пароль').fill(process.env.FLAGMAN_PASSWORD!);
  await page.getByRole('button',{name:'Открыть кухню'}).click();
  const seed=Date.now()%1000000000;
  await page.getByLabel('Seed',{exact:true}).fill(String(seed));
  await page.getByLabel('Интервал, секунд').fill('1');
  await page.getByText('Журнал событий генератора',{exact:true}).click();
  await page.getByRole('button',{name:'Запустить генератор'}).click();
  await expect.poll(async()=>(await(await request.get('/api/generator')).json()).index,{timeout:20000}).toBeGreaterThanOrEqual(3);
  await page.getByRole('button',{name:'Остановить',exact:true}).click();
  const status=await(await request.get('/api/generator')).json();
  const history=await(await request.get(`/api/history/generatorEvents?size=100&q=${seed}`)).json();
  expect(history.items.length).toBe(status.index);
  const log=page.locator('.generator-log');await log.getByLabel('Поиск по всей истории').fill(String(seed));
  await expect(log.locator('tbody tr')).toHaveCount(status.index);
  const snapshot=await(await request.get('/api/snapshot')).json();
  for(const event of history.items){
    const entities=(await(await request.get('/api/'+(event.kind==='delivery'?'delivery-requests':'order-requests')+'?size=100')).json()).items;
    expect(entities.some((entity:{id:string})=>entity.id===event.entityId)).toBe(true);
    await expect(log.getByRole('button',{name:'#'+event.entityId.slice(0,8).toUpperCase(),exact:true})).toBeVisible();
  }
  const delivery=history.items.find((e:{kind:string})=>e.kind==='delivery');
  await log.getByRole('button',{name:'#'+delivery.entityId.slice(0,8).toUpperCase(),exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText(`ГЕН-${seed}-0`);
  await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Поставки',exact:true}).click();
  await expect(page.getByText(`ГЕН-${seed}-0`,{exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Заказы',exact:true}).click();
  const order=history.items.find((e:{kind:string})=>e.kind==='order');
  await expect(page.locator('.workflow-card').filter({hasText:order.entityId.slice(0,8)})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Демонстрация',exact:true}).click();
  await page.getByLabel('Seed',{exact:true}).fill(String(seed));
  await page.getByLabel('Интервал, секунд').fill('1');
  await page.getByRole('button',{name:'Запустить генератор'}).click();
  await expect.poll(async()=>(await(await request.get('/api/generator')).json()).nextIndex,{timeout:20000}).toBeGreaterThan(status.nextIndex);
  await page.getByRole('button',{name:'Остановить',exact:true}).click();
  await page.reload();
  await page.getByText('Журнал событий генератора',{exact:true}).click();
  await expect(log.locator('tbody tr').first()).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../test-results/generator-mobile.png',fullPage:true});
});
