import {finalizeLatest} from './legacy-workflow-helpers';
import { chooseOption } from './helpers';
import {test,expect} from '@playwright/test';
test.skip(process.env.FLAGMAN_DEMO==='true','Uses a fresh database with demo disabled');
test.use({timezoneId:'America/New_York'});
test('empty restaurant, generated IDs, restaurant timezone, URL and keyboard',async({page,request})=>{
  await page.goto('/');
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:960});await page.screenshot({path:`../test-results/login-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.getByLabel('Пароль').fill(process.env.FLAGMAN_PASSWORD!);await page.getByRole('button',{name:'Открыть кухню'}).click();
  await expect(page.getByRole('button',{name:'Загрузить демо'})).toHaveCount(0);await expect(page.getByRole('navigation').getByText('Демонстрация')).toHaveCount(0);
  await page.getByRole('button',{name:'Настройки',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Настройки',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Добавить продукт',exact:true}).click();await page.getByRole('dialog').getByLabel('Название',{exact:true}).fill('Первый продукт с очень длинным названием для проверки переноса строк и таблиц');await page.getByRole('dialog').getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Меню и рецептуры',exact:true}).click();await page.getByRole('button',{name:'Добавить блюдо',exact:true}).click();await page.getByRole('dialog').getByLabel('Название',{exact:true}).fill('Первое блюдо');await page.getByRole('dialog').getByLabel(/^Количество/).fill('100');await page.getByRole('dialog').getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();await page.getByRole('dialog').getByLabel('Количество',{exact:true}).fill('500');
  const future=new Date(Date.now()+86400000);const wall=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(future).replace(' ','T');
  await chooseOption(page.getByRole('dialog'),'Как указан срок годности','datetime');await page.getByRole('dialog').getByLabel('Дата и время истечения').fill(wall);await page.getByRole('dialog').getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByText('Заявка на поставку отправлена. Ожидает приёмки.')).toBeVisible();await finalizeLatest(page.request,'delivery');
  await page.getByRole('button',{name:'Новый заказ',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Отправить заявку'}).click();await expect(page.getByText('Заявка на заказ отправлена. Ожидает решения менеджера.')).toBeVisible();await finalizeLatest(page.request,'order');
  const headers={'X-Requested-With':'Flagman'};await request.post('/api/login',{headers,data:{login:'manager',password:process.env.FLAGMAN_PASSWORD}});const snap=await(await request.get('/api/snapshot')).json();expect(Date.parse(snap.batches[0].expiresAt)).toBe(Math.floor(future.getTime()/60000)*60000);expect(snap.products[0].usable).toBe(400);
  await page.getByRole('navigation').getByRole('button',{name:'Склад и партии',exact:true}).click();await page.getByPlaceholder('Продукт, партия или ID поставки…').fill('первый');await page.reload();await expect(page.getByPlaceholder('Продукт, партия или ID поставки…')).toHaveValue('первый');await expect(page.getByText('Найдено 1 партий по всему складу')).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Закупки',exact:true}).click();await page.goBack();await expect(page.getByRole('heading',{name:'Склад и партии',exact:true})).toBeVisible();await page.goForward();await expect(page.getByRole('heading',{name:'Закупки',exact:true})).toBeVisible();
});
