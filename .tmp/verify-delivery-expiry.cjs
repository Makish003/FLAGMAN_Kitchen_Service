const {chromium,expect}=require('../frontend/node_modules/@playwright/test');
const path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:path.resolve('.tools/browsers/chromium-1248/chrome-win64/chrome.exe')});
 try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 await page.addInitScript(()=>{window.EventSource=class extends EventTarget{close(){}}});
 const now='2026-10-16T08:21:28Z';
 const product={id:'chicken',name:'Куриное филе',unit:'g',usable:350,physical:700,warningHours:48};
 const batch={id:'7baed6e3-test',productId:product.id,deliveryId:'posted',initialQuantity:350,remainingQuantity:350,receivedAt:'2026-10-15T08:00:00Z',expiresAt:'2026-10-16T10:55:00Z',expiryBasis:'explicit'};
 const requests=['rejected','accepted','submitted'].map((status,i)=>({id:'request-'+i,number:['123','ПСТ-01','ПСТ-02'][i],status,version:1,items:[{id:'line',productId:product.id,quantity:i?10000:1,unit:'g',expiresAt:'2026-10-17T09:19:00Z'}],...(status==='submitted'?{}:{acceptance:[{lineId:'line',acceptedQuantity:i?10000:0,reason:i?'':'Повреждена упаковка'}]}),...(i===1?{deliveryId:'82866bce-posted'}:{})}));
 const analytics={products:[],daily:[],priceCoverage:[],ordersAccepted:0,ordersRejected:0,lossBatches:0};
 const procurement={id:'b541b8b3-purchase',supplierId:'supplier',status:'submitted',version:1,comment:'Пожалуйста, привезите к обеду',items:Array.from({length:11},(_,i)=>({id:'product-'+i,productId:product.id,quantity:12361.96+i,unit:'g'}))};
 const snapshot={now,revision:1,settings:{timezone:'Europe/Moscow',warningHours:48},analytics,products:[product],dishes:[],batches:[batch],expiringBatches:[batch],deliveries:[],orders:[],movements:[],recommendations:[],procurement:[],totals:{batches:2,deliveries:1,orders:0,movements:0,warningBatches:1,expiredBatches:1}};
 await page.route('**/*',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({path:path.resolve('backend/wwwroot',p.startsWith('/assets/')?p.slice(1):'index.html')})});
 await page.route('**/api/**',r=>{
  const u=new URL(r.request().url()),p=u.pathname;
  const body=p==='/api/session'?{id:'mock-manager',role:'manager',name:'Управляющий',demo:true}:p==='/api/suppliers'?[{id:'supplier',name:'Свежие продукты'}]:p==='/api/procurement-requests'?{items:[procurement],total:1,page:1,size:50}:p==='/api/delivery-requests'?{items:requests,total:3,page:1,size:50}:p.startsWith('/api/history/batches')?{items:[u.searchParams.get('status')==='expired'?{...batch,id:'expired-batch',expiresAt:'2026-10-09T08:45:00Z'}:batch],total:1}:p==='/api/offers/overrides'?[]:p==='/api/order-requests'?{items:[],total:0,page:1,size:50}:snapshot;
  return r.fulfill({json:body});
 });
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://localhost/deliveries');
  await expect(page.locator('.delivery-request-card')).toHaveCount(3);
  await expect(page.locator('.delivery-request-reason')).toContainText('Повреждена упаковка');
  await expect(page.locator('.delivery-request-card').nth(1)).toContainText('10 000 г');
  await page.getByRole('button',{name:'Проверить приёмку'}).click();
  await expect(page.getByRole('dialog',{name:'Приёмка ПСТ-02'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Delivery overflow '+width);
  await page.screenshot({path:'.tmp/delivery-cards-'+width+'.png',fullPage:true});
  await page.goto('http://localhost/procurement-requests');
  const procurementCard=page.locator('.procurement-request-card');
  await expect(procurementCard.locator('.delivery-request-items > li')).toHaveCount(11);
  await expect(procurementCard).toContainText('12 361,96 г');
  await expect(procurementCard).toContainText('Пожалуйста, привезите к обеду');
  await expect(procurementCard.getByRole('button',{name:'Отменить закупку'})).toBeVisible();
  await page.getByText('Создать заявку поставщику',{exact:true}).click();
  await page.getByRole('button',{name:'Добавить строку',exact:true}).click();
  await expect(page.getByRole('button',{name:'Отправить закупку'})).toBeEnabled();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Procurement overflow '+width);
  await procurementCard.screenshot({path:'.tmp/procurement-card-'+width+'.png'});
  await page.goto('http://localhost/expiry');
  for(const expired of [false,true]){
   if(expired)await page.getByRole('button',{name:'Просрочены',exact:true}).click();
   const card=page.locator('.expiry-entry');await expect(card).toHaveCount(1);
   const button=card.getByRole('button',{name:'Списать товар',exact:true});
   const a=await card.boundingBox(),b=await button.boundingBox();
   if(b.x<a.x||b.y<a.y||b.x+b.width>a.x+a.width+1||b.y+b.height>a.y+a.height+1)throw Error('Writeoff outside card '+width);
   await button.click();await expect(page.getByRole('dialog',{name:'Списать товар',exact:true})).toBeVisible();
   await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Expiry overflow '+width);
   await page.screenshot({path:'.tmp/expiry-card-'+width+'-'+expired+'.png',fullPage:true});
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: delivery/procurement cards, creation/acceptance forms, embedded writeoff, warning/expired cards, no overflow at 390/1440px.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
