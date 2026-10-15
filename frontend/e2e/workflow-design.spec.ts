import {test,expect} from '@playwright/test';
import path from 'node:path';

const product={id:'tomato',name:'Томаты',unit:'g',physical:2000,usable:2000,expiring:0,expired:0};
const dish={id:'salad',name:'Салат с томатами',category:'Салаты',availablePortions:12,portions:12,ingredients:[],shortages:[]};
const procurement={id:'procurement001',status:'submitted',version:1,items:[{id:'line1',productId:'tomato',quantity:1200,unit:'g'}]};
const delivery={...procurement,id:'delivery001',number:'П-001',items:[{...procurement.items[0],expiresAt:'2026-10-20T10:00:00Z'}]};
const order={id:'order001',status:'submitted',version:1,items:[{dishId:'salad',portions:2}]};

async function mockApp(page: import('@playwright/test').Page,role='manager',populated=false){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{(window as any).EventSource=class extends EventTarget{close(){}};});
  await page.route('**/*',route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
  });
  await page.route('**/api/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    let json:unknown=[];
    if(pathname==='/api/session')json={id:'mock-'+role,role,name:'Анна Смирнова',demo:true,timezone:'Europe/Moscow'};
    else if(pathname==='/api/snapshot')json={now:'2026-10-15T10:00:00Z',revision:1,settings:{timezone:'Europe/Moscow',warningHours:48},products:[product],dishes:[dish],batches:[],expiringBatches:[],deliveries:[],orders:[],movements:[],recommendations:[],totals:{batches:0,orders:0,deliveries:0,movements:0}};
    else if(pathname.endsWith('/accounts'))json=[{id:'supplier1',login:'supplier',name:'Свежие продукты',role:'supplier',active:true}];
    else if(pathname.endsWith('/catalog'))json=[product];
    else if(pathname.endsWith('/menu'))json=[dish];
    else if(pathname.endsWith('-requests')){const items=populated?[pathname.includes('procurement')?procurement:pathname.includes('delivery')?delivery:order]:[];json={items,total:items.length,page:1,size:50};}
    else if(pathname.includes('/history/'))json={items:[],total:0};
    return route.fulfill({json});
  });
}

test('procurement uses inset content, styled controls and a compact responsive form',async({page})=>{
  await mockApp(page);
  await page.goto('/procurement-requests');
  const panel=page.locator('.workflow-list').first();
  await expect(panel.getByRole('heading',{name:'Закупочные заявки'})).toBeVisible();
  const inset=await panel.evaluate(el=>{const r=el.getBoundingClientRect(),h=el.querySelector('h2')!.getBoundingClientRect();return h.left-r.left;});
  expect(inset).toBeGreaterThanOrEqual(20);
  await panel.locator('summary').click();
  await panel.getByRole('button',{name:'Добавить строку',exact:true}).click();
  const add=panel.getByRole('button',{name:'Добавить строку',exact:true});
  expect(await add.evaluate(el=>parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(0);
  const productInput=panel.getByRole('combobox',{name:'Продукт',exact:true});
  await expect(productInput).toHaveValue('Томаты');
  for(const width of [1440,390,280]){
    await page.setViewportSize({width,height:960});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/workflow-procurement-${width}.png`,fullPage:true});
  }
});

test('manager request cards and decision dialogs fit desktop and mobile',async({page})=>{
  await mockApp(page,'manager',true);
  for(const [route,button,title] of [['deliveries','Проверить приёмку','Приёмка П-001']]){
    await page.goto('/'+route);
    await expect(page.locator('.workflow-card').first().getByText('Ожидает решения')).toBeVisible();
    await page.getByRole('button',{name:button,exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByRole('heading',{name:title})).toBeVisible();
    for(const width of [1440,390,280]){
      await page.setViewportSize({width,height:960});
      expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await page.screenshot({path:`../test-results/workflow-${route}-dialog-${width}.png`,fullPage:true});
    }
  }
});

for(const role of ['supplier','waiter','cook'])test(`${role} workspace uses shared controls and fits narrow screens`,async({page})=>{
  await mockApp(page,role,true);
  await page.goto('/'+role);
  await expect(page.getByRole('button',{name:'Выйти',exact:true})).toBeVisible();
  if(role==='supplier'){
    await page.getByRole('button',{name:'Добавить лот',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'Продукт',exact:true})).toHaveValue('Томаты');
  }else if(role==='waiter'){
    await page.getByRole('button',{name:'В корзину',exact:true}).click();
    await expect(page.getByRole('spinbutton',{name:'Салат с томатами',exact:true})).toHaveValue('1');
  }
  for(const width of [1440,390,280]){
    await page.setViewportSize({width,height:960});
    for(const button of await page.locator('main button').all()){
      if(await button.isVisible())expect(await button.evaluate(el=>parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(36);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/workflow-${role}-${width}.png`,fullPage:true});
  }
});

test('supplier response remains readable with all fields on narrow screens',async({page})=>{
  await mockApp(page,'supplier',true);
  await page.goto('/supplier');
  await page.getByRole('button',{name:'Ответить по строкам',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('spinbutton',{name:'Подтверждено',exact:true})).toHaveValue('1200');
  await dialog.getByRole('spinbutton',{name:'Цена за единицу (необязательно)',exact:true}).fill('12.50');
  await expect(dialog.getByRole('combobox',{name:'Валюта',exact:true})).toBeVisible();
  for(const width of [1440,390,280]){
    await page.setViewportSize({width,height:960});
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:`../test-results/workflow-response-${width}.png`,fullPage:true});
  }
});

test('empty procurement and missing supplier use shared empty states and hints',async({page})=>{
  await mockApp(page);
  await page.route('**/api/accounts',route=>route.fulfill({json:[]}));
  await page.goto('/procurement-requests');
  const panel=page.locator('.workflow-list').first();
  await expect(panel.locator('.empty')).toHaveText('Заявок пока нет');
  await page.screenshot({path:'../test-results/workflow-procurement-collapsed.png',fullPage:true});
  await panel.locator('summary').click();
  await expect(panel.locator('.form-hint')).toHaveText('Создайте активный аккаунт поставщика в разделе «Аккаунты».');
  await expect(panel.getByRole('button',{name:'Отправить закупку',exact:true})).toBeDisabled();
});

test('account activity checkbox remains compact and actions are styled',async({page})=>{
  await mockApp(page);
  await page.goto('/accounts');
  const checkbox=page.getByRole('checkbox',{name:'Активен',exact:true});
  await expect(checkbox).toBeVisible();
  expect((await checkbox.boundingBox())!.width).toBeLessThanOrEqual(24);
  await page.getByRole('button',{name:'Изменить аккаунт',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Логин',exact:true})).toHaveValue('supplier');
  for(const width of [1440,390,280]){
    await page.setViewportSize({width,height:960});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/workflow-accounts-${width}.png`,fullPage:true});
  }
});

test('offer publication matches the shared form and checkbox styling',async({page})=>{
  await mockApp(page);
  await page.goto('/menu');
  const panel=page.locator('.workflow-list').filter({has:page.getByRole('heading',{name:'Публикация предложений',exact:true})});
  const checkbox=panel.getByRole('checkbox',{name:'Акцент менеджера',exact:true});
  await expect(checkbox).toBeVisible();
  expect((await checkbox.boundingBox())!.width).toBeLessThanOrEqual(24);
  const dish=panel.getByRole('combobox',{name:'Блюдо',exact:true});
  await dish.focus();
  await dish.press('Enter');
  await dish.press('ArrowDown');
  await dish.press('Enter');
  await expect(dish).toHaveValue('Салат с томатами');
  await expect(panel.getByRole('button',{name:'Сохранить публикацию',exact:true})).toBeEnabled();
  for(const width of [1440,390,280]){
    await page.setViewportSize({width,height:960});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../test-results/workflow-publication-${width}.png`,fullPage:true});
  }
});

test('delivery reason appears only for a reduction and is cleared on full acceptance',async({page})=>{
  await mockApp(page,'manager',true);
  await page.goto('/deliveries');
  await page.getByRole('button',{name:'Проверить приёмку',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const quantity=dialog.getByRole('spinbutton',{name:'Принято',exact:true});
  const reason=dialog.getByRole('textbox',{name:'Причина уменьшения или отказа',exact:true});
  await expect(reason).toHaveCount(0);
  await quantity.fill('1000');
  await expect(reason).toBeVisible();
  await expect(reason).toHaveAttribute('required','');
  await reason.fill('Повреждена упаковка');
  await quantity.fill('1200');
  await expect(reason).toHaveCount(0);
  await quantity.fill('1000');
  await expect(reason).toHaveValue('');
  await reason.fill('Повреждена упаковка');
  await quantity.fill('1200');
  const submitted=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/delivery-requests/delivery001/acceptance'));
  await dialog.getByRole('button',{name:'Подтвердить приёмку',exact:true}).click();
  expect((await submitted).postDataJSON().items[0]).toMatchObject({acceptedQuantity:1200,reason:''});
});

test('full refusal reveals the reason below the quantity without submitting',async({page})=>{
  await mockApp(page,'manager',true);
  await page.goto('/deliveries');
  await page.getByRole('button',{name:'Проверить приёмку',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Отказать полностью',exact:true}).click();
  const quantity=dialog.getByRole('spinbutton',{name:'Принято',exact:true});
  const reason=dialog.getByRole('textbox',{name:'Причина уменьшения или отказа',exact:true});
  await expect(quantity).toHaveValue('0');
  await expect(reason).toBeVisible();
  expect((await reason.boundingBox())!.y).toBeGreaterThan((await quantity.boundingBox())!.y);
  for(const width of [1440,390,280]){
    await page.setViewportSize({width,height:960});
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }
  await dialog.getByRole('button',{name:'Подтвердить приёмку',exact:true}).click();
  await expect(dialog).toBeVisible();
  expect(await reason.evaluate(el=>(el as HTMLInputElement).validity.valueMissing)).toBe(true);
  await reason.fill('Товар испорчен');
  const submitted=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/delivery-requests/delivery001/acceptance'));
  await dialog.getByRole('button',{name:'Подтвердить приёмку',exact:true}).click();
  expect((await submitted).postDataJSON().items[0]).toMatchObject({acceptedQuantity:0,reason:'Товар испорчен'});
});

test('delivery cards show refusal reasons only for reduced quantities',async({page})=>{
  await mockApp(page,'manager',true);
  await page.route('**/api/delivery-requests?**',route=>route.fulfill({json:{page:1,size:50,total:2,items:[
    {...delivery,status:'accepted',acceptance:[{lineId:'line1',acceptedQuantity:1200,reason:'Лишняя причина'}]},
    {...delivery,id:'delivery002',number:'П-002',status:'partially_accepted',acceptance:[{lineId:'line1',acceptedQuantity:1000,reason:'Повреждена упаковка'}]},
  ]}}));
  await page.goto('/deliveries');
  await expect(page.getByText('Лишняя причина',{exact:false})).toHaveCount(0);
  await expect(page.getByText('Повреждена упаковка',{exact:false})).toBeVisible();
});
