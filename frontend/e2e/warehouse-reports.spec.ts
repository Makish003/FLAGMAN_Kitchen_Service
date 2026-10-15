import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';

const now='2026-10-13T07:00:00Z';
const analytics={from:'2026-10-06T21:00:00Z',to:now,timezone:'Europe/Moscow',ordersAccepted:77,ordersRejected:36,lossBatches:12,priceCoverage:[{kind:'order',priced:10,total:20},{kind:'expiry',priced:5,total:12}],costs:[{currency:'RUB',consumed:24800,wasted:3600}],products:[{id:'t',name:'Томаты',unit:'g',consumed:4200,wasted:500,shortageCount:20,shortageQuantity:300350,affectedDishes:['caprese']},{id:'m',name:'Моцарелла',unit:'g',consumed:2200,wasted:0,shortageCount:10,shortageQuantity:178860,affectedDishes:['caprese']}],daily:Array.from({length:7},(_,i)=>({day:`2026-10-${String(i+7).padStart(2,'0')}`,accepted:[8,12,17,0,9,16,15][i],rejected:[3,4,6,0,8,10,5][i]}))};
const snapshot={now,revision:1,settings:{timezone:'Europe/Moscow',warningHours:48,leadTimeHours:2,planningHours:24,forecastHours:48,demandWindowDays:7},products:[{id:'t',name:'Томаты',unit:'g',usable:26,physical:26,expiring:26,expired:0},{id:'m',name:'Моцарелла',unit:'g',usable:0,physical:0,expiring:0,expired:0}],dishes:[{id:'caprese',name:'Капрезе',portions:0,ingredients:[{productId:'t',quantity:200},{productId:'m',quantity:120}],shortages:[{productId:'t',productName:'Томаты',unit:'g',requested:200,available:26,missing:174},{productId:'m',productName:'Моцарелла',unit:'g',requested:120,available:0,missing:120}]}],batches:[],expiringBatches:[],deliveries:[],orders:[],movements:[],recommendations:[],analytics,totals:{batches:1,activeBatches:1,warningBatches:1,deliveries:1,orders:113,movements:32}};
const scenario={revision:1,demand:{basis:'История; сглаженный профиль дня недели/часа',hasHistory:true,trainingOrders:77,trainingDays:3},forecasts:[{dishId:'caprese',dishName:'Капрезе',stopFrom:'2026-10-13T07:00:03Z',stopTo:'2026-10-13T07:00:03Z',reason:'Моцарелла: исходный дефицит'},{dishId:'pasta',dishName:'Паста с томатами',stopFrom:'2026-10-14T07:00:00Z',stopTo:'2026-10-14T07:15:00Z',reason:'Томаты: расход'}],purchases:[{productId:'t',name:'Томаты',unit:'g',quantity:1600,demandBeforeArrival:500,usableAtArrival:0,demandAfterArrival:1400,arrival:'2026-10-13T09:00:00Z',likelyExcess:null,shelfLifeHours:null},{productId:'m',name:'Моцарелла',unit:'g',quantity:960,demandBeforeArrival:240,usableAtArrival:0,demandAfterArrival:840,arrival:'2026-10-13T09:00:00Z',likelyExcess:null,shelfLifeHours:null}],limitations:'Сценарии спроса, шаг прогноза до 15 минут. Количества разных единиц не суммируются.'};
async function fixture(page:Page,empty=false) {
  const data=empty?{...snapshot,products:[],dishes:[],analytics:{...analytics,ordersAccepted:0,ordersRejected:0,lossBatches:0,products:[],costs:[],priceCoverage:[],daily:analytics.daily.map(d=>({...d,accepted:0,rejected:0}))},totals:{batches:0,activeBatches:0,warningBatches:0,deliveries:0,orders:0,movements:0}}:snapshot;
  await page.route('**/*',route=>{const pathname=new URL(route.request().url()).pathname;return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});});
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
    return route.fulfill({json:['/api/delivery-requests','/api/order-requests','/api/procurement-requests'].includes(pathname)?{items:[],total:0,page:1,size:50}:['/api/accounts','/api/offers/overrides'].includes(pathname)?[]:pathname==='/api/session'?{id:'mock-manager',role:'manager',name:'Управляющий',demo:!empty}:pathname.startsWith('/api/history/')?{items:[],total:0}:pathname==='/api/scenario'?scenario:pathname==='/api/analytics'?data.analytics:data});
  });
}
test('stop-list opens a calculated purchase plan and transfers quantities to a draft',async({page})=>{
  await fixture(page);await page.goto('/stop');
  await page.getByRole('button',{name:'План закупок',exact:true}).click();
  await expect(page).toHaveURL(/procurement$/);
  await expect(page.getByLabel('Закупить Томаты')).toHaveValue('1600');
  await page.getByRole('button',{name:'Создать черновик поставки'}).click();
  await expect(page.getByRole('heading',{name:'Заявки поставщикам',exact:true})).toBeVisible();
  await expect(page.locator('.workflow-line').getByLabel('Количество',{exact:true}).first()).toHaveValue('1600');
  await expect(page.locator('.workflow-line').getByLabel('Количество',{exact:true}).nth(1)).toHaveValue('960');
});
test('empty production warehouse has honest, compact states and inset report content',async({page})=>{
  await fixture(page,true);
  for(const route of ['overview','analytics','forecast','menu']){
    await page.goto('/'+route);
    if(route==='overview'){
      await expect(page.locator('.warehouse-health')).toContainText('Ожидает настройки');
      await expect(page.locator('.warehouse-health')).not.toContainText('Стабильно');
    }
    if(route==='analytics'){
      await expect(page.locator('.chart-column')).toHaveCount(7);
      await expect(page.locator('.chart-readout .green-text')).toHaveText('0 принято');
      await expect(page.getByRole('button',{name:'Все дни',exact:true})).toBeVisible();
    }
    if(route==='forecast'){
      await expect(page.getByRole('button',{name:'Рассчитать сценарий',exact:true})).toBeDisabled();
      await expect(page.getByText('В меню нет активных блюд')).toBeVisible();
    }
    if(route==='menu'){
      await expect(page.locator('.menu-empty-panel')).toBeVisible();
      await expect(page.locator('.menu-empty-panel').getByRole('button',{name:'Добавить блюдо',exact:true})).toBeVisible();
      await expect(page.locator('.menu-empty-panel')).toContainText('Добавьте первое блюдо и его ингредиенты');
    }
    for(const width of [390,768,1440]){
      await page.setViewportSize({width,height:960});
      await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const gaps=await page.locator('.report-section').evaluateAll(sections=>sections.map(section=>{const heading=section.querySelector('h2')!.getBoundingClientRect(),box=section.getBoundingClientRect();return {left:heading.left-box.left,top:heading.top-box.top};}));
      for(const gap of gaps){expect(gap.left).toBeGreaterThanOrEqual(16);expect(gap.top).toBeGreaterThanOrEqual(16);}
      await page.screenshot({path:`../test-results/reports/empty-${route}-${width}.png`,fullPage:true});
    }
  }
});
test('business conclusions, chart values and forecast states remain clear across viewports',async({page})=>{
  await fixture(page);
  for(const route of ['overview','analytics','procurement','forecast']) {
    await page.goto('/'+route);
    if(route==='forecast')await page.getByRole('button',{name:'Рассчитать сценарий',exact:true}).click();
    if(route==='procurement')await expect(page.getByLabel('Закупить Томаты')).toBeVisible();
    if(route==='analytics'){
      await expect(page.getByRole('heading',{name:'Снизьте отказы из-за нехватки продуктов'})).toBeVisible();
      await expect(page.locator('.business-summary')).toContainText('36 из 113');
      await expect(page.locator('.orders-day').nth(3)).toHaveAttribute('data-accepted','0');
      await expect(page.locator('.orders-day').nth(2)).toHaveAttribute('data-accepted','17');
      await page.locator('.chart-column').nth(3).click();
      await expect(page.locator('.chart-readout')).toContainText('10.10.2026');
      await expect(page.locator('.chart-readout .green-text')).toHaveText('0 принято');
      await expect(page.locator('.chart-readout .error-text')).toHaveText('0 отклонено');
      await expect(page.getByLabel('С даты',{exact:true})).toBeVisible();
    }
    if(route==='forecast'){
      await expect(page.getByRole('row').filter({hasText:'Капрезе'})).toContainText('Сейчас');
      await expect(page.getByRole('row').filter({hasText:'Паста с томатами'})).toContainText('Риск');
      await expect(page.locator('.report-details')).not.toHaveAttribute('open');
    }
    for(const width of [390,768,1440]){
      await page.setViewportSize({width,height:960});
      await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
      await page.screenshot({path:`../test-results/reports/${route}-${width}.png`,fullPage:true});
    }
  }
});
test('header clock stays visible while scrolling and empty reports are aligned',async({page})=>{
  await fixture(page,true);
  await page.goto('/analytics');
  await expect(page.locator('.topbar').getByTestId('current-time')).toBeVisible();
  await expect(page.locator('main').getByTestId('current-time')).toHaveCount(0);
  await expect(page.locator('.topbar .live')).toHaveCount(0);
  await expect(page.locator('.chart-column')).toHaveCount(7);
  await expect(page.locator('.chart-readout .error-text')).toHaveText('0 отклонено');
  for(const width of [280,320,390,768,1440]){
    await page.setViewportSize({width,height:700});
    await page.evaluate(()=>window.scrollTo(0,800));
    await expect(page.locator('.topbar').getByTestId('current-time')).toBeInViewport();
    expect(Math.abs((await page.locator('.topbar').boundingBox())!.y)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const clock=(await page.getByTestId('current-time').boundingBox())!,logout=(await page.getByRole('button',{name:'Выйти',exact:true}).boundingBox())!;
    expect(clock.x+clock.width).toBeLessThanOrEqual(logout.x);
    await page.screenshot({path:`../test-results/reports/sticky-clock-${width}.png`});
  }
  await page.goto('/overview');
  const warehouseCenter=await page.locator('.warehouse-health .report-empty').evaluate(node=>{
    const panel=node.closest('.report-section')!.getBoundingClientRect(),text=node.querySelector('div')!.getBoundingClientRect();
    return Math.abs((text.left+text.right)/2-(panel.left+panel.right)/2);
  });
  expect(warehouseCenter).toBeLessThanOrEqual(1);
});

test('a one-day chart stays compact beside five shortages and search retains highlighted quantities',async({page})=>{
  await fixture(page);
  const products=Array.from({length:5},(_,i)=>({...analytics.products[0],id:`product-${i}`,name:['Томаты','Моцарелла','Базилик','Куриное филе','Салат романо'][i],shortageCount:20-i*3}));
  const data={...snapshot,analytics:{...analytics,from:'2026-10-12T21:00:00Z',products,daily:[{day:'2026-10-13',accepted:77,rejected:36}]}};
  await page.route('**/api/snapshot',route=>route.fulfill({json:data}));
  await page.goto('/analytics');
  await expect(page.locator('.shortage-ranking li')).toHaveCount(5);
  await expect(page.locator('.orders-day')).toHaveCount(1);
  await expect(page.locator('.chart-readout .green-text')).toHaveText('77 принято');
  await expect(page.locator('.chart-readout .error-text')).toHaveText('36 отклонено');
  const bottomGap=await page.locator('.chart-panel').evaluate(panel=>panel.getBoundingClientRect().bottom-panel.querySelector('.chart-readout')!.getBoundingClientRect().bottom);
  expect(bottomGap).toBeLessThanOrEqual(26);
  const chartHeight=(await page.locator('.chart-panel').boundingBox())!.height;
  expect(chartHeight).toBeLessThan(500);
  expect(chartHeight).toBeLessThan((await page.locator('.shortage-ranking').boundingBox())!.height);
  await page.getByLabel('Найти продукт в аналитике').fill('Куриное');
  const row=page.locator('.analytics-products tbody tr');
  await expect(row).toHaveCount(1);await expect(row).toContainText('11 отказов');
  await expect(row.locator('.error-text')).toContainText('300');
  await page.getByLabel('Найти продукт в аналитике').fill('Несуществующий продукт');
  await expect(page.getByText('Продуктов с таким названием нет')).toBeVisible();
  await page.getByLabel('Найти продукт в аналитике').fill('');
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:960});
    await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
    await page.screenshot({path:`../test-results/reports/analytics-priorities-${width}.png`,fullPage:true});
  }
});

test('delivery journals use separate rounded records and keep both navigation actions',async({page})=>{
  await fixture(page);
  const deliveries=[{id:'delivery-1',number:'П-101',createdAt:now,receivedAt:now,batchIds:['batch-1']},{id:'delivery-2',number:'П-102',createdAt:now,receivedAt:now,batchIds:['batch-2']}];
  await page.route('**/api/history/deliveries?**',route=>route.fulfill({json:{items:deliveries,total:2}}));
  await page.goto('/deliveries');await page.getByRole('tab',{name:'Проведённые поставки'}).click();
  const table=page.locator('.record-table');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  const gap=await table.evaluate(table=>{const rows=table.querySelectorAll('tbody tr');return rows[1].getBoundingClientRect().top-rows[0].getBoundingClientRect().bottom;});
  expect(gap).toBeGreaterThanOrEqual(10);
  await expect(table.locator('tbody td').first()).toHaveCSS('border-top-left-radius','12px');
  await expect(table.getByRole('button',{name:'П-101',exact:true})).toBeVisible();
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:960});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/reports/delivery-records-${width}.png`,fullPage:true});
  }
  await table.getByRole('button',{name:'Посмотреть партии'}).first().click();
  await expect(page).toHaveURL(url=>url.pathname==='/stock'&&url.searchParams.get('q')==='delivery-1');
});
