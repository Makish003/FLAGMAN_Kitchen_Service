import {acceptDocument,decideDocument,finalizeLatest} from './legacy-workflow-helpers';
import {test,expect} from '@playwright/test';
import {chooseOption} from './helpers';
import AxeBuilder from '@axe-core/playwright';
test('hackathon: optimizer → order → stale rejection; procurement → draft → preview → FEFO; responsive results',async({page,request})=>{
  test.setTimeout(150000);
  const headers={'X-Requested-With':'Flagman'};
  await page.goto('/offers');await page.getByLabel('Пароль').fill(process.env.FLAGMAN_PASSWORD!);await page.getByRole('button',{name:'Открыть кухню'}).click();
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
  const submittedDelivery=await post('/deliveries',{number:prefix,items:[p1,p2].map(productId=>({productId,quantity:1,unit:'kg',shelfLifeHours:4,unitCost:300,currency:'RUB'}))},prefix);
  const delivery=await acceptDocument(request,submittedDelivery,auth);
  s=await snapshot();const ownStock=()=>s.batches.filter((x:any)=>[p1,p2].includes(x.productId));
  const before=ownStock().map((x:any)=>x.remainingQuantity);
  const plan=await post('/planning',{demandSource:'manual',manualLimits:{[a]:10,[b]:10},horizonHours:12});
  expect(plan.provenOptimal).toBe(true);expect(plan.plan.map((p:any)=>[p.dishId,p.portions])).toEqual([[b,10]]);expect(plan.risks.filter((r:any)=>[p1,p2].includes(r.productId)).every((r:any)=>r.remainingRisk===0)).toBe(true);
  expect((await snapshot()).batches.filter((x:any)=>[p1,p2].includes(x.productId)).map((x:any)=>x.remainingQuantity)).toEqual(before);
  await page.reload();await expect(page.getByRole('heading',{name:'Параметры совместного плана'})).toBeVisible();await chooseOption(page,'Источник спроса','manual');
  await page.getByLabel('Контрольное А: лимит порций').fill('10');await page.getByLabel('Контрольное B: лимит порций').fill('10');await page.getByRole('button',{name:'Рассчитать совместный план'}).click();await expect(page.getByText('Оптимум доказан полным перебором',{exact:false})).toBeVisible();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await expect.poll(()=>page.locator('aside').getAttribute('aria-hidden')).toBe(width<1024?'true':null);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===1440){const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(audit.violations.map(v=>v.id)).toEqual([]);}await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.screenshot({path:`../test-results/hackathon-offers-${width}.png`,fullPage:true,animations:'disabled'});}
  await page.getByRole('button',{name:'Создать заказ по плану'}).click();let dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Порций',{exact:true})).toHaveValue('10');
  await dialog.getByRole('button',{name:'Рассчитать расход по партиям'}).click();await expect(dialog.getByRole('heading',{name:'Результат расчёта'})).toBeVisible();expect((await snapshot()).batches.filter((x:any)=>[p1,p2].includes(x.productId)).map((x:any)=>x.remainingQuantity)).toEqual(before);
  // Another operator spends the entire stock after preview. Ordinary commit must reject atomically.
  await decideDocument(request,await post('/orders',{items:[{dishId:b,portions:10}]},prefix+'-other'),auth);await expect(page.getByText('Склад или время изменились.',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Отправить заявку'}).click();await expect(dialog.getByRole('alert')).toContainText('Недостаточно свободных продуктов');await page.keyboard.press('Escape');
  s=await snapshot();expect(ownStock().every((x:any)=>x.remainingQuantity===0)).toBe(true);expect(s.movements.filter((m:any)=>[p1,p2].includes(m.productId)&&m.kind==='order')).toHaveLength(2);
  await page.goto('/procurement');await chooseOption(page,'Источник спроса','manual');await page.getByLabel('Контрольное B',{exact:true}).fill('10');await page.getByLabel('Доставка, часов').fill('0');await page.getByLabel('Срок закупки от поступления, часов').fill('24');await page.getByRole('button',{name:'Рассчитать сценарий'}).click();await expect(page.getByRole('button',{name:'Создать черновик поставки'})).toBeVisible();await expect(page.getByText('Склад изменился. Повторите расчёт.',{exact:true})).toHaveCount(0);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await expect.poll(()=>page.locator('aside').getAttribute('aria-hidden')).toBe(width<1024?'true':null);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.screenshot({path:`../test-results/hackathon-procurement-${width}.png`,fullPage:true,animations:'disabled'});}
  if(await page.getByText('Склад изменился. Повторите расчёт.',{exact:true}).isVisible()){await page.getByRole('button',{name:'Рассчитать сценарий'}).click();await expect(page.getByText('Склад изменился. Повторите расчёт.',{exact:true})).toHaveCount(0);}
  await page.getByRole('button',{name:'Создать черновик поставки'}).click();await expect(page.getByRole('heading',{name:'Заявки поставщикам',exact:true})).toBeVisible();expect(await page.locator('.workflow-line').count()).toBe(2);
  const replenishment=await post('/deliveries',{number:prefix+'-replenish',items:[p1,p2].map(productId=>({productId,quantity:1,unit:'kg',shelfLifeHours:24,unitCost:300,currency:'RUB'}))},prefix+'-replenish');await acceptDocument(request,replenishment,auth);
  await page.goto('/offers');await chooseOption(page,'Источник спроса','manual');await page.getByLabel('Контрольное B: лимит порций').fill('1');await page.getByRole('button',{name:'Рассчитать совместный план'}).click();await page.getByRole('button',{name:'Создать заказ по плану'}).click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Порций',{exact:true})).toHaveValue('1');await dialog.getByRole('button',{name:'Отправить заявку'}).click();await expect(page.getByText('Заявка на заказ отправлена. Ожидает приготовления.')).toBeVisible();await finalizeLatest(page.request,'order');
  await page.goto('/forecast');await page.getByRole('button',{name:'Рассчитать сценарий'}).click();await expect(page.getByRole('button',{name:'Рассчитать сценарий'})).toBeEnabled();await expect(page.locator('.metric').filter({hasText:'История спроса'})).toBeVisible();for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await expect.poll(()=>page.locator('aside').getAttribute('aria-hidden')).toBe(width<1024?'true':null);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});await page.screenshot({path:`../test-results/hackathon-forecast-${width}.png`,fullPage:true,animations:'disabled'});}
  await post('/archive/dishes/'+a,{});const archivePlan=await post('/planning',{});expect(archivePlan.plan.every((p:any)=>p.dishId!==a)).toBe(true);
  const detail=await request.get('/api/details/deliveries/'+delivery.deliveryId,{headers:auth});expect((await detail.json()).batches.every((x:any)=>x.unitCost===0.3&&x.currency==='RUB')).toBe(true);
});
