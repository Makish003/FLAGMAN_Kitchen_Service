import {test,expect} from '@playwright/test';
import path from 'node:path';

const now='2026-10-14T10:00:00Z';
const product={id:'tomato',name:'Томаты',unit:'g',warningHours:48,physical:2095.528,usable:2095.528,expiring:0,expired:0};
const batch={id:'batch001',productId:product.id,deliveryId:'delivery001',remainingQuantity:2095.528,initialQuantity:2095.528,receivedAt:now,expiresAt:'2026-10-16T10:00:00Z',expiryBasis:'received',shelfLifeHours:48};
const delivery={id:'delivery001',number:'П-001',createdAt:now,receivedAt:now,batchIds:[batch.id]};
const orders=[
  {id:'accepted001',createdAt:now,status:'accepted',items:[{dishId:'salad',portions:1}],shortages:[]},
  {id:'rejected001',createdAt:now,status:'rejected',items:[{dishId:'salad',portions:2}],shortages:[{productId:product.id,productName:product.name,missing:10.528,unit:'g'}]},
  {id:'rejected002',createdAt:now,status:'rejected',items:[],shortages:[]},
];
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{(window as any).EventSource=class extends EventTarget {close(){}};});
  await page.route('**/*',route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
  });
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    const rows=pathname.endsWith('/orders')?orders:pathname.endsWith('/deliveries')?[delivery]:[batch];
    return route.fulfill({json:pathname==='/api/session'?{name:'Управляющий',demo:true}:pathname.startsWith('/api/history/')?{items:rows,total:rows.length}:{now,revision:1,settings:{timezone:'Europe/Moscow',warningHours:48},products:[product],dishes:[{id:'salad',name:'Салат',ingredients:[],shortages:[],portions:1}],batches:[batch],expiringBatches:[],deliveries:[delivery],orders,movements:[],recommendations:[],totals:{batches:1,orders:3,deliveries:1,movements:0}}});
  });
});

test('weights show hundredths and whole quantities without trailing zeroes',async({page})=>{
  await page.goto('/stock');
  await page.getByRole('button',{name:'Продукты 1',exact:true}).click();
  const cells=page.locator('tbody tr').first().locator('td');
  await expect(cells.nth(1)).toHaveText('2 095,53 г',{useInnerText:true});
  await expect(cells.nth(3)).toHaveText('0 г');
  await page.screenshot({path:'../test-results/operational-products.png',fullPage:true});
});

test('refusal reasons distinguish accepted and rejected orders',async({page})=>{
  await page.goto('/orders');
  const rows=page.locator('tbody tr');
  await expect(rows.nth(0).locator('td').nth(4)).toHaveText('—');
  await expect(rows.nth(1).locator('td').nth(4)).toHaveText('Томаты: не хватает 10,53 г');
  await expect(rows.nth(2).locator('td').nth(4)).toHaveText('Причина отказа не указана');
  await expect(page.getByText('Все ингредиенты списаны')).toHaveCount(0);
});

test('operational rows emphasize data and remain contained on mobile',async({page})=>{
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:960});
    for(const route of ['stock','orders','deliveries']){
      await page.goto('/'+route);
      const row=page.locator('tbody tr').first();
      await expect(row).toBeVisible();
      const targets=route==='stock'?[row.locator('td').nth(4).locator('strong'),row.locator('.badge')]:[row.locator('td').nth(2)];
      for(const target of targets)expect(await target.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      if(width===1440)await page.screenshot({path:`../test-results/operational-${route}.png`,fullPage:true});
    }
  }
});
