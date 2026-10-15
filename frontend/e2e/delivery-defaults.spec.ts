import {test,expect} from '@playwright/test';
import path from 'node:path';
import {chooseOption} from './helpers';

const now='2026-10-14T10:00:00Z';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{(window as any).EventSource=class extends EventTarget {close(){}};});
  await page.route('**/*',route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
  });
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    const products=[{id:'tomato',name:'Томаты',unit:'g',warningHours:48,physical:2500,usable:2500,expired:0,expiring:0,lastUnitCost:0.25,lastCurrency:'RUB'},
      {id:'milk',name:'Молоко',unit:'ml',warningHours:48,physical:1000,usable:1000,expired:0,expiring:0,lastUnitCost:0.1,lastCurrency:'USD'},
      {id:'egg',name:'Яйца',unit:'pcs',warningHours:48,physical:3,usable:3,expired:0,expiring:0,lastUnitCost:null,lastCurrency:null}];
    return route.fulfill({json:['/api/delivery-requests','/api/order-requests','/api/procurement-requests'].includes(pathname)?{items:[],total:0,page:1,size:50}:['/api/accounts','/api/offers/overrides'].includes(pathname)?[]:pathname==='/api/session'?{id:'mock-manager',role:'manager',name:'Управляющий',demo:false}:pathname.startsWith('/api/history/')?{items:[],total:0}:pathname==='/api/deliveries'?{id:'saved'}:pathname==='/api/scenario'?{revision:1,demand:{hasHistory:true,trainingOrders:10,trainingDays:3},forecasts:[],purchases:[{productId:'tomato',name:'Томаты',unit:'g',quantity:1700,arrival:now,shelfLifeHours:48,likelyExcess:null}]}:
      {now,revision:1,settings:{timezone:'Europe/Moscow',warningHours:48,planningHours:24,leadTimeHours:0},products,dishes:[{id:'salad',name:'Салат',ingredients:[],portions:1}],batches:[],expiringBatches:[],deliveries:[],orders:[],movements:[],recommendations:[],procurement:[{productId:'tomato',unit:'g',quantity:1500}],totals:{batches:0,orders:0,deliveries:0,movements:0}}});
  });
  await page.goto('/deliveries');
});

test('delivery defaults use restaurant time, last price and recommended quantity with unit conversion',async({page})=>{
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel(/^Время поступления/)).toHaveValue('2026-10-14T13:00');
  await expect(dialog.getByLabel(/^Закупочная цена/)).toHaveValue('0.25');
  await dialog.getByRole('button',{name:/Использовать рекомендацию/}).click();
  await expect(dialog.getByLabel('Количество',{exact:true})).toHaveValue('1700');
  await chooseOption(dialog,'Единица','kg');
  await expect(dialog.getByLabel('Количество',{exact:true})).toHaveValue('1.7');
  await expect(dialog.getByLabel(/^Закупочная цена/)).toHaveValue('250');
  await dialog.getByLabel(/^Закупочная цена/).fill('300');
  await chooseOption(dialog,'Единица','g');
  await expect(dialog.getByLabel(/^Закупочная цена/)).toHaveValue('0.3');
  const request=page.waitForRequest(r=>r.url().endsWith('/api/deliveries')&&r.method()==='POST');
  await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
  const body=(await request).postDataJSON();
  expect(body.items[0]).toMatchObject({quantity:1700,unit:'g',unitCost:0.3,currency:'RUB'});
  expect(body.receivedAt).toBeUndefined(); // Automatic mode uses server time at acceptance.
});

test('changing product loads its price and compatible units without carrying another quantity',async({page})=>{
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Количество',{exact:true}).fill('1500');
  await chooseOption(dialog,'Продукт','milk');
  await expect(dialog.getByLabel('Количество',{exact:true})).toHaveValue('');
  await expect(dialog.getByLabel(/^Закупочная цена/)).toHaveValue('0.1');
  await chooseOption(dialog,'Единица','l');
  await expect(dialog.getByLabel(/^Закупочная цена/)).toHaveValue('100');
  await chooseOption(dialog,'Продукт','egg');
  await expect(dialog.getByLabel(/^Закупочная цена/)).toHaveValue('');
  await expect(dialog.getByRole('combobox',{name:'Единица',exact:true})).toHaveValue('шт');
});

test('fractional recommendations keep their precision when received in kilograms',async({page})=>{
  await page.route('**/api/scenario',route=>route.fulfill({json:{revision:1,purchases:[{productId:'tomato',unit:'g',quantity:1700.5}]}}));
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await chooseOption(dialog,'Единица','kg');
  await dialog.getByRole('button',{name:'Использовать рекомендацию: 1,7005 кг',exact:true}).click();
  await expect(dialog.getByLabel('Количество',{exact:true})).toHaveValue('1.7005');
  const request=page.waitForRequest(r=>r.url().endsWith('/api/deliveries')&&r.method()==='POST');
  await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
  expect((await request).postDataJSON().items[0]).toMatchObject({quantity:1.7005,unit:'kg',unitCost:250});
});

test('product display converts quantities without showing internal English identifiers',async({page})=>{
  await page.goto('/stock');
  await page.getByRole('button',{name:'Продукты 3',exact:true}).click();
  const row=page.locator('tbody tr').first();
  await expect(row.locator('td').first()).toHaveText('Томаты');
  await row.getByRole('combobox',{name:'Единица для Томаты'}).click();
  await row.getByRole('option').and(row.locator('[data-value="kg"]')).click();
  await expect(row.locator('.stock-quantity').first()).toHaveText('2,5 кг');
  await page.getByRole('heading',{name:'Склад и партии',exact:true}).click();
  await expect(page.locator('.select-options')).toHaveCount(0);
  await page.screenshot({path:'../test-results/products-units.png',fullPage:true});
});

test('manually changed receipt is sent in restaurant time',async({page})=>{
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel(/^Время поступления/).fill('2026-10-14T12:30');
  await dialog.getByLabel('Количество',{exact:true}).fill('100');
  const request=page.waitForRequest(r=>r.url().endsWith('/api/deliveries')&&r.method()==='POST');
  await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
  expect((await request).postDataJSON().receivedAt).toBe('2026-10-14T09:30:00.000Z');
});

test('procurement draft keeps edited quantity and loads last delivery price',async({page})=>{
  await page.goto('/procurement');
  await page.getByLabel('Закупить Томаты',{exact:true}).fill('2000');
  await page.getByRole('button',{name:'Проверить изменённые количества'}).click();
  await page.getByRole('button',{name:'Создать черновик поставки'}).click();
  await expect(page.getByRole('heading',{name:'Заявки поставщикам',exact:true})).toBeVisible();
  await expect(page.locator('.workflow-line').getByLabel('Количество',{exact:true})).toHaveValue('2000');
});
