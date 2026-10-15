# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-events.spec.ts >> admin event log streams workflow events and manager menu is persisted
- Location: e2e\admin-events.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('cell', { name: 'Заказ готов к выдаче' })
Expected: visible
Error: strict mode violation: getByRole('cell', { name: 'Заказ готов к выдаче' }) resolved to 2 elements:
    1) <td>…</td> aka getByRole('cell', { name: 'Заказ готов к выдаче order-' }).first()
    2) <td>…</td> aka getByRole('cell', { name: 'Заказ готов к выдаче order-' }).nth(1)

Call log:
  - Expect "toBeVisible" getByRole('cell', { name: 'Заказ готов к выдаче' }) with timeout 5000ms
  - waiting for getByRole('cell', { name: 'Заказ готов к выдаче' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "Перейти к содержимому" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary "Навигация кухни" [ref=e5]:
    - link "флагман КОНТРОЛЬ КУХНИ" [ref=e6] [cursor=pointer]:
      - /url: /overview
      - generic [ref=e11]:
        - text: флагман
        - generic [ref=e12]: КОНТРОЛЬ КУХНИ
    - generic [ref=e20]:
      - text: Ресторан «Флагман»
      - generic [ref=e21]: Операционный кабинет
    - navigation "Основная навигация" [ref=e23]:
      - paragraph [ref=e24]: Каждый день
      - button "Обзор кухни" [ref=e25] [cursor=pointer]
      - button "Склад и партии" [ref=e32] [cursor=pointer]
      - button "Меню и рецептуры" [ref=e44] [cursor=pointer]
      - button "Заказы" [ref=e51] [cursor=pointer]
      - button "Поставки" [ref=e59] [cursor=pointer]
      - paragraph [ref=e66]: Контроль кухни
      - button "Сроки годности" [ref=e67] [cursor=pointer]
      - button "Стоп-лист" [ref=e72] [cursor=pointer]:
        - generic [ref=e76]: "2"
      - button "Горячие предложения" [ref=e77] [cursor=pointer]
      - paragraph [ref=e81]: Планирование
      - button "Закупки" [ref=e82] [cursor=pointer]
      - button "Заявки поставщикам" [ref=e89] [cursor=pointer]
      - button "Прогноз" [ref=e96] [cursor=pointer]
      - button "Аналитика и закупки" [ref=e101] [cursor=pointer]
      - button "Аккаунты" [ref=e105] [cursor=pointer]
      - button "Журнал событий" [ref=e110] [cursor=pointer]
      - button "Демонстрация" [ref=e114] [cursor=pointer]
    - generic [ref=e117]:
      - generic [ref=e122]:
        - text: Склад под контролем
        - generic [ref=e123]: Учёт по партиям · FEFO
      - button "Администратор Настройки ресторана" [ref=e124] [cursor=pointer]:
        - generic [ref=e129]:
          - text: Администратор
          - generic [ref=e130]: Настройки ресторана
  - generic [ref=e131]:
    - banner [ref=e132]:
      - generic [ref=e134]:
        - text: Рабочее пространство
        - strong [ref=e137]: Журнал событий
      - generic [ref=e138]:
        - generic [ref=e139]:
          - generic [ref=e140]:
            - generic [ref=e141]: Демо-режим
            - generic [ref=e142]: Время демо (+2 ч)
          - time [ref=e143]:
            - generic [ref=e144]: 15 окт. 2026 г.
            - generic [ref=e145]: 22:06:52
            - generic [ref=e146]: Europe/Moscow
        - button "Уведомления" [ref=e148] [cursor=pointer]
        - button "Выйти" [ref=e153] [cursor=pointer]
    - main [ref=e157]:
      - generic [ref=e158]:
        - generic [ref=e160]:
          - paragraph [ref=e161]: ОПЕРАЦИОННЫЙ КОНТРОЛЬ
          - heading "Журнал событий" [level=1] [ref=e162]
          - paragraph [ref=e163]: Поставки, заказы, сроки годности и действия сотрудников в одном журнале.
        - generic [ref=e164]: "Проверено 20:06:53 · #78"
        - generic [ref=e166]:
          - generic [ref=e168]:
            - heading "Все события ресторана" [level=2] [ref=e169]
            - paragraph [ref=e172]: Новые события появляются автоматически. История сохраняется после перезапуска.
          - generic [ref=e173]:
            - generic [ref=e174]:
              - text: Поиск по продукту, номеру или ID
              - textbox "Поиск по продукту, номеру или ID" [active] [ref=e175]:
                - /placeholder: Найти событие…
                - text: 3a44a38ac05d43a8bcc3513c46851df1
            - generic [ref=e176]:
              - text: Категория
              - combobox "Категория" [ref=e178] [cursor=pointer]: Все события
            - button "Обновить" [ref=e179] [cursor=pointer]
          - table [ref=e181]:
            - rowgroup [ref=e182]:
              - row [ref=e183]:
                - columnheader "Дата и время" [ref=e184]
                - columnheader "Событие" [ref=e185]
                - columnheader "Подробности" [ref=e186]
                - columnheader "Кто выполнил" [ref=e187]
            - rowgroup [ref=e188]:
              - row [ref=e189]:
                - cell "15.10.2026, 22:06:52 № 78" [ref=e190]:
                  - time [ref=e191]: 15.10.2026, 22:06:52
                  - generic [ref=e192]: № 78
                - cell "Заказ готов к выдаче order-request.ready" [ref=e193]:
                  - strong [ref=e194]: Заказ готов к выдаче
                  - generic [ref=e195]: order-request.ready
                - 'cell "— ID: 3a44a38ac05d43a8bcc3513c46851df1" [ref=e196]':
                  - text: —
                  - generic [ref=e197]: "ID: 3a44a38ac05d43a8bcc3513c46851df1"
                - cell "cook-27da2794" [ref=e198]
              - row [ref=e199]:
                - cell "15.10.2026, 22:06:52 № 76" [ref=e200]:
                  - time [ref=e201]: 15.10.2026, 22:06:52
                  - generic [ref=e202]: № 76
                - cell "Создана заявка на заказ order-request.submitted" [ref=e203]:
                  - strong [ref=e204]: Создана заявка на заказ
                  - generic [ref=e205]: order-request.submitted
                - 'cell "— ID: 3a44a38ac05d43a8bcc3513c46851df1" [ref=e206]':
                  - text: —
                  - generic [ref=e207]: "ID: 3a44a38ac05d43a8bcc3513c46851df1"
                - cell "waiter-9ad3160a" [ref=e208]
          - generic [ref=e209]:
            - generic [ref=e210]: 2 записей · страница 1 из 1
            - generic [ref=e211]:
              - button "Предыдущая страница" [disabled] [ref=e212]
              - button "Следующая страница" [disabled] [ref=e215]
        - generic [ref=e218]:
          - generic [ref=e219]: Флагман · каждый продукт имеет значение
          - generic [ref=e223]: Единый склад · точные остатки · контроль сроков
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {setup,command,receipt,loginPage} from './workflow-helpers';
  3  | test('admin event log streams workflow events and manager menu is persisted',async({page})=>{
  4  |  test.setTimeout(120000);
  5  |  const f=await setup(page.request),headers={Authorization:'Bearer '+f.manager.token};
  6  |  const login='limited-'+crypto.randomUUID(),password=crypto.randomUUID();
  7  |  const response=await page.request.post('/api/accounts',{headers,data:{login,password,name:'Менеджер с меню',role:'manager',visiblePages:['stock','orders']}});
  8  |  expect(response.ok()).toBeTruthy();const manager=await response.json();
  9  |  const key=await(await page.request.post('/api/accounts/'+manager.id+'/keys',{headers})).json();
  10 |  for(const actor of [key.token,f.waiter.token,f.supplier.token,f.cook.token])for(const route of ['/history/eventLog','/HISTORY/EVENTLOG'])expect((await page.request.get('/api'+route,{headers:{Authorization:'Bearer '+actor}})).status()).toBe(403);
  11 |  const delivery=await receipt(page.request,f,1500);
  12 |  const order=await(await command(page.request,f.waiter.token,'/order-requests',{items:[{dishId:f.dish,portions:1}]})).json();
  13 |  expect((await command(page.request,f.cook.token,'/order-requests/'+order.id+'/decision',{expectedVersion:1,decision:'accept'})).ok()).toBeTruthy();
  14 |  await page.goto('/event-log');await expect(page.getByRole('heading',{name:'Все события ресторана'})).toBeVisible();
  15 |  const search=page.getByRole('textbox',{name:'Поиск по продукту, номеру или ID'});
> 16 |  await search.fill(order.id);await expect(page.getByRole('cell',{name:'Заказ готов к выдаче',exact:false})).toBeVisible();
     |                                                                                                             ^ Error: expect(locator).toBeVisible() failed
  17 |  // This event is emitted after the log page has subscribed to updates.
  18 |  expect((await command(page.request,f.waiter.token,'/order-requests/'+order.id+'/serve',{expectedVersion:2})).ok()).toBeTruthy();
  19 |  await expect(page.getByRole('cell',{name:'Заказ выдан гостю',exact:false})).toBeVisible();
  20 |  await search.fill(delivery.deliveryId);await expect(page.getByText('Поставка принята на склад',{exact:true})).toBeVisible();
  21 |  await page.request.post('/api/demo/time',{headers,data:{hours:2}});
  22 |  await search.fill(f.product.slice(2));await expect(page.getByText('Истёк срок годности продукта',{exact:true})).toBeVisible();
  23 |  await search.fill('');
  24 |  await page.screenshot({path:'../.tmp/admin-event-verification/log-desktop.png',fullPage:true});
  25 |  for(const width of [390,280]){await page.setViewportSize({width,height:850});await expect(page.getByRole('heading',{name:'Все события ресторана'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
  26 |  await page.screenshot({path:'../.tmp/admin-event-verification/log-mobile.png',fullPage:true});
  27 |  await page.setViewportSize({width:1440,height:960});
  28 |  await page.goto('/accounts');
  29 |  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Менеджер с меню',exact:true})});
  30 |  await card.getByRole('button',{name:'Изменить аккаунт'}).click();
  31 |  await expect(page.getByRole('checkbox',{name:'Склад и партии',exact:true})).toBeChecked();
  32 |  await expect(page.getByRole('checkbox',{name:'Обзор кухни',exact:true})).not.toBeChecked();
  33 |  await page.getByRole('checkbox',{name:'Сроки годности',exact:true}).check();
  34 |  await page.getByRole('button',{name:'Сохранить аккаунт'}).click();
  35 |  await expect(page.getByRole('button',{name:'Создать аккаунт',exact:true})).toBeVisible();
  36 |  await loginPage(page,login,password,'/overview');await expect(page).toHaveURL(/\/stock$/);
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