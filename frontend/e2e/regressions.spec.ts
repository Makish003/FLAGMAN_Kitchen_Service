import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {chooseOption} from './helpers';

test.use({baseURL:'http://localhost:5080',timezoneId:'Europe/Moscow'});
const now='2026-10-11T05:00:00Z';
const analytics={from:'2026-10-01T00:00:00Z',to:now,ordersAccepted:1,ordersRejected:0,lossBatches:0,products:[],daily:[]};
async function fixture(page:Page){
  let revision=1;
  await page.addInitScript(()=>{
    (window as any).EventSource=class extends EventTarget {
      constructor(){super();(window as any).__stream=this;}
      close(){}
    };
  });
  await page.route('**/*',route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
  });
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    const body=pathname==='/api/session'?{name:'Управляющий',demo:true}:
      pathname.startsWith('/api/history/')?{items:[],total:0}:
      {now,revision,settings:{timezone:'Europe/Moscow',warningHours:48,leadTimeHours:2},products:[{id:'t',name:'Томаты',unit:'g',usable:1000,physical:1000}],dishes:[{id:'a',name:'Блюдо А',portions:2,ingredients:[{productId:'t',quantity:500}],shortages:[]}],batches:[],deliveries:[],orders:[],movements:[],recommendations:[],analytics,totals:{batches:0,deliveries:0,orders:0,movements:0}};
    return route.fulfill({json:body});
  });
  return async()=>{
    revision++;
    const response=page.waitForResponse('**/api/snapshot');
    await page.evaluate(()=>(window as any).__stream.dispatchEvent(new Event('change')));
    await response;
  };
}

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
  await refresh();await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toHaveCount(0);
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
  await page.getByLabel('С даты (UTC)',{exact:true}).fill('2026-10-02');
  await page.getByLabel('По дату (UTC)',{exact:true}).fill('2026-10-03');
  await page.getByRole('button',{name:'Применить период'}).click();
  const metric=page.locator('.metric').filter({hasText:'Принято заказов'}).locator('strong');
  await expect(metric).toHaveText('42');
  await refresh();await expect.poll(()=>urls.length).toBe(2);
  await expect(metric).toHaveText('42');
  for(const url of urls){const params=new URL(url).searchParams;expect(params.get('from')).toBe('2026-10-02T00:00:00Z');expect(params.get('to')).toBe('2026-10-03T23:59:59.9999999Z');}
});
