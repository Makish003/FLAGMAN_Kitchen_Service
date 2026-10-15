import {test,expect} from '@playwright/test';
import path from 'node:path';

for(const role of ['waiter','cook','manager'])test('newest cards flow left to right with independent column spacing: '+role,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1920,height:1080});
 await page.addInitScript(()=>{(window as any).EventSource=class extends EventTarget{close(){}};});
 let orders=Array.from({length:7},(_,i)=>({id:'order00'+i,createdAt:new Date(Date.UTC(2026,9,15,12-i)).toISOString(),status:i%2?'rejected':'served',version:1,items:Array.from({length:i===2?6:1},(_,j)=>({dishId:'dish'+j,dishName:'Блюдо '+j,portions:1})),reason:i%2?'Причина отказа':undefined}));
 await page.route('**/*',route=>{const pathname=new URL(route.request().url()).pathname;return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});});
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());let json:unknown=[];
  if(url.pathname==='/api/session')json={id:'mock-'+role,role,name:'Тест',demo:false,timezone:'Europe/Moscow'};
  else if(url.pathname==='/api/snapshot')json={now:'2026-10-15T12:00:00Z',revision:1,settings:{timezone:'Europe/Moscow',warningHours:48},products:[],dishes:[],batches:[],expiringBatches:[],deliveries:[],orders:[],movements:[],recommendations:[],totals:{}};
  else if(url.pathname.endsWith('order-requests')){const status=url.searchParams.get('status');const items=orders.filter(o=>!status||status==='all'||o.status===status);json={items:[...items].reverse(),total:items.length,page:1,size:50};}
  else if(url.pathname.endsWith('-requests')||url.pathname.includes('/history/'))json={items:[],total:0};
  return route.fulfill({json});
 });
 const visit=()=>page.goto('/'+(role==='manager'?'orders':role));
 const grid=page.locator('.order-request-grid');
 const column=(i:number)=>grid.locator('.order-request-column').nth(i);
 await visit();await expect(grid.locator('.order-request-card')).toHaveCount(7);
 await expect(grid.locator('.order-request-column')).toHaveCount(3);
 for(let i=0;i<3;i++)await expect(column(i).locator('.order-request-card').first()).toContainText('#order00'+i);
 await expect(column(0).locator('.order-request-card').nth(1)).toContainText('#order003');
 const gaps=await grid.evaluate(el=>[...el.querySelectorAll('.order-request-column')].flatMap(column=>{const cards=[...column.children].map(c=>c.getBoundingClientRect());return cards.slice(1).map((c,i)=>c.top-cards[i].bottom);}));
 for(const gap of gaps)expect(gap).toBeCloseTo(16,0);
 // A new order occupies the leftmost slot and pushes previous orders to the right.
 orders=[{...orders[0],id:'neworder',createdAt:'2026-10-15T13:00:00Z'},...orders];
 await page.reload();await expect(grid.locator('.order-request-card')).toHaveCount(8);
 await expect(column(0).locator('.order-request-card').first()).toContainText('#neworder');
 await expect(column(1).locator('.order-request-card').first()).toContainText('#order000');
 await expect(column(2).locator('.order-request-card').first()).toContainText('#order001');
 for(const width of [900,390,280]){
  await page.setViewportSize({width,height:960});
  await expect(grid.locator('.order-request-column')).toHaveCount(width===900?2:1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 expect(errors).toEqual([]);
});
