import {acceptDocument} from './legacy-workflow-helpers';
import {test,expect} from '@playwright/test';

test.skip(process.env.FLAGMAN_DEMO!=='true','Uses an isolated demo database');
test('full warning counts and pagination beyond 500 batches with live API',async({page})=>{
  test.setTimeout(90000);
  const headers={'X-Requested-With':'Flagman'};
  await page.request.post('/api/login',{headers,data:{login:'manager',password:process.env.FLAGMAN_PASSWORD}});
  const before=await (await page.request.get('/api/snapshot')).json();
  const productId='audit-'+crypto.randomUUID();
  const name='Аудит партий '+productId;
  expect((await page.request.post('/api/products',{headers,data:{id:productId,name,unit:'g',warningHours:48}})).ok()).toBe(true);
  for(let i=0;i<6;i++){
    const response=await page.request.post('/api/deliveries',{headers:{...headers,'Idempotency-Key':productId+'-'+i},data:{number:productId+'-'+i,items:Array.from({length:i===5?1:100},()=>({productId,quantity:1,unit:'g',shelfLifeHours:24}))}});
    expect(response.ok()).toBe(true);await acceptDocument(page.request,await response.json());
  }
  const after=await (await page.request.get('/api/snapshot')).json();
  expect(after.totals.activeBatches).toBe(before.totals.activeBatches+501);
  expect(after.totals.warningBatches).toBe(before.totals.warningBatches+501);
  await page.goto('/overview');
  await expect(page.locator('.metric').filter({hasText:'Истекают скоро'}).locator('strong')).toHaveText(String(after.totals.warningBatches));
  await expect(page.getByText(`${after.totals.activeBatches} активных партий`,{exact:true})).toBeVisible();
  await page.goto('/expiry');
  await page.getByLabel('Поиск по всей истории').fill(name);
  await expect(page.locator('.pagination')).toContainText('501 записей');
  await expect(page.locator('.expiry-row')).toHaveCount(20);
  for(let i=1;i<=25;i++){
    await page.getByRole('button',{name:'Следующая страница',exact:true}).click();
    await expect(page.locator('.pagination')).toContainText(`страница ${i+1} из 26`);
  }
  await expect(page.locator('.expiry-row')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Следующая страница',exact:true})).toBeDisabled();
  // Calendar-date API returns exactly one restaurant day, independently of browser zone.
  const one=await (await page.request.get('/api/analytics?fromDate=2026-10-12&toDate=2026-10-12')).json();
  expect(one.timezone).toBe('Europe/Moscow');
  expect(one.daily).toHaveLength(1);
  expect(one.daily[0].day).toBe('2026-10-12');
  expect(one.from).toBe('2026-10-11T21:00:00+00:00');
});
