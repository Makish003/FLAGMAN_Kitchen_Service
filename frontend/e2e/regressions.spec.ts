import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {chooseOption} from './helpers';
import type {Recommendation} from '../src/types';

test.use({baseURL:'http://localhost:5080',timezoneId:'Europe/Moscow'});
const now='2026-10-11T05:00:00Z';
const analytics={timezone:'Europe/Moscow',priceCoverage:[],from:'2026-10-01T00:00:00Z',to:now,ordersAccepted:1,ordersRejected:0,lossBatches:0,products:[],daily:[]};
test.describe('receipt date validation',()=>{
  test.use({timezoneId:'America/Los_Angeles'});
  test('past restaurant days are highlighted and block preview and save',async({page})=>{
    await fixture(page);
    let requests=0;
    await page.route(/\/api\/deliveries(?:\/preview)?$/,route=>{requests++;return route.fulfill({json:{}});});
    await page.goto('/deliveries');
    await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
    const dialog=page.getByRole('dialog');
    const receipt=dialog.getByLabel(/^Время поступления/);
    await expect(receipt).toHaveAttribute('min','2026-10-11T00:00');
    await dialog.getByLabel('Количество',{exact:true}).fill('100');
    await receipt.fill('2026-10-10T23:59');
    await expect(receipt).toHaveAttribute('aria-invalid','true');
    await expect(dialog.getByRole('alert')).toContainText('Дата поступления не может быть раньше');
    expect(await receipt.evaluate(input=>(input as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
    await dialog.getByRole('button',{name:'Рассчитать результат поставки',exact:true}).click();
    await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
    expect(requests).toBe(0);
    for(const value of ['2026-10-11T00:00','2026-10-12T12:00','']){
      await receipt.fill(value);
      await expect(receipt).toHaveAttribute('aria-invalid','false');
      expect(await receipt.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(true);
      await expect(dialog.getByRole('alert')).toHaveCount(0);
    }
  });
});
async function fixture(page:Page,menu={active:true},recommendations:Recommendation[]=[]){
  let revision=1;
  await page.addInitScript(()=>{
    (window as any).EventSource=class extends EventTarget {
      constructor(){super();((window as any).__streams??=[]).push(this);}
      close(){}
    };
  });
  await page.route('**/*',route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
  });
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    const body=['/api/delivery-requests','/api/order-requests','/api/procurement-requests'].includes(pathname)?{items:[],total:0,page:1,size:50}:['/api/accounts','/api/offers/overrides'].includes(pathname)?[]:pathname==='/api/session'?{id:'mock-manager',role:'manager',name:'Управляющий',demo:true}:
      pathname.startsWith('/api/history/')?{items:[],total:0}:
      {now,revision,settings:{timezone:'Europe/Moscow',warningHours:48,leadTimeHours:2},products:[{id:'t',name:'Томаты',unit:'g',usable:1000,physical:1000}],dishes:menu.active?[{id:'a',name:'Блюдо А',portions:2,ingredients:[{productId:'t',quantity:500}],shortages:[]}]:[],batches:[],deliveries:[],orders:[],movements:[],recommendations,analytics,totals:{batches:0,deliveries:0,orders:0,movements:0}};
    return route.fulfill({json:body});
  });
  return async()=>{
    revision++;
    const response=page.waitForResponse('**/api/snapshot');
    await page.evaluate(()=>(window as any).__streams.forEach((stream:EventTarget)=>stream.dispatchEvent(new Event('change'))));
    await response;
  };
}

test('single-portion ranking stays readable alongside a calculated joint plan',async({page})=>{
  await fixture(page,{active:true},[{dishId:'a',dishName:'Блюдо А',score:3.098,availablePortions:2,reasons:[{batchId:'batch-a',productName:'Томаты',quantity:500,unit:'g',expiresAt:'2026-10-11T09:00:00Z',hoursLeft:4}]}]);
  await page.route('**/api/planning',route=>route.fulfill({json:{revision:1,start:now,validUntil:'2026-10-12T05:00:00Z',demandBasis:'Только склад',plan:[{dishId:'a',dishName:'Блюдо А',portions:1,prepareAt:now,limitingIngredient:'Томаты',reasons:[]}],baseline:[],risks:[],score:3,baselineScore:2,pricedBatches:0,riskBatches:0}}));
  await page.goto('/offers');
  const ranking=page.locator('section').filter({has:page.getByRole('heading',{name:'Рейтинг блюд по одной порции',exact:true})});
  await expect(ranking).toBeVisible();
  await page.getByRole('button',{name:'Рассчитать совместный план',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Совместный план продаж',exact:true})).toBeVisible();
  await expect(ranking).toBeVisible();
  const card=ranking.locator('.offer-plan-card');
  await expect(card.getByRole('heading',{name:'Блюдо А',exact:true})).toBeVisible();
  await expect(card).toContainText('Оценка приоритета');
  await expect(card).toContainText('До 2 порций');
  await expect(card).toContainText('Расход скоропортящихся партий на 1 порцию');
  await expect(card).toContainText('500 г');
  await expect(card.getByRole('button',{name:'Партия #BATCH-A'})).toBeVisible();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:960});
    await expect(card).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await ranking.screenshot({path:`../test-results/reports/offers-ranking-${width}.png`});
  }
  await page.getByLabel('Приготовление, минут на слот').fill('15');
  await expect(page.getByRole('heading',{name:'Совместный план продаж',exact:true})).toHaveCount(0);
  await expect(ranking).toBeVisible();
});

test('offers cannot calculate without a menu or revive a result after the last dish is archived',async({page})=>{
  const menu={active:false},refresh=await fixture(page,menu);
  let requests=0,release!:()=>void,started!:()=>void;
  const requested=new Promise<void>(resolve=>started=resolve);
  await page.route('**/api/planning',async route=>{
    requests++;started();await new Promise<void>(resolve=>release=resolve);
    await route.fulfill({json:{revision:1,start:now,validUntil:'2026-10-12T05:00:00Z',demandBasis:'СТАРЫЙ РАСЧЁТ',plan:[],baseline:[],risks:[],score:0,baselineScore:0}});
  });
  await page.goto('/offers');
  const calculate=page.getByRole('button',{name:'Рассчитать совместный план',exact:true});
  await expect(calculate).toBeDisabled();
  await expect(page.locator('#offers-menu-required')).toContainText('В меню нет активных блюд');
  expect(requests).toBe(0);
  menu.active=true;await refresh();await expect(calculate).toBeEnabled();
  await calculate.click();await requested;
  menu.active=false;await refresh();await expect(page.getByRole('button',{name:'Рассчитываем…',exact:true})).toBeDisabled();
  release();await expect(page.getByText('СТАРЫЙ РАСЧЁТ',{exact:false})).toHaveCount(0);
  await expect(calculate).toBeDisabled();
  await expect(page.getByRole('heading',{name:'Совместный план продаж'})).toHaveCount(0);
});

test('order and delivery journal search follows the heading without double padding',async({page})=>{
  await fixture(page);
  for(const route of ['orders','deliveries']){
    await page.goto('/'+route);if(route==='deliveries')await page.getByRole('tab',{name:'Проведённые поставки'}).click();
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:960});
      const gap=await page.locator('.panel').filter({has:page.locator('.history-toolbar')}).evaluate(panel=>{
        const subtitle=panel.querySelector('.panel-title p')!.getBoundingClientRect();
        const search=panel.querySelector('.history-toolbar .search')!.getBoundingClientRect();
        return search.top-subtitle.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(15.999);expect(gap).toBeLessThanOrEqual(24.001);
      await page.screenshot({path:`../test-results/reports/search-${route}-${width}.png`,fullPage:true});
    }
  }
});

for(const endpoint of ['scenario','planning']){
  test(`${endpoint}: late results and errors cannot revive after edits`,async({page})=>{
    await fixture(page);
    let release!:()=>void;
    let requested!:()=>void;
    let started=new Promise<void>(resolve=>requested=resolve);
    let response:unknown=endpoint==='scenario'?{revision:1,demand:{basis:'СТАРЫЙ РАСЧЁТ',trainingOrders:0,trainingDays:0},forecasts:[],purchases:[],limitations:''}:
      {revision:1,start:now,validUntil:'2026-10-12T05:00:00Z',demandBasis:'СТАРЫЙ РАСЧЁТ',plan:[],baseline:[],risks:[],score:0,baselineScore:0};
    let status=200;
    await page.route(`**/api/${endpoint}`,async route=>{
      const gate=new Promise<void>(resolve=>release=resolve);requested();await gate;
      await route.fulfill({status,json:response});
    });
    await page.goto(endpoint==='scenario'?'/forecast':'/offers');
    const calculate=page.getByRole('button',{name:endpoint==='scenario'?'Рассчитать сценарий':'Рассчитать совместный план',exact:true});
    await calculate.click();await started;
    await chooseOption(page.locator('main'),'Сценарий','high');
    await chooseOption(page.locator('main'),'Сценарий','normal');
    release();await expect(calculate).toBeEnabled();
    await expect(page.getByText('СТАРЫЙ РАСЧЁТ',{exact:false})).toHaveCount(0);
    status=400;response={error:'СТАРАЯ ОШИБКА'};started=new Promise<void>(resolve=>requested=resolve);
    await calculate.click();await started;
    await chooseOption(page.locator('main'),'Сценарий','low');
    release();await expect(calculate).toBeEnabled();
    await expect(page.getByText('СТАРАЯ ОШИБКА',{exact:true})).toHaveCount(0);
  });
}

test('delivery preview is invalidated by warehouse updates and late responses',async({page})=>{
  const refresh=await fixture(page);
  let release!:()=>void;
  let requested!:()=>void;
  const started=new Promise<void>(resolve=>requested=resolve);
  let delayed=false;
  await page.route('**/api/deliveries/preview',async route=>{
    if(delayed){const gate=new Promise<void>(resolve=>release=resolve);requested();await gate;}
    await route.fulfill({json:{arrival:now,evaluatedAt:now,batches:[],changes:[]}});
  });
  await page.goto('/deliveries');
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Количество',{exact:true}).fill('500');
  const calculate=dialog.getByRole('button',{name:'Рассчитать результат поставки'});
  await calculate.click();await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toBeVisible();
  await refresh();await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toHaveCount(1);await expect(dialog.getByText('Склад изменился. Показан предыдущий результат.',{exact:false})).toBeVisible();
  delayed=true;await calculate.click();await started;
  await dialog.getByLabel('Количество',{exact:true}).fill('600');
  release();await expect(calculate).toBeEnabled();
  await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toHaveCount(0);
});

test('procurement quantities require recalculation before creating a delivery',async({page})=>{
  await fixture(page);
  await page.route('**/api/scenario',route=>route.fulfill({json:{revision:1,demand:{basis:'Ручной спрос',trainingOrders:0,trainingDays:0},forecasts:[],purchases:[{productId:'t',name:'Томаты',unit:'g',quantity:100,demandBeforeArrival:0,usableAtArrival:0,demandAfterArrival:100,arrival:now,likelyExcess:0}],limitations:''}}));
  await page.goto('/procurement');
  await page.getByRole('button',{name:'Рассчитать сценарий',exact:true}).click();
  const draft=page.getByRole('button',{name:'Создать черновик поставки'});
  await expect(draft).toBeEnabled();
  await page.getByLabel('Закупить Томаты').fill('200');
  await expect(draft).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Количества изменены');
  await page.getByRole('button',{name:'Проверить изменённые количества'}).click();
  await expect(draft).toBeEnabled();
});

test('analytics keeps the applied period after an SSE update and includes the end of day',async({page})=>{
  const refresh=await fixture(page);
  const urls:string[]=[];
  await page.route('**/api/analytics?**',route=>{
    urls.push(route.request().url());
    return route.fulfill({json:{...analytics,ordersAccepted:42}});
  });
  await page.goto('/analytics');
  await page.getByLabel('С даты',{exact:true}).fill('2026-10-02');
  await page.getByLabel('По дату',{exact:true}).fill('2026-10-03');
  await page.getByRole('button',{name:'Применить период'}).click();
  const metric=page.locator('.metric').filter({hasText:'Принято заказов'}).locator('strong');
  await expect(metric).toHaveText('42');
  await refresh();await expect.poll(()=>urls.length).toBe(2);
  await expect(metric).toHaveText('42');
  for(const url of urls){const params=new URL(url).searchParams;expect(params.get('fromDate')).toBe('2026-10-02');expect(params.get('toDate')).toBe('2026-10-03');}
});

test('analytics renders the whole long period, month boundaries and historical shortage count',async({page})=>{
  const refresh=await fixture(page);
  const daily=Array.from({length:121},(_,i)=>({day:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),accepted:i===120?1:0,rejected:0}));
  await page.route('**/api/analytics?**',route=>{
    const params=new URL(route.request().url()).searchParams;
    const empty=params.get('fromDate')==='2026-05-02';
    return route.fulfill({json:{...analytics,from:empty?'2026-05-01T21:00:00Z':'2025-12-31T21:00:00Z',to:empty?'2026-05-02T20:59:59Z':'2026-05-01T20:59:59Z',ordersAccepted:empty?0:1,products:empty?[]:[{id:'t',name:'Томаты',unit:'g',consumed:0,wasted:0,shortageCount:1,shortageQuantity:500,affectedDishes:['a']}],daily:empty?[{day:'2026-05-02',accepted:0,rejected:0}]:daily}});
  });
  await page.goto('/analytics');
  await page.getByLabel('С даты',{exact:true}).fill('2026-01-01');
  await page.getByLabel('По дату',{exact:true}).fill('2026-05-01');
  await page.getByRole('button',{name:'Применить период'}).click();
  await expect(page.locator('.chart-column')).toHaveCount(121);
  await expect(page.locator('.chart-column').last()).toContainText('01.05');
  await expect(page.locator('.chart-column').last().locator('b')).toHaveText('1');
  const deficit=page.locator('.metric').filter({hasText:'Продуктов в дефиците'}).locator('strong');
  await expect(deficit).toHaveText('1'); // Current snapshot has no shortages.
  await refresh();await expect(deficit).toHaveText('1');
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:960});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('.chart').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    await page.screenshot({path:`../test-results/analytics-fixed-${width}.png`,fullPage:true});
  }
  await page.getByLabel('С даты',{exact:true}).fill('2026-05-02');
  await page.getByLabel('По дату',{exact:true}).fill('2026-05-02');
  await page.getByRole('button',{name:'Применить период'}).click();
  await expect(page.locator('.chart-column')).toHaveCount(1);
  await expect(page.locator('.chart-readout .green-text')).toHaveText('0 принято');
  await expect(deficit).toHaveText('0');
  await expect(page.getByText('За выбранный период дефицита не было')).toBeVisible();
});
