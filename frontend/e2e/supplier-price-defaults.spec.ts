import {test,expect} from '@playwright/test';
import {command,setup,loginPage} from './workflow-helpers';
import {chooseOption} from './helpers';

test('supplier remembers its own prices in deliveries and procurement responses',async({page,request})=>{
 const f=await setup(request);
 const expiresAt=new Date(new Date(f.now).getTime()+7*86400000).toISOString();
 const catalog=async(token=f.supplier.token)=>(await (await request.get('/api/supplier/catalog',{headers:{Authorization:'Bearer '+token}})).json()) as any[];
 expect((await catalog()).find(p=>p.id===f.product).lastUnitCost).toBeNull();
 const submit=async(token:string,items:unknown[])=>{
  const result=await command(request,token,'/delivery-requests',{number:crypto.randomUUID(),items});
  expect(result.ok(),await result.text()).toBeTruthy();
 };
 await submit(f.supplier.token,[{productId:f.product,quantity:1,unit:'kg',expiresAt,unitCost:250,currency:'USD'},{productId:f.cream,quantity:1,unit:'l',expiresAt,unitCost:120,currency:'EUR'}]);
 await submit(f.otherSupplier.token,[{productId:f.product,quantity:1,unit:'kg',expiresAt,unitCost:999,currency:'RUB'}]);
 // A later delivery without a price must not erase the last known value.
 await submit(f.supplier.token,[{productId:f.product,quantity:1,unit:'g',expiresAt}]);
 expect((await catalog()).find(p=>p.id===f.product)).toMatchObject({lastUnitCost:0.25,lastCurrency:'USD'});
 expect((await catalog()).find(p=>p.id===f.cream)).toMatchObject({lastUnitCost:0.12,lastCurrency:'EUR'});
 expect((await catalog(f.otherSupplier.token)).find(p=>p.id===f.product)).toMatchObject({lastUnitCost:0.999,lastCurrency:'RUB'});
 const purchase=await command(request,f.manager.token,'/procurement-requests',{supplierId:f.supplier.id,items:[{id:'price-line',productId:f.product,quantity:1,unit:'kg'}]});
 expect(purchase.ok(),await purchase.text()).toBeTruthy();
 await loginPage(page,f.supplier.login,f.supplier.password,'/supplier');
 await page.getByRole('button',{name:'Добавить лот',exact:true}).click();
 const lot=page.locator('.workflow-line').first();
 await chooseOption(lot,'Продукт',f.product);
 await expect(lot.getByLabel('Цена за единицу (необязательно)',{exact:true})).toHaveValue('0.25');
 await expect(lot.getByRole('combobox',{name:'Валюта',exact:true})).toHaveValue('USD');
 await chooseOption(lot,'Продукт',f.cream);
 await expect(lot.getByLabel('Цена за единицу (необязательно)',{exact:true})).toHaveValue('0.12');
 await expect(lot.getByRole('combobox',{name:'Валюта',exact:true})).toHaveValue('EUR');
 await page.getByRole('button',{name:'Ответить по строкам',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('Цена за единицу (необязательно)',{exact:true})).toHaveValue('250');
 await expect(dialog.getByRole('combobox',{name:'Валюта',exact:true})).toHaveValue('USD');
 await dialog.getByLabel('Цена за единицу (необязательно)',{exact:true}).fill('0');
 await dialog.getByLabel(/^Срок годности/).fill(expiresAt.slice(0,16));
 await dialog.getByRole('button',{name:'Отправить ответ',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(async()=>(await catalog()).find(p=>p.id===f.product).lastUnitCost).toBe(0);
 await chooseOption(lot,'Продукт',f.product);
 await expect(lot.getByLabel('Цена за единицу (необязательно)',{exact:true})).toHaveValue('0');
 // Reloading preserves defaults; they are stored on the server.
 await page.reload();
 await page.getByRole('button',{name:'Добавить лот',exact:true}).click();
 await chooseOption(page.locator('.workflow-line').first(),'Продукт',f.product);
 await expect(page.locator('.workflow-line').first().getByLabel('Цена за единицу (необязательно)',{exact:true})).toHaveValue('0');
});
