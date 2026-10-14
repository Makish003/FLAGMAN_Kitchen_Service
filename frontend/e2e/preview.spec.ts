import {test,expect} from '@playwright/test';
import path from 'node:path';
import {chooseOption} from './helpers';

test.use({baseURL:'http://localhost:5080',timezoneId:'Europe/Moscow'});
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
  });
  await page.route('**/api/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
    const now='2026-10-11T05:00:00Z';
    let body:any={now,revision:1,settings:{timezone:'Europe/Moscow',warningHours:48},products:[{id:'t',name:'Томаты',unit:'g',usable:1000,physical:1000}],dishes:[{id:'a',name:'Блюдо А',portions:2,ingredients:[{productId:'t',quantity:500}]}],batches:[],deliveries:[],orders:[],movements:[],totals:{batches:0,deliveries:0,orders:0,movements:0}};
    if(pathname==='/api/session')body={name:'Управляющий',demo:true};
    if(pathname.startsWith('/api/history/'))body={items:[],total:0};
    if(pathname==='/api/deliveries/preview') {
      const input=route.request().postDataJSON();
      if(input.receivedAt?.startsWith('2026-12'))return route.fulfill({status:400,json:{error:'Дата поступления для расчёта должна быть не дальше 30 дней от текущего времени учёта'}});
      const expiry=new Date(input.items[0].expiryDate+'T21:00:00Z');
      body={arrival:input.receivedAt??now,evaluatedAt:now,batches:[{productName:'Томаты',quantity:500,unit:'g',expiresAt:expiry.toISOString(),usable:true}],changes:[{id:'a',name:'Блюдо А',before:2,beforeAtArrival:2,after:3}]};
    }
    await route.fulfill({json:body});
  });
  await page.goto('/deliveries');
});

test('editing receipt and expiry clears old errors and results; recalculation shows the new expiry',async({page})=>{
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Количество',{exact:true}).fill('500');
  await chooseOption(dialog,'Как указан срок годности','date');
  await dialog.getByLabel('Срок годности без времени').fill('2026-10-31');
  await dialog.getByLabel(/^Время поступления/).fill('2026-12-01T08:00');
  const calculate=dialog.getByRole('button',{name:'Рассчитать результат поставки'});
  await calculate.click();await expect(dialog.getByRole('alert')).toContainText('30 дней');
  await dialog.getByLabel(/^Время поступления/).fill('2026-10-11T00:00');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await calculate.click();await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toContainText('1 нояб.');
  await dialog.getByLabel('Срок годности без времени').fill('2026-11-02');
  await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('Выполните расчёт повторно');
  await calculate.click();await expect(dialog.getByRole('region',{name:'Результат расчёта'})).toContainText('3 нояб.');
});

test('clock and stock refresh preserve delivery calculation; stale results can be recalculated',async({page})=>{
  await page.clock.install();
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Количество',{exact:true}).fill('500');
  await chooseOption(dialog,'Как указан срок годности','date');
  await dialog.getByLabel('Срок годности без времени').fill('2026-10-31');
  const calculate=dialog.getByRole('button',{name:'Рассчитать результат поставки'});
  await calculate.click();
  const result=dialog.getByRole('region',{name:'Результат расчёта'});
  await expect(result).toBeVisible();
  let revision=1;
  await page.route('**/api/snapshot',async route=>{
    const snapshot={now:'2026-10-11T05:01:00Z',revision,settings:{timezone:'Europe/Moscow',warningHours:48},products:[{id:'t',name:'Томаты',unit:'g',usable:1000,physical:1000}],dishes:[{id:'a',name:'Блюдо А',portions:2,ingredients:[{productId:'t',quantity:500}]}],batches:[],deliveries:[],orders:[],movements:[],totals:{batches:0,deliveries:0,orders:0,movements:0}};
    await route.fulfill({json:snapshot});
  });
  await page.clock.fastForward(30000);
  await expect(dialog.getByLabel(/^Время поступления/)).toHaveValue('2026-10-11T08:01');
  await expect(result).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  revision=2;
  await page.clock.fastForward(30000);
  await expect(dialog.getByRole('status')).toContainText('Склад изменился');
  await expect(result).toBeVisible();
  await expect(result).toContainText('после 3 порций');
  const spacing=await dialog.evaluate(node=>{
    const result=node.querySelector('.preview-result')!.getBoundingClientRect();
    const notice=node.querySelector('.notice.danger')!.getBoundingClientRect();
    return notice.top-result.bottom;
  });
  expect(spacing).toBeGreaterThanOrEqual(16);
  await calculate.click();
  await expect(result).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await dialog.getByLabel('Количество',{exact:true}).fill('600');
  await expect(result).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('Форма изменена');
});

test('expiry sort closes after selection, outside clicks and keyboard dismissal',async({page})=>{
  await page.goto('/stock');
  const combo=page.getByRole('combobox',{name:'Порядок сроков',exact:true});
  const list=page.locator('.select-options');
  for(const name of ['Поздние сначала','Ближайшие сначала','Ближайшие сначала']) {
    await combo.click();
    await page.getByRole('option',{name,exact:true}).click();
    await expect(combo).toHaveValue(name);
    await expect(combo).toHaveAttribute('aria-expanded','false');
    await expect(list).toHaveCount(0);
    await expect(combo).toBeFocused();
  }
  for(const target of [page.locator('.stock-sort'),page.getByRole('heading',{name:'Склад и партии',exact:true})]) {
    await combo.click();
    await target.click({position:{x:5,y:5}});
    await expect(combo).toHaveAttribute('aria-expanded','false');
    await expect(list).toHaveCount(0);
  }
  await combo.focus();
  await page.keyboard.press('Enter');await page.keyboard.press('End');await page.keyboard.press('Enter');
  await expect(combo).toHaveValue('Поздние сначала');
  await expect(list).toHaveCount(0);
  for(const key of ['Escape','Tab']) {
    await combo.click();await page.keyboard.press(key);
    await expect(combo).toHaveAttribute('aria-expanded','false');
    await expect(list).toHaveCount(0);
  }
});

test.describe('expiry sort on touch screens',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('selection and tapping outside close the list',async({page})=>{
    await page.goto('/stock');
    const combo=page.getByRole('combobox',{name:'Порядок сроков',exact:true});
    await combo.tap();await page.getByRole('option',{name:'Поздние сначала',exact:true}).tap();
    await expect(combo).toHaveValue('Поздние сначала');
    await expect(combo).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.select-options')).toHaveCount(0);
    await combo.tap();await page.getByRole('heading',{name:'Склад и партии',exact:true}).tap();
    await expect(combo).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.select-options')).toHaveCount(0);
  });
});

test('order calculation controls and history search have spacing at desktop and mobile widths',async({page})=>{
  for(const width of [390,750,1440]) {
    await page.setViewportSize({width,height:960});
    await page.getByRole('button',{name:'Новый заказ',exact:true}).first().click();
    const dialog=page.getByRole('dialog');await expect(dialog).toHaveAttribute('data-phase','open');
    const spacing=await dialog.evaluate(node=>{
      const summary=node.querySelector('.order-summary')!.getBoundingClientRect();
      const button=node.querySelector('.preview-controls button')!.getBoundingClientRect();
      const hint=node.querySelector('.preview-controls .form-hint')!.getBoundingClientRect();
      return {before:button.top-summary.bottom,after:hint.top-button.bottom,overflow:node.scrollWidth>node.clientWidth};
    });
    expect(spacing.before).toBeGreaterThanOrEqual(16);expect(spacing.after).toBeGreaterThanOrEqual(12);expect(spacing.overflow).toBe(false);
    await page.screenshot({path:`../test-results/preview/order-${width}.png`});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
  await page.getByRole('navigation').getByRole('button',{name:'Склад и партии'}).click();
  await page.getByRole('button',{name:'Журнал движений',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Поиск по всей истории'})).toHaveCount(1);
  await expect(page.getByRole('textbox',{name:'Продукт, партия или ID поставки…'})).toHaveCount(0);
  const padding=await page.locator('.history-toolbar').evaluate(node=>node.getBoundingClientRect().top+parseFloat(getComputedStyle(node).paddingTop)-node.closest('.panel')!.getBoundingClientRect().top);
  expect(padding).toBeGreaterThanOrEqual(16);
  await page.screenshot({path:'../test-results/preview/movements.png'});
});
