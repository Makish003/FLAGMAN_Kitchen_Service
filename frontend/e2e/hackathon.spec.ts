import {test,expect} from '@playwright/test';
import {chooseOption} from './helpers';
import AxeBuilder from '@axe-core/playwright';
test('hackathon: optimizer → order → stale rejection; procurement → draft → preview → FEFO; responsive results',async({page,request})=>{
  test.setTimeout(150000);
  const headers={'X-Requested-With':'Flagman'};
  await page.goto('/offers');await page.getByLabel('Пароль управляющего').fill(process.env.FLAGMAN_PASSWORD!);await page.getByRole('button',{name:'Открыть кухню'}).click();
  await expect(page.locator('.date-line')).toBeVisible();
  // Share the authenticated browser session, avoiding another login / rate-limit slot.
  const cookies=await page.context().cookies();const cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');const auth={...headers,Cookie:cookie};
  const post=async(path:string,data:any,key?:string)=>{const response=await request.post('/api'+path,{headers:{...auth,...(key?{'Idempotency-Key':key}:{})},data});expect(response.ok(),await response.text()).toBe(true);return response.json();};
  const snapshot=async()=> {const response=await request.get('/api/snapshot',{headers:auth});expect(response.status()).toBe(200);return response.json();};
  let s=await snapshot();await request.put('/api/settings',{headers:auth,data:{...s.settings,openHour:0,closeHour:24,openDays:[0,1,2,3,4,5,6],planningHours:24,leadTimeHours:0,safetyFactor:0}});
  const prefix='hack-'+Date.now();const p1=prefix+'-1',p2=prefix+'-2',a=prefix+'-a',b=prefix+'-b';
  for(const id of [p1,p2])await post('/products',{id,name:id===p1?'Контрольный продукт 1':'Контрольный продукт 2',unit:'g'});
  await post('/dishes',{id:a,name:'Контрольное А',category:'Проверка',ingredients:[{productId:p1,quantity:100},{productId:p2,quantity:10}]});
  await post('/dishes',{id:b,name:'Контрольное B',category:'Проверка',ingredients:[{productId:p1,quantity:100},{productId:p2,quantity:100}]});
  const delivery=await post('/deliveries',{number:prefix,items:[p1,p2].map(productId=>({productId,quantity:1,unit:'kg',shelfLifeHours:4,unitCost:300,currency:'RUB'}))},prefix);
  s=await snapshot();const ownStock=()=>s.batches.filter((x:any)=>[p1,p2].includes(x.productId));
  const before=ownStock().map((x:any)=>x.remainingQuantity);
  const plan=await post('/planning',{demandSource:'manual',manualLimits:{[a]:10,[b]:10},horizonHours:12});
  expect(plan.provenOptimal).toBe(true);expect(plan.plan.map((p:any)=>[p.dishId,p.portions])).toEqual([[b,10]]);expect(plan.risks.filter((r:any)=>[p1,p2].includes(r.productId)).every((r:any)=>r.remainingRisk===0)).toBe(true);
  expect((await snapshot()).batches.filter((x:any)=>[p1,p2].includes(x.productId)).map((x:any)=>x.remainingQuantity)).toEqual(before);
  await page.reload();await expect(page.getByRole('heading',{name:'Параметры совместного плана'})).toBeVisible();await chooseOption(page,'Источник спроса','manual');
  await page.getByLabel('Контрольное А: лимит порций').fill('10');await page.getByLabel('Контрольное B: лимит порций').fill('10');await page.getByRole('button',{name:'Рассчитать совместный план'}).click();await expect(page.getByText('Оптимум доказан полным перебором',{exact:false})).toBeVisible();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await expect.poll(()=>page.locator('aside').getAttribute('aria-hidden')).toBe(width<1024?'true':null);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===1440){const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(audit.violations.map(v=>v.id)).toEqual([]);}await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.screenshot({path:`../test-results/hackathon-offers-${width}.png`,fullPage:true,animations:'disabled'});}
  await page.getByRole('button',{name:'Создать заказ по плану'}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Порций',{exact:true})).toHaveValue('10');
  await dialog.getByRole('button',{name:'Предпросмотр расхода по партиям'}).click();await expect(dialog.getByRole('heading',{name:'Серверный предпросмотр'})).toBeVisible();expect((await snapshot()).batches.filter((x:any)=>[p1,p2].includes(x.productId)).map((x:any)=>x.remainingQuantity)).toEqual(before);
  // Another operator spends the entire stock after preview. Ordinary commit must reject atomically.
  await post('/orders',{items:[{dishId:b,portions:10}]},prefix+'-other');await expect(page.getByText('Склад или время изменились.',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Принять заказ'}).click();await expect(dialog.getByRole('heading',{name:'Заказ отклонён'})).toBeVisible();await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
  s=await snapshot();expect(ownStock().every((x:any)=>x.remainingQuantity===0)).toBe(true);expect(s.movements.filter((m:any)=>[p1,p2].includes(m.productId)&&m.kind==='order')).toHaveLength(2);
  await page.goto('/procurement');await chooseOption(page,'Источник спроса','manual');await page.getByLabel('Контрольное B: порций за рабочий день').fill('10');await page.getByLabel('Доставка, часов').fill('0');await page.getByLabel('Срок закупки от поступления, часов').fill('24');await page.getByRole('button',{name:'Рассчитать сценарий'}).click();await expect(page.getByRole('button',{name:'Создать черновик поставки'})).toBeVisible();await expect(page.getByText('Склад изменился. Повторите расчёт.',{exact:true})).toHaveCount(0);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await expect.poll(()=>page.locator('aside').getAttribute('aria-hidden')).toBe(width<1024?'true':null);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.screenshot({path:`../test-results/hackathon-procurement-${width}.png`,fullPage:true,animations:'disabled'});}
  const movementCount=(await snapshot()).movements.filter((m:any)=>[p1,p2].includes(m.productId)).length;
  await page.getByRole('button',{name:'Создать черновик поставки'}).click();dialog=page.getByRole('dialog');expect(await dialog.getByLabel('Количество',{exact:true}).count()).toBe(2);
  const snap=await snapshot();const time=new Date(new Date(snap.now).getTime()-60000);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:snap.settings.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time);const val=(key:string)=>parts.find(p=>p.type===key)!.value;
  await dialog.getByText('Время поступления',{exact:true}).click();await dialog.getByLabel('Время поступления (пояс ресторана)').fill(`${val('year')}-${val('month')}-${val('day')}T${val('hour')}:${val('minute')}`);
  for(const input of await dialog.getByLabel('Срок хранения, часов').all())await input.fill('24');
  await dialog.getByRole('button',{name:'Что изменится после поставки?'}).click();await expect(dialog.getByRole('heading',{name:'Серверный предпросмотр'})).toBeVisible();expect((await snapshot()).movements.filter((m:any)=>[p1,p2].includes(m.productId))).toHaveLength(movementCount);
  await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByText('Поставка принята. Остатки обновлены.')).toBeVisible();
  await page.goto('/offers');await chooseOption(page,'Источник спроса','manual');await page.getByLabel('Контрольное B: лимит порций').fill('1');await page.getByRole('button',{name:'Рассчитать совместный план'}).click();await page.getByRole('button',{name:'Создать заказ по плану'}).click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Порций',{exact:true})).toHaveValue('1');await dialog.getByRole('button',{name:'Принять заказ'}).click();await expect(page.getByText('Заказ принят. Ингредиенты списаны по FEFO.')).toBeVisible();
  await page.goto('/forecast');await page.getByRole('button',{name:'Рассчитать сценарий'}).click();await expect(page.getByRole('button',{name:'Рассчитать сценарий'})).toBeEnabled();await expect(page.getByText(/обучение:/)).toBeVisible();for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await expect.poll(()=>page.locator('aside').getAttribute('aria-hidden')).toBe(width<1024?'true':null);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.screenshot({path:`../test-results/hackathon-forecast-${width}.png`,fullPage:true,animations:'disabled'});}
  await post('/archive/dishes/'+a,{});const archivePlan=await post('/planning',{});expect(archivePlan.plan.every((p:any)=>p.dishId!==a)).toBe(true);
  const detail=await request.get('/api/details/deliveries/'+delivery.id,{headers:auth});expect((await detail.json()).batches.every((x:any)=>x.unitCost===0.3&&x.currency==='RUB')).toBe(true);
});
