# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-events.spec.ts >> admin event log streams workflow events and manager menu is persisted
- Location: e2e\admin-events.spec.ts:3:1

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Закрыть навигацию', exact: true }) resolved to 2 elements:
    1) <button class="nav-scrim" data-phase="entering" aria-label="Закрыть навигацию"></button> aka getByRole('button', { name: 'Закрыть навигацию' }).first()
    2) <button class="icon-button nav-close" aria-label="Закрыть навигацию">…</button> aka getByRole('dialog', { name: 'Навигация кухни' }).getByRole('button', { name: 'Закрыть навигацию' })

Call log:
  - waiting for getByRole('button', { name: 'Закрыть навигацию', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f5e3]:
  - link "Перейти к содержимому" [ref=f5e4] [cursor=pointer]:
    - /url: "#main-content"
  - button "Закрыть навигацию" [ref=f5e5] [cursor=pointer]
  - dialog "Навигация кухни" [ref=f5e6]:
    - button "Закрыть навигацию" [active] [ref=f5e7] [cursor=pointer]
    - link "флагман КОНТРОЛЬ КУХНИ" [ref=f5e11] [cursor=pointer]:
      - /url: /overview
      - generic [ref=f5e16]:
        - text: флагман
        - generic [ref=f5e17]: КОНТРОЛЬ КУХНИ
    - generic [ref=f5e25]:
      - text: Ресторан «Флагман»
      - generic [ref=f5e26]: Операционный кабинет
    - navigation "Основная навигация" [ref=f5e28]:
      - paragraph [ref=f5e29]: Каждый день
      - button "Склад и партии" [ref=f5e30] [cursor=pointer]
      - button "Заказы" [ref=f5e42] [cursor=pointer]
      - paragraph [ref=f5e50]: Контроль кухни
      - button "Сроки годности" [ref=f5e51] [cursor=pointer]
      - paragraph [ref=f5e56]: Планирование
    - generic [ref=f5e57]:
      - generic [ref=f5e62]:
        - text: Склад под контролем
        - generic [ref=f5e63]: Учёт по партиям · FEFO
      - button "Менеджер 203aa9c9-5d8d-4e05-916a-818c9ce456e2 Настройки ресторана" [ref=f5e64] [cursor=pointer]:
        - generic [ref=f5e69]:
          - text: Менеджер 203aa9c9-5d8d-4e05-916a-818c9ce456e2
          - generic [ref=f5e70]: Настройки ресторана
  - generic [ref=f5e71]:
    - banner [ref=f5e72]:
      - button "Открыть навигацию" [expanded] [ref=f5e74] [cursor=pointer]
      - generic [ref=f5e76]:
        - generic [ref=f5e77]:
          - generic [ref=f5e78]:
            - generic [ref=f5e79]: Демо-режим
            - generic [ref=f5e80]: Время демо (+6 ч)
          - time [ref=f5e81]:
            - generic [ref=f5e82]: 16 окт. 2026 г.
            - generic [ref=f5e83]: 02:07:59
        - button "Уведомления" [ref=f5e85] [cursor=pointer]
        - button "Выйти" [ref=f5e90] [cursor=pointer]
    - main [ref=f5e94]:
      - generic [ref=f5e95]:
        - generic [ref=f5e96]:
          - generic [ref=f5e97]:
            - paragraph [ref=f5e98]: ОПЕРАЦИОННЫЙ КОНТРОЛЬ
            - heading "Склад и партии" [level=1] [ref=f5e99]
            - paragraph [ref=f5e100]: Остатки по продуктам и партиям. Сроки, которым нужно внимание.
          - button "Принять поставку" [ref=f5e102] [cursor=pointer]
        - generic [ref=f5e107]:
          - button "Партии 5" [ref=f5e108] [cursor=pointer]
          - button "Продукты 10" [ref=f5e109] [cursor=pointer]
          - button "Журнал движений" [ref=f5e110] [cursor=pointer]
        - generic [ref=f5e111]:
          - textbox "Продукт, партия или ID поставки…" [ref=f5e116]
          - button "Добавить продукт" [ref=f5e118] [cursor=pointer]
        - generic [ref=f5e120]:
          - generic [ref=f5e122]:
            - text: Порядок партий
            - combobox "Порядок партий" [ref=f5e124] [cursor=pointer]: Последние поступления сверху
          - generic [ref=f5e125]:
            - button "Все партии" [ref=f5e126] [cursor=pointer]
            - button "Истекают скоро" [ref=f5e127] [cursor=pointer]
            - button "Свежие" [ref=f5e128] [cursor=pointer]
            - button "Просрочены" [ref=f5e129] [cursor=pointer]
            - button "Израсходованы" [ref=f5e130] [cursor=pointer]
            - button "Списаны" [ref=f5e131] [cursor=pointer]
          - table [ref=f5e133]:
            - rowgroup [ref=f5e134]:
              - row [ref=f5e135]:
                - columnheader "Продукт / партия" [ref=f5e136]
                - columnheader "Поставка" [ref=f5e137]
                - columnheader "Остаток / принято" [ref=f5e138]
                - columnheader "Срок годности" [ref=f5e139]
                - columnheader "Расчёт срока" [ref=f5e140]
                - columnheader "Статус" [ref=f5e141]
            - rowgroup [ref=f5e142]:
              - row [ref=f5e143]:
                - cell [ref=f5e144]:
                  - strong [ref=f5e145]: Томаты b7ad2804
                  - button "#0FF1D133" [ref=f5e146] [cursor=pointer]
                - cell "TEST 16 окт., 00:07" [ref=f5e147]:
                  - text: TEST
                  - generic [ref=f5e148]: 16 окт., 00:07
                - cell "1 000 г из 1 500 г" [ref=f5e149]:
                  - strong [ref=f5e150]: 1 000 г
                  - generic [ref=f5e151]: из 1 500 г
                - cell "16 окт., 01:07 Срок истёк" [ref=f5e152]:
                  - text: 16 окт., 01:07
                  - generic [ref=f5e153]: Срок истёк
                - cell [ref=f5e154]:
                  - strong [ref=f5e155]: Явная дата
                - cell "Просрочена Списать товар" [ref=f5e156]:
                  - generic [ref=f5e157]: Просрочена
                  - button "Списать товар" [ref=f5e159] [cursor=pointer]
              - row [ref=f5e160]:
                - cell [ref=f5e161]:
                  - strong [ref=f5e162]: Томаты 54112da0
                  - button "#362F15CB" [ref=f5e163] [cursor=pointer]
                - cell "TEST 15 окт., 22:07" [ref=f5e164]:
                  - text: TEST
                  - generic [ref=f5e165]: 15 окт., 22:07
                - cell "1 000 г из 1 500 г" [ref=f5e166]:
                  - strong [ref=f5e167]: 1 000 г
                  - generic [ref=f5e168]: из 1 500 г
                - cell "15 окт., 23:07 Срок истёк" [ref=f5e169]:
                  - text: 15 окт., 23:07
                  - generic [ref=f5e170]: Срок истёк
                - cell [ref=f5e171]:
                  - strong [ref=f5e172]: Явная дата
                - cell "Просрочена Списать товар" [ref=f5e173]:
                  - generic [ref=f5e174]: Просрочена
                  - button "Списать товар" [ref=f5e176] [cursor=pointer]
              - row [ref=f5e177]:
                - cell [ref=f5e178]:
                  - strong [ref=f5e179]: Томаты de04618e
                  - button "#8F8A7BF9" [ref=f5e180] [cursor=pointer]
                - cell "TEST 15 окт., 22:06" [ref=f5e181]:
                  - text: TEST
                  - generic [ref=f5e182]: 15 окт., 22:06
                - cell "1 000 г из 1 500 г" [ref=f5e183]:
                  - strong [ref=f5e184]: 1 000 г
                  - generic [ref=f5e185]: из 1 500 г
                - cell "15 окт., 23:06 Срок истёк" [ref=f5e186]:
                  - text: 15 окт., 23:06
                  - generic [ref=f5e187]: Срок истёк
                - cell [ref=f5e188]:
                  - strong [ref=f5e189]: Явная дата
                - cell "Просрочена Списать товар" [ref=f5e190]:
                  - generic [ref=f5e191]: Просрочена
                  - button "Списать товар" [ref=f5e193] [cursor=pointer]
              - row [ref=f5e194]:
                - cell [ref=f5e195]:
                  - strong [ref=f5e196]: Томаты 90c25d77
                  - button "#BE9B4AD3" [ref=f5e197] [cursor=pointer]
                - cell "TEST 15 окт., 22:06" [ref=f5e198]:
                  - text: TEST
                  - generic [ref=f5e199]: 15 окт., 22:06
                - cell "0 г из 500 г" [ref=f5e200]:
                  - strong [ref=f5e201]: 0 г
                  - generic [ref=f5e202]: из 500 г
                - cell "15 окт., 23:06 Срок истёк" [ref=f5e203]:
                  - text: 15 окт., 23:06
                  - generic [ref=f5e204]: Срок истёк
                - cell [ref=f5e205]:
                  - strong [ref=f5e206]: Явная дата
                - cell "Израсходована" [ref=f5e207]
              - row [ref=f5e209]:
                - cell [ref=f5e210]:
                  - strong [ref=f5e211]: Томаты 5bbd0b87
                  - button "#C7E2C8BD" [ref=f5e212] [cursor=pointer]
                - cell "TEST 15 окт., 20:05" [ref=f5e213]:
                  - text: TEST
                  - generic [ref=f5e214]: 15 окт., 20:05
                - cell "1 000 г из 1 500 г" [ref=f5e215]:
                  - strong [ref=f5e216]: 1 000 г
                  - generic [ref=f5e217]: из 1 500 г
                - cell "15 окт., 21:05 Срок истёк" [ref=f5e218]:
                  - text: 15 окт., 21:05
                  - generic [ref=f5e219]: Срок истёк
                - cell [ref=f5e220]:
                  - strong [ref=f5e221]: Явная дата
                - cell "Просрочена Списать товар" [ref=f5e222]:
                  - generic [ref=f5e223]: Просрочена
                  - button "Списать товар" [ref=f5e225] [cursor=pointer]
          - paragraph [ref=f5e226]: Просроченные партии исключены из пригодного запаса. Физический остаток сохраняется до ручного списания менеджером. Любую партию с остатком можно списать с указанием причины.
          - generic [ref=f5e227]:
            - generic [ref=f5e228]: Найдено 5 партий по всему складу
            - generic [ref=f5e229]:
              - button "Предыдущая страница партий" [disabled] [ref=f5e230]
              - generic [ref=f5e233]: "1"
              - button "Следующая страница партий" [disabled] [ref=f5e234]
        - generic [ref=f5e237]: Флагман · каждый продукт имеет значение
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
  36 |  await loginPage(page,login,password,'/overview');await expect(page).toHaveURL(/\/stock(?:\?|$)/);
  37 |  const nav=page.getByRole('navigation');
  38 |  await expect(nav.getByRole('button')).toHaveCount(3);
  39 |  await expect(nav.getByRole('button',{name:'Сроки годности',exact:true})).toBeVisible();
  40 |  await expect(nav.getByRole('button',{name:'Обзор кухни',exact:true})).toHaveCount(0);
  41 |  await page.goto('/event-log');await expect(page).toHaveURL(/\/stock(?:\?|$)/);
  42 |  await page.goto('/analytics');await expect(page).toHaveURL(/\/stock(?:\?|$)/);
  43 |  await page.reload();await expect(nav.getByRole('button')).toHaveCount(3);
> 44 |  for(const width of [390,280]){await page.setViewportSize({width,height:850});await page.getByRole('button',{name:'Открыть навигацию',exact:true}).click();await expect(nav.getByRole('button',{name:'Склад и партии',exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть навигацию',exact:true}).click();}
     |                                                                                                                                                                                                                                                                                                                        ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Закрыть навигацию', exact: true }) resolved to 2 elements:
  45 | });
  46 | 
```