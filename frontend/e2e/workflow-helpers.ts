import type {APIRequestContext} from '@playwright/test';
import {expect} from '@playwright/test';
export async function command(r:APIRequestContext,token:string,path:string,body:unknown,key:string|false=crypto.randomUUID()){return r.post('/api'+path,{headers:{Authorization:'Bearer '+token,...(key?{'Idempotency-Key':key}:{})},data:body});}
let cachedManager:{id:string;token:string;keyId:string}|undefined;
export async function setup(r:APIRequestContext){
 const suffix=crypto.randomUUID().slice(0,8),password=process.env.FLAGMAN_TEST_PASSWORD??process.env.FLAGMAN_PASSWORD??'test-password-123';
 if(!cachedManager){const login=await r.post('/api/login',{headers:{'X-Requested-With':'Flagman'},data:{login:'manager',password}});expect(login.ok(),await login.text()).toBeTruthy();
 const session=await (await r.get('/api/session')).json();const issue=await r.post('/api/accounts/'+session.id+'/keys',{headers:{'X-Requested-With':'Flagman'}});const managerKey=await issue.json();
 cachedManager={id:session.id,token:managerKey.token,keyId:managerKey.id};}
 const manager=cachedManager;
 async function account(role:string){const login=role+'-'+crypto.randomUUID().slice(0,8);const password=crypto.randomUUID();const a=await r.post('/api/accounts',{headers:{Authorization:'Bearer '+manager.token},data:{login,name:login,role,password}});expect(a.ok(),await a.text()).toBeTruthy();const u=await a.json();const k=await (await r.post('/api/accounts/'+u.id+'/keys',{headers:{Authorization:'Bearer '+manager.token}})).json();return {id:u.id,login,password,token:k.token,keyId:k.id};}
 const supplier=await account('supplier'),otherSupplier=await account('supplier'),waiter=await account('waiter');const product='p-'+suffix,cream='c-'+suffix,dish='d-'+suffix;
 for(const p of [{id:product,name:'Томаты '+suffix,unit:'g'},{id:cream,name:'Сливки '+suffix,unit:'ml'}])expect((await command(r,manager.token,'/products',p)).ok()).toBeTruthy();
 expect((await command(r,manager.token,'/dishes',{id:dish,name:'Блюдо '+suffix,category:'Тест',ingredients:[{productId:product,quantity:500}]})).ok()).toBeTruthy();
 const now=(await (await r.get("/api/snapshot",{headers:{Authorization:"Bearer "+manager.token}})).json()).now; return {manager,supplier,otherSupplier,waiter,product,cream,dish,now};
}
export async function stock(r:APIRequestContext,token:string,product:string){const s=await (await r.get('/api/snapshot',{headers:{Authorization:'Bearer '+token}})).json();return s.products.find((p:any)=>p.id===product);}
export async function receipt(r:APIRequestContext,f:Awaited<ReturnType<typeof setup>>,quantity=500){const d=await command(r,f.supplier.token,'/deliveries',{number:'TEST',items:[{productId:f.product,quantity,unit:'g',expiresAt:new Date(new Date(f.now).getTime()+3600000).toISOString()}]});expect(d.status()).toBe(201);const doc=await d.json();const a=await command(r,f.manager.token,'/delivery-requests/'+doc.id+'/acceptance',{expectedVersion:1,items:[{lineId:doc.items[0].id,acceptedQuantity:quantity}]});expect(a.ok(),await a.text()).toBeTruthy();return a.json();}
export async function loginPage(page:import('@playwright/test').Page,login:string,password:string,path:string){await page.request.post('/api/logout',{headers:{'X-Requested-With':'Flagman'}});await page.goto(path);await page.getByLabel('Логин',{exact:true}).fill(login);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Открыть кухню'}).click();}
