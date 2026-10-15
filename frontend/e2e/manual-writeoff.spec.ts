import {test,expect} from '@playwright/test';
import {setup,command,stock,receipt,loginPage} from './workflow-helpers';

async function batchDetails(r:any,f:any,accepted:any){return (await r.get('/api/details/deliveries/'+accepted.deliveryId,{headers:{Authorization:'Bearer '+f.manager.token}})).json();}

test('expiry keeps physical stock until reasoned manual writeoff; retries do not duplicate',async({request})=>{
 const f=await setup(request),accepted=await receipt(request,f);
 expect((await command(request,f.manager.token,'/demo/time',{hours:2},false)).ok()).toBeTruthy();
 const p=await stock(request,f.manager.token,f.product);expect(p.physical).toBe(500);expect(p.usable).toBe(0);
 const b=(await batchDetails(request,f,accepted)).batches[0],url='/batches/'+b.id+'/write-off';
 expect((await command(request,f.supplier.token,url,{reason:'Порча'})).status()).toBe(403);
 for(const body of [{},{reason:''},{reason:'   '},{reason:'x'.repeat(501)}])expect((await command(request,f.manager.token,url,body)).status()).toBe(400);
 expect((await stock(request,f.manager.token,f.product)).physical).toBe(500);
 const key=crypto.randomUUID(),body={reason:'Истёк срок годности'};
 expect((await command(request,f.manager.token,url,body,key)).ok()).toBeTruthy();
 expect((await command(request,f.manager.token,url,body,key)).ok()).toBeTruthy();
 expect((await command(request,f.manager.token,url,{reason:'Другая причина'},key)).status()).toBe(409);
 expect((await command(request,f.manager.token,url,body)).status()).toBe(409);
 expect((await stock(request,f.manager.token,f.product)).physical).toBe(0);
 const movements=(await batchDetails(request,f,accepted)).movements.filter((m:any)=>m.kind==='write_off');
 expect(movements).toHaveLength(1);expect(movements[0]).toMatchObject({reason:body.reason,actorId:f.manager.id,quantity:-500});
});

test('expired party shows red and can be written off in details with reason',async({page})=>{
 const f=await setup(page.request),accepted=await receipt(page.request,f);
 await command(page.request,f.manager.token,'/demo/time',{hours:2},false);
 const id=(await batchDetails(page.request,f,accepted)).batches[0].id;
 await loginPage(page,'manager',process.env.FLAGMAN_PASSWORD!,'/stock');
 await page.getByPlaceholder('Продукт, партия или ID поставки…').fill(id);
 const row=page.locator('#main-content tbody tr').filter({hasText:id.slice(0,8).toUpperCase()});
 await expect(row).toContainText('Просрочена');await expect(row).toHaveClass(/expired-stock/);
 await row.getByRole('button').first().click();const d=page.getByRole('dialog',{name:'История операции'});
 await d.getByRole('button',{name:'Списать товар',exact:true}).click();
 const writeoff=page.getByRole('dialog',{name:'Списать товар',exact:true});
 await expect(writeoff.getByLabel('Причина списания')).toHaveValue('');
 await writeoff.getByLabel('Причина списания').fill('Проверка отмены');
 await page.keyboard.press('Escape');await expect(writeoff).not.toBeVisible();await expect(d).toBeVisible();
 await d.getByRole('button',{name:'Списать товар',exact:true}).click();
 await expect(writeoff.getByLabel('Причина списания')).toHaveValue('');
 await writeoff.getByLabel('Причина списания').fill('Истёк срок годности');
 await writeoff.getByRole('button',{name:'Подтвердить списание'}).click();
 await expect(writeoff).not.toBeVisible();
 await expect(d).toContainText('Ручное списание');await expect(d).toContainText('Истёк срок годности');
 await d.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(d).not.toBeVisible();await expect(row).toContainText('Списана');
 expect((await stock(page.request,f.manager.token,f.product)).physical).toBe(0);
});

test('unexpired stock can be written off with a mandatory reason; cancel keeps stock',async({page})=>{
 const f=await setup(page.request),accepted=await receipt(page.request,f);
 const id=(await batchDetails(page.request,f,accepted)).batches[0].id;
 await loginPage(page,'manager',process.env.FLAGMAN_PASSWORD!,'/stock');
 await page.getByPlaceholder('Продукт, партия или ID поставки…').fill(id);
 const row=page.locator('#main-content tbody tr').filter({hasText:id.slice(0,8).toUpperCase()});
 await expect(row).not.toHaveClass(/expired-stock/);
 await row.getByRole('button',{name:'Списать товар',exact:true}).click();
 const writeoff=page.getByRole('dialog',{name:'Списать товар',exact:true});
 await expect(writeoff.getByLabel('Причина списания')).toHaveValue('');
 await expect(writeoff.getByLabel('Причина списания')).not.toHaveAttribute('placeholder');
 await expect(writeoff.getByRole('combobox')).toHaveCount(0);
 await expect(writeoff.getByRole('button',{name:'Подтвердить списание'})).toBeDisabled();
 await writeoff.getByLabel('Причина списания').fill('  ');await expect(writeoff.getByRole('button',{name:'Подтвердить списание'})).toBeDisabled();
 await writeoff.getByRole('button',{name:'Отмена',exact:true}).click();
 await expect(writeoff).not.toBeVisible();
 expect((await stock(page.request,f.manager.token,f.product)).physical).toBe(500);
 await row.getByRole('button',{name:'Списать товар',exact:true}).click();
 await writeoff.getByLabel('Причина списания').fill('Повреждена упаковка');
 await writeoff.getByRole('button',{name:'Подтвердить списание'}).click();await expect(row).toContainText('Списана');
 expect((await stock(page.request,f.manager.token,f.product)).physical).toBe(0);
 await page.getByRole('button',{name:'Журнал движений',exact:true}).click();
 await expect(page.locator('tbody tr').filter({hasText:id.slice(0,8).toUpperCase()}).filter({hasText:'Ручное списание'})).toContainText('Повреждена упаковка');
});

for(const expired of [false,true])test('expiry section reason form works on mobile, expired='+expired,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const f=await setup(page.request),accepted=await receipt(page.request,f);
 const id=(await batchDetails(page.request,f,accepted)).batches[0].id;
 if(expired)await command(page.request,f.manager.token,'/demo/time',{hours:2},false);
 await loginPage(page,'manager',process.env.FLAGMAN_PASSWORD!,'/expiry');
 if(expired)await page.getByRole('button',{name:'Просрочены',exact:true}).click();
 const entry=page.locator('.expiry-entry').filter({hasText:id.slice(0,8).toUpperCase()});
 await entry.getByRole('button',{name:'Списать товар',exact:true}).click();
 const writeoff=page.getByRole('dialog',{name:'Списать товар',exact:true});
 const input=writeoff.getByLabel('Причина списания');await input.fill(expired?'Истёк срок годности':'Порча при хранении');
 for(const element of [input,writeoff.getByRole('button',{name:'Подтвердить списание'})]){const b=await element.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(390);}
 await page.screenshot({path:'../test-results/writeoff-reason-mobile-'+expired+'.png',fullPage:true});
 await writeoff.getByRole('button',{name:'Подтвердить списание'}).click();await expect(entry).toHaveCount(0);
 expect((await stock(page.request,f.manager.token,f.product)).physical).toBe(0);
});
