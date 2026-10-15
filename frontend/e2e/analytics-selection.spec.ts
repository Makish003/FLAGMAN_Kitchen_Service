import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';

const daily=Array.from({length:4},(_,i)=>({day:`2026-10-0${i+1}`,accepted:i+1,rejected:i+1}));
function report(selected=daily){
  const total=selected.reduce((sum,d)=>sum+d.rejected,0);
  return {from:'2026-09-30T21:00:00Z',to:'2026-10-04T20:59:59Z',timezone:'Europe/Moscow',daily,ordersAccepted:total,ordersRejected:total,lossBatches:selected.length,
    products:total?[{id:'p',name:'Томаты',unit:'g',consumed:total,wasted:total,shortageCount:total,shortageQuantity:total,affectedDishes:['d']}]:[],
    dishes:total?[{id:'d',name:'Капрезе',rejectedOrders:total,rejectedPortions:total*2,reasons:['Томаты']}]:[],
    wasteProducts:total?[{id:'p',name:'Томаты',unit:'g',currency:'RUB',cost:total*100}]:[],
    costs:[{currency:'RUB',consumed:total*50,wasted:total*100}],priceCoverage:[{kind:'expiry',priced:selected.length,total:selected.length}]};
}
async function fixture(page:Page,screen='analytics'){
  await page.route('**/*',route=>{const pathname=new URL(route.request().url()).pathname;return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
    if(['/api/delivery-requests','/api/order-requests','/api/procurement-requests'].includes(url.pathname))return route.fulfill({json:{items:[],total:0,page:1,size:50}});
    if(['/api/accounts','/api/offers/overrides'].includes(url.pathname))return route.fulfill({json:[]});
    if(url.pathname==='/api/session')return route.fulfill({json:{id:'mock-manager',role:'manager',name:'Управляющий',demo:false}});
    if(url.pathname==='/api/analytics'){
      const selected=url.searchParams.get('days');
      return route.fulfill({json:report(selected===null?daily:daily.filter(d=>selected.split(',').includes(d.day)))});
    }
    return route.fulfill({json:{now:'2026-10-04T20:59:59Z',revision:1,settings:{timezone:'Europe/Moscow',warningHours:48},products:[],dishes:[{id:'d',name:'Капрезе',ingredients:[],shortages:[],portions:0}],batches:[],orders:[],deliveries:[],movements:[],recommendations:[],analytics:report(),totals:{batches:0,activeBatches:0,warningBatches:0,orders:20,movements:0,deliveries:0}}});
  });
  await page.goto('/'+screen);
}
test('chart range can exclude a middle day and filters every report',async({page})=>{
  await fixture(page);
  const points=page.locator('.orders-day');
  await expect(page.locator('.dish-ranking')).toContainText('10 отказов');
  await points.nth(0).locator('.orders-point.accepted').click();
  await expect(points.nth(0)).toBeFocused();
  await expect(points.nth(0)).toHaveCSS('outline-style','none');
  await expect(points.nth(0).locator('.orders-point.accepted')).toHaveCSS('r','7px');
  await expect(points.nth(1).locator('.orders-point.accepted')).toHaveCSS('r','4.5px');
  await expect(page.locator('.dish-ranking')).toContainText('1 отказ');
  await page.locator('.chart-column').nth(3).click({modifiers:['Shift']});
  await expect(page.locator('.dish-ranking')).toContainText('10 отказов');
  await page.locator('.chart-column').nth(2).click();
  await expect(points.nth(0)).toHaveAttribute('aria-pressed','true');
  await expect(points.nth(1)).toHaveAttribute('aria-pressed','true');
  await expect(points.nth(2)).toHaveAttribute('aria-pressed','false');
  await expect(points.nth(3)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.dish-ranking')).toContainText('7 отказов');
  await expect(page.locator('.waste-ranking')).toContainText(/700\s*RUB/);
  await expect(page.locator('.analytics-products tbody')).toContainText('7 отказов');
  await expect(page.locator('.report-metrics .metric').first().locator('strong')).toHaveText('7');
  await expect(page.locator('.chart-readout .green-text')).toHaveText('7 принято');
  await page.getByRole('button',{name:'Снять выделение',exact:true}).click();
  await expect(page.locator('.dish-ranking')).toContainText('За выбранные дни отклонённых заказов с блюдами нет');
  await expect(page.locator('.waste-ranking')).toContainText('За выбранные дни нет списаний с известной стоимостью');
  await expect(page.locator('.chart-column')).toHaveCount(4);
  await page.getByRole('button',{name:'Все дни',exact:true}).click();
  await expect(page.locator('.dish-ranking')).toContainText('10 отказов');
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:'../test-results/reports/analytics-rankings-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:960});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'../test-results/reports/analytics-rankings-mobile.png',fullPage:true});
});
test('keyboard selects arbitrary days and applying a period resets selection',async({page})=>{
  await fixture(page);
  const points=page.locator('.orders-day');
  await points.nth(0).focus();await page.keyboard.press('Enter');
  await points.nth(3).focus();await page.keyboard.press('Space');
  await expect(page.locator('.dish-ranking')).toContainText('5 отказов');
  await points.nth(0).focus();await page.keyboard.press('Space');
  await expect(page.locator('.dish-ranking')).toContainText('4 отказа');
  await expect(page.locator('.chart-readout')).toContainText('04.10.2026');
  await page.getByRole('button',{name:'Применить период',exact:true}).click();
  await expect(page.locator('.dish-ranking')).toContainText('10 отказов');
  await expect(points.nth(0)).toHaveAttribute('aria-pressed','true');
});

test('both charts keep round markers and align selected dates after resizing',async({page})=>{
  for(const screen of ['overview','analytics']){
    await fixture(page,screen);
    await page.locator('.chart-column').first().click();
    for(const width of [280,390,768,1440]){
      await page.setViewportSize({width,height:960});
      await expect.poll(()=>page.locator('.orders-point').evaluateAll(points=>Math.max(...points.map(point=>{
        const box=point.getBoundingClientRect();return Math.abs(box.width-box.height);
      })))).toBeLessThan(0.15);
      const chart=page.locator('.chart-panel');
      await expect(chart.locator('.orders-selected-band')).toHaveCount(0);
      await expect(chart.locator('.orders-selection')).toHaveCount(1);
      await expect(chart.locator('.orders-day.selected')).toHaveCount(1);
      await expect(chart.locator('.chart-column').first()).toHaveAttribute('aria-pressed','true');
      const alignment=await chart.evaluate(panel=>{
        const circle=panel.querySelector('.orders-point')!.getBoundingClientRect();
        const date=panel.querySelector('.chart-column')!.getBoundingClientRect();
        return Math.abs((circle.left+circle.right)/2-(date.left+date.right)/2);
      });
      expect(alignment).toBeLessThan(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
});

test.describe('touch selection on both charts',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:960}});
  for(const screen of ['overview','analytics'])test(screen+': select a range and remove a middle day without Shift',async({page})=>{
    await fixture(page,screen);
    const dates=page.locator('.chart-column');
    await page.getByRole('button',{name:'Выбрать диапазон',exact:true}).tap();
    await expect(page.locator('.chart-panel')).toContainText('Выберите первый день диапазона');
    await dates.first().tap();
    await expect(page.locator('.chart-panel')).toContainText('Теперь выберите последний день диапазона');
    await dates.last().tap();
    await expect(page.getByRole('button',{name:'Выбрать диапазон',exact:true})).toHaveAttribute('aria-pressed','false');
    await dates.nth(2).tap();
    for(const i of [0,1,3])await expect(dates.nth(i)).toHaveAttribute('aria-pressed','true');
    await expect(dates.nth(2)).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('.orders-day.selected')).toHaveCount(3);
    await expect(page.locator('.orders-selection')).toHaveCount(3);
    await expect(page.locator('.chart-readout .green-text')).toHaveText('7 принято');
    if(screen==='analytics')await expect(page.locator('.dish-ranking')).toContainText('7 отказов');
    await page.locator('.orders-day').nth(3).locator('.orders-point.rejected').tap();
    await expect(dates.last()).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('.chart-readout .green-text')).toHaveText('3 принято');
    await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
    await page.screenshot({path:'../test-results/reports/'+screen+'-touch-selection.png',fullPage:true});
  });
});
