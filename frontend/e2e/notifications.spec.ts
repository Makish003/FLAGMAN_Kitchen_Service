import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import type {Snapshot} from '../src/types';

function state():Snapshot {
  return {now:'2026-10-13T07:00:00Z',revision:1,settings:{timezone:'Europe/Moscow',warningHours:48,demandWindowDays:7,planningHours:24,leadTimeHours:2,safetyFactor:1,forecastHours:48},products:[{id:'p',name:'Томаты',unit:'g',warningHours:48,usable:100,physical:100,expired:0,expiring:0}],dishes:[{id:'d',name:'Салат',category:'Салаты',ingredients:[],portions:1,shortages:[]}],batches:[],expiringBatches:[],deliveries:[],orders:[],movements:[],recommendations:[],salePlan:[],procurement:[],forecasts:[],warning:'',analytics:{from:'2026-10-06T07:00:00Z',to:'2026-10-13T07:00:00Z',timezone:'Europe/Moscow',priceCoverage:[],products:[],ordersAccepted:0,ordersRejected:0,lossBatches:0,daily:[]},totals:{batches:0,activeBatches:0,warningBatches:0,deliveries:1,orders:0,movements:0}};
}
async function fixture(page:Page,data:Snapshot) {
  await page.clock.install();
  await page.route('**/*',route=>{const pathname=new URL(route.request().url()).pathname;return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});});
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
    return route.fulfill({json:['/api/delivery-requests','/api/order-requests','/api/procurement-requests'].includes(pathname)?{items:[],total:0,page:1,size:50}:['/api/accounts','/api/offers/overrides'].includes(pathname)?[]:pathname==='/api/session'?{id:'mock-manager',role:'manager',name:'Управляющий',demo:false}:pathname.startsWith('/api/history/')?{items:[],total:0,page:1,size:20}:data});
  });
  await page.goto('/stock');
  await expect(page.getByRole('heading',{name:'Склад и партии',exact:true})).toBeVisible();
  await expect(page.locator('.skeleton')).toHaveCount(0);
}
const bell=(page:Page)=>page.getByRole('button',{name:'Уведомления',exact:true});

test('bell opens actionable live alerts without pushes for the initial snapshot',async({page})=>{
  const data=state();data.dishes=Array.from({length:5},(_,i)=>({...data.dishes[0],id:String(i),portions:0}));data.totals.warningBatches=501;
  await fixture(page,data);
  await expect(page.locator('.notification-push')).toHaveCount(0);
  await bell(page).click();
  const panel=page.getByRole('dialog',{name:/Уведомления/});
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('5 блюд в стоп-листе!');
  await expect(panel).toContainText('501 партия скоро истечёт!');
  await page.clock.runFor(250);
  for(const width of [1440,320]){
    await page.setViewportSize({width,height:900});
    const box=(await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
    expect(box.y+box.height).toBeLessThanOrEqual(900);
    await page.screenshot({path:`../test-results/notifications-panel-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:960});
  await panel.getByRole('button',{name:/5 блюд в стоп-листе/}).click();
  await expect(page).toHaveURL(/\/stop$/);await expect(panel).toHaveCount(0);
  await bell(page).click();await panel.getByRole('button',{name:/501 партия/}).click();
  await expect(page).toHaveURL(/\/expiry$/);
});

test('incomplete setup links to the next missing step',async({page})=>{
  for(const step of ['stock','menu','deliveries']){
    const data=state();data.totals.deliveries=0;
    if(step!=='deliveries')data.dishes=[];
    if(step==='stock')data.products=[];
    await fixture(page,data);await bell(page).click();
    await page.getByRole('dialog',{name:/Уведомления/}).getByRole('button',{name:/Вы не закончили настройку склада/}).click();
    await expect(page).toHaveURL(new RegExp('/'+step+'$'));
    await page.clock.runFor(250);
    await expect(page.locator('.notifications-panel')).toHaveCount(0);
    await page.unrouteAll({behavior:'wait'});
  }
});

test('new and increased alerts push, resolve, reappear and expire',async({page})=>{
  const data=state();await fixture(page,data);
  data.dishes[0].portions=0;data.revision++;
  await page.clock.fastForward(30000);
  const push=page.locator('.notification-push');
  await expect(push).toContainText('1 блюдо в стоп-листе!');
  await expect(push.locator('.notification-app')).toHaveText('Стоп-лист Сейчас');
  await push.getByRole('button',{name:/Стоп-лист Сейчас/}).click();
  await expect(page).toHaveURL(/\/stop$/);await expect(push).toHaveCount(0);
  data.dishes.push({...data.dishes[0],id:'second'});data.revision++;
  await page.clock.fastForward(30000);await expect(push).toContainText('2 блюда в стоп-листе!');
  await page.clock.runFor(8000);await expect(push).toHaveAttribute('data-phase','exiting');
  await page.clock.runFor(300);await expect(push).toHaveCount(0);
  await bell(page).click();await expect(page.locator('.notifications-panel')).toContainText('2 блюда в стоп-листе!');
  data.dishes.forEach(d=>d.portions=1);data.revision++;
  await page.clock.fastForward(30000);await expect(page.locator('.notifications-panel')).toContainText('Новых уведомлений нет.');
  data.totals.warningBatches=2;data.revision++;
  await page.clock.fastForward(30000);await expect(push).toContainText('2 партии скоро истекут!');
  await expect(push.locator('.notification-app')).toHaveText('Сроки годности Сейчас');
  await push.getByRole('button',{name:/Закрыть уведомление/}).click();
  await expect(push).toHaveAttribute('data-phase','exiting');
  await page.clock.runFor(300);await expect(push).toHaveCount(0);
  await page.clock.fastForward(30000);await expect(push).toHaveCount(0);
  data.dishes[0].portions=0;data.revision++;
  await page.clock.fastForward(30000);await expect(push).toContainText('1 блюдо в стоп-листе!');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:320,height:700});
  const box=(await push.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  await page.clock.runFor(300);
  await expect(push).toHaveCSS('opacity','1');
  await page.screenshot({path:'../test-results/notifications-mobile.png'});
});

for(const reducedMotion of ['no-preference','reduce'] as const) {
  test(`idle push dismissal respects ${reducedMotion}`,async({page})=>{
    await page.emulateMedia({reducedMotion});
    const data=state();await fixture(page,data);
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
    data.dishes[0].portions=0;data.revision++;
    await page.clock.fastForward(30000);
    const push=page.locator('.notification-push');
    await expect(push).toContainText('1 блюдо в стоп-листе!');
    await page.clock.runFor(7999);await expect(push).toHaveCount(1);
    await page.clock.runFor(1);
    if(reducedMotion==='no-preference') {
      await expect(push).toHaveAttribute('data-phase','exiting');
      await expect(push).toHaveAttribute('inert','');
      await expect(push).toHaveCSS('animation-name','notification-leave');
      const opacity=await push.evaluate(node=>{
        const animation=node.getAnimations()[0];
        animation.pause();
        animation.currentTime=Number(animation.effect!.getTiming().duration)/2;
        return Number(getComputedStyle(node).opacity);
      });
      expect(opacity).toBeGreaterThan(0);expect(opacity).toBeLessThan(1);
      await page.clock.runFor(300);
    }
    await expect(push).toHaveCount(0);
  });
}

test('panel closes with Escape, outside click and keyboard focus leaving; fits mobile',async({page})=>{
  await fixture(page,state());await page.setViewportSize({width:320,height:700});
  await bell(page).click();await expect(page.locator('.notifications-panel')).toContainText('Новых уведомлений нет.');
  const box=(await page.locator('.notifications-panel').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');await expect(bell(page)).toBeFocused();
  await expect(bell(page)).toHaveAttribute('aria-expanded','false');
  await bell(page).click();await page.mouse.click(8,400);
  await page.clock.runFor(250);
  await expect(page.locator('.notifications-panel')).toHaveCount(0);
  await bell(page).click();
  for(let i=0;i<6;i++)await page.keyboard.press('Tab');
  await page.clock.runFor(250);
  await expect(page.locator('.notifications-panel')).toHaveCount(0);
});

test('panel animates both ways and can reopen during exit',async({page})=>{
  await fixture(page,state());
  const panel=page.locator('.notifications-panel');
  await bell(page).click();
  await expect(panel).toHaveAttribute('data-phase','entering');
  await expect(panel).toHaveCSS('animation-name','motion-small-enter');
  await page.clock.runFor(250);
  await expect(panel).toHaveAttribute('data-phase','open');
  await page.getByRole('button',{name:'Закрыть уведомления',exact:true}).click();
  await expect(panel).toHaveAttribute('data-phase','exiting');
  await expect(panel).toHaveCSS('animation-name','motion-small-exit');
  await expect(panel).toHaveAttribute('inert','');
  await expect(panel).toHaveAttribute('aria-hidden','true');
  await bell(page).click();
  await page.clock.runFor(250);
  await expect(panel).toHaveAttribute('data-phase','open');
  await expect(panel).not.toHaveAttribute('inert','');
  await page.keyboard.press('Escape');
  await page.clock.runFor(250);
  await expect(panel).toHaveCount(0);
});

test('panel respects reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await fixture(page,state());
  await bell(page).click();
  const panel=page.locator('.notifications-panel');
  await expect(panel).toHaveAttribute('data-phase','open');
  await expect(panel).toHaveCSS('animation-name','none');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
