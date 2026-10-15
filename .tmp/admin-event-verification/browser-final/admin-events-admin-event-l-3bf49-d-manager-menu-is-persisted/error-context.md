# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-events.spec.ts >> admin event log streams workflow events and manager menu is persisted
- Location: e2e\admin-events.spec.ts:3:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/stock$/
Received string:  "http://127.0.0.1:5097/stock?sort=received_newest&status=all"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    6 × locator resolved to <html lang="ru">…</html>
      - unexpected value "http://127.0.0.1:5097/overview"
    7 × locator resolved to <html lang="ru">…</html>
      - unexpected value "http://127.0.0.1:5097/stock?sort=received_newest&status=all"

```

```yaml
- link "Перейти к содержимому":
  - /url: "#main-content"
- complementary "Навигация кухни":
  - link "флагман КОНТРОЛЬ КУХНИ":
    - /url: /overview
    - img
    - text: флагман КОНТРОЛЬ КУХНИ
  - img
  - text: Ресторан «Флагман» Операционный кабинет
  - navigation "Основная навигация":
    - paragraph: Каждый день
    - button "Склад и партии":
      - img
      - text: Склад и партии
    - button "Заказы":
      - img
      - text: Заказы
    - paragraph: Контроль кухни
    - button "Сроки годности":
      - img
      - text: Сроки годности
    - paragraph: Планирование
  - img
  - text: Склад под контролем Учёт по партиям · FEFO
  - button "Менеджер bad90763-2f7a-456a-8683-b544ea43a8a0 Настройки ресторана"
- banner:
  - text: Рабочее пространство
  - img
  - strong: Склад и партии
  - text: Демо-режим Время демо (+4 ч)
  - time: 16 окт. 2026 г. 00:07:28 Europe/Moscow
  - button "Уведомления":
    - img
  - button "Выйти":
    - img
- main:
  - paragraph: ОПЕРАЦИОННЫЙ КОНТРОЛЬ
  - heading "Склад и партии" [level=1]
  - paragraph: Остатки по продуктам и партиям. Сроки, которым нужно внимание.
  - button "Принять поставку":
    - img
    - text: Принять поставку
  - text: "Проверено 20:07:28 · #111"
  - button "Партии 4"
  - button "Продукты 8"
  - button "Журнал движений"
  - img
  - textbox "Продукт, партия или ID поставки…"
  - button "Добавить продукт":
    - img
    - text: Добавить продукт
  - text: Порядок партий
  - combobox "Порядок партий": Последние поступления сверху
  - button "Все партии"
  - button "Истекают скоро"
  - button "Свежие"
  - button "Просрочены"
  - button "Израсходованы"
  - button "Списаны"
  - table:
    - rowgroup:
      - row "Продукт / партия Поставка Остаток / принято Срок годности Расчёт срока Статус":
        - columnheader "Продукт / партия"
        - columnheader "Поставка"
        - columnheader "Остаток / принято"
        - columnheader "Срок годности"
        - columnheader "Расчёт срока"
        - columnheader "Статус"
    - rowgroup:
      - 'row "Томаты 54112da0 #362F15CB TEST 15 окт., 22:07 1 000 г из 1 500 г 15 окт., 23:07 Срок истёк Явная дата Просрочена Списать товар"':
        - 'cell "Томаты 54112da0 #362F15CB"':
          - strong: Томаты 54112da0
          - button "#362F15CB"
        - cell "TEST 15 окт., 22:07"
        - cell "1 000 г из 1 500 г":
          - strong: 1 000 г
          - text: из 1 500 г
        - cell "15 окт., 23:07 Срок истёк"
        - cell "Явная дата":
          - strong: Явная дата
        - cell "Просрочена Списать товар":
          - text: Просрочена
          - button "Списать товар"
      - 'row "Томаты de04618e #8F8A7BF9 TEST 15 окт., 22:06 1 000 г из 1 500 г 15 окт., 23:06 Срок истёк Явная дата Просрочена Списать товар"':
        - 'cell "Томаты de04618e #8F8A7BF9"':
          - strong: Томаты de04618e
          - button "#8F8A7BF9"
        - cell "TEST 15 окт., 22:06"
        - cell "1 000 г из 1 500 г":
          - strong: 1 000 г
          - text: из 1 500 г
        - cell "15 окт., 23:06 Срок истёк"
        - cell "Явная дата":
          - strong: Явная дата
        - cell "Просрочена Списать товар":
          - text: Просрочена
          - button "Списать товар"
      - 'row "Томаты 90c25d77 #BE9B4AD3 TEST 15 окт., 22:06 0 г из 500 г 15 окт., 23:06 Срок истёк Явная дата Израсходована"':
        - 'cell "Томаты 90c25d77 #BE9B4AD3"':
          - strong: Томаты 90c25d77
          - button "#BE9B4AD3"
        - cell "TEST 15 окт., 22:06"
        - cell "0 г из 500 г":
          - strong: 0 г
          - text: из 500 г
        - cell "15 окт., 23:06 Срок истёк"
        - cell "Явная дата":
          - strong: Явная дата
        - cell "Израсходована"
      - 'row "Томаты 5bbd0b87 #C7E2C8BD TEST 15 окт., 20:05 1 000 г из 1 500 г 15 окт., 21:05 Срок истёк Явная дата Просрочена Списать товар"':
        - 'cell "Томаты 5bbd0b87 #C7E2C8BD"':
          - strong: Томаты 5bbd0b87
          - button "#C7E2C8BD"
        - cell "TEST 15 окт., 20:05"
        - cell "1 000 г из 1 500 г":
          - strong: 1 000 г
          - text: из 1 500 г
        - cell "15 окт., 21:05 Срок истёк"
        - cell "Явная дата":
          - strong: Явная дата
        - cell "Просрочена Списать товар":
          - text: Просрочена
          - button "Списать товар"
  - paragraph: Просроченные партии исключены из пригодного запаса. Физический остаток сохраняется до ручного списания менеджером. Любую партию с остатком можно списать с указанием причины.
  - text: Найдено 4 партий по всему складу
  - button "Предыдущая страница партий" [disabled]:
    - img
  - text: "1"
  - button "Следующая страница партий" [disabled]:
    - img
  - img
  - text: Флагман · каждый продукт имеет значение Единый склад · точные остатки · контроль сроков
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {setup,command,receipt,loginPage} from './workflow-helpers';
  3  | test('admin event log streams workflow events and manager menu is persisted',async({page})=>{
  4  |  test.setTimeout(120000);
  5  |  const f=await setup(page.request),headers={Authorization:'Bearer '+f.manager.token};
  6  |  const login='limited-'+crypto.randomUUID(),password=crypto.randomUUID(),name='Менеджер '+crypto.randomUUID();
  7  |  const response=await page.request.post('/api/accounts',{headers,data:{login,password,name,role:'manager',visiblePages:['stock','orders']}});
  8  |  expect(response.ok()).toBeTruthy();const manager=await response.json();
  9  |  const key=await(await page.request.post('/api/accounts/'+manager.id+'/keys',{headers})).json();
  10 |  for(const actor of [key.token,f.waiter.token,f.supplier.token,f.cook.token])for(const route of ['/history/eventLog','/HISTORY/EVENTLOG'])expect((await page.request.get('/api'+route,{headers:{Authorization:'Bearer '+actor}})).status()).toBe(403);
  11 |  const delivery=await receipt(page.request,f,1500);
  12 |  const order=await(await command(page.request,f.waiter.token,'/order-requests',{items:[{dishId:f.dish,portions:1}]})).json();
  13 |  expect((await command(page.request,f.cook.token,'/order-requests/'+order.id+'/decision',{expectedVersion:1,decision:'accept'})).ok()).toBeTruthy();
  14 |  await page.goto('/event-log');await expect(page.getByRole('heading',{name:'Все события ресторана'})).toBeVisible();
  15 |  const search=page.getByRole('textbox',{name:'Поиск по продукту, номеру или ID'});
  16 |  await search.fill(order.id);await expect(page.getByRole('row').filter({hasText:order.id}).getByText('Заказ готов к выдаче',{exact:true})).toBeVisible();
  17 |  // This event is emitted after the log page has subscribed to updates.
  18 |  expect((await command(page.request,f.waiter.token,'/order-requests/'+order.id+'/serve',{expectedVersion:2})).ok()).toBeTruthy();
  19 |  await expect(page.getByRole('row').filter({hasText:order.id}).getByText('Заказ выдан гостю',{exact:true})).toBeVisible();
  20 |  await search.fill(delivery.deliveryId);await expect(page.getByRole('row').filter({hasText:delivery.deliveryId}).getByText('Поставка принята на склад',{exact:true})).toBeVisible();
  21 |  await page.request.post('/api/demo/time',{headers,data:{hours:2}});
  22 |  await search.fill(f.product.slice(2));await expect(page.getByRole('row').filter({hasText:f.product.slice(2)}).getByText('Истёк срок годности продукта',{exact:true})).toBeVisible();
  23 |  await search.fill('');
  24 |  await page.screenshot({path:'../.tmp/admin-event-verification/log-desktop.png',fullPage:true});
  25 |  for(const width of [390,280]){await page.setViewportSize({width,height:850});await expect(page.getByRole('heading',{name:'Все события ресторана'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
  26 |  await page.screenshot({path:'../.tmp/admin-event-verification/log-mobile.png',fullPage:true});
  27 |  await page.setViewportSize({width:1440,height:960});
  28 |  await page.goto('/accounts');
  29 |  const card=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
  30 |  await card.getByRole('button',{name:'Изменить аккаунт'}).click();
  31 |  await expect(page.getByRole('checkbox',{name:'Склад и партии',exact:true})).toBeChecked();
  32 |  await expect(page.getByRole('checkbox',{name:'Обзор кухни',exact:true})).not.toBeChecked();
  33 |  await page.getByRole('checkbox',{name:'Сроки годности',exact:true}).check();
  34 |  await page.getByRole('button',{name:'Сохранить аккаунт'}).click();
  35 |  await expect(page.getByRole('button',{name:'Создать аккаунт',exact:true})).toBeVisible();
> 36 |  await loginPage(page,login,password,'/overview');await expect(page).toHaveURL(/\/stock$/);
     |                                                                      ^ Error: expect(page).toHaveURL(expected) failed
  37 |  const nav=page.getByRole('navigation');
  38 |  await expect(nav.getByRole('button')).toHaveCount(3);
  39 |  await expect(nav.getByRole('button',{name:'Сроки годности',exact:true})).toBeVisible();
  40 |  await expect(nav.getByRole('button',{name:'Обзор кухни',exact:true})).toHaveCount(0);
  41 |  await page.goto('/event-log');await expect(page).toHaveURL(/\/stock$/);
  42 |  await page.goto('/analytics');await expect(page).toHaveURL(/\/stock$/);
  43 |  await page.reload();await expect(nav.getByRole('button')).toHaveCount(3);
  44 |  for(const width of [390,280]){await page.setViewportSize({width,height:850});await page.getByRole('button',{name:'Открыть навигацию',exact:true}).click();await expect(nav.getByRole('button',{name:'Склад и партии',exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть навигацию',exact:true}).click();}
  45 | });
  46 | 
```