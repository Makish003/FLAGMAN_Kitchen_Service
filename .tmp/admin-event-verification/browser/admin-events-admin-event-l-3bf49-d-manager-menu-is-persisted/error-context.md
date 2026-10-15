# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-events.spec.ts >> admin event log streams workflow events and manager menu is persisted
- Location: e2e\admin-events.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeChecked() failed

Locator: getByLabel('Склад и партии', { exact: true })
Expected: checked
Error: strict mode violation: getByLabel('Склад и партии', { exact: true }) resolved to 2 elements:
    1) <button class="" aria-label="Склад и партии">…</button> aka getByRole('button', { name: 'Склад и партии' })
    2) <input checked type="checkbox"/> aka getByRole('checkbox', { name: 'Склад и партии' })

Call log:
  - Expect "toBeChecked" getByLabel('Склад и партии', { exact: true }) with timeout 5000ms
  - waiting for getByLabel('Склад и партии', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - link "Перейти к содержимому" [ref=f1e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary "Навигация кухни" [ref=f1e5]:
    - link "флагман КОНТРОЛЬ КУХНИ" [ref=f1e6] [cursor=pointer]:
      - /url: /overview
      - generic [ref=f1e11]:
        - text: флагман
        - generic [ref=f1e12]: КОНТРОЛЬ КУХНИ
    - generic [ref=f1e20]:
      - text: Ресторан «Флагман»
      - generic [ref=f1e21]: Операционный кабинет
    - navigation "Основная навигация" [ref=f1e23]:
      - paragraph [ref=f1e24]: Каждый день
      - button "Обзор кухни" [ref=f1e25] [cursor=pointer]
      - button "Склад и партии" [ref=f1e32] [cursor=pointer]
      - button "Меню и рецептуры" [ref=f1e44] [cursor=pointer]
      - button "Заказы" [ref=f1e51] [cursor=pointer]
      - button "Поставки" [ref=f1e59] [cursor=pointer]
      - paragraph [ref=f1e66]: Контроль кухни
      - button "Сроки годности" [ref=f1e67] [cursor=pointer]
      - button "Стоп-лист" [ref=f1e72] [cursor=pointer]:
        - generic [ref=f1e76]: "1"
      - button "Горячие предложения" [ref=f1e77] [cursor=pointer]
      - paragraph [ref=f1e81]: Планирование
      - button "Закупки" [ref=f1e82] [cursor=pointer]
      - button "Заявки поставщикам" [ref=f1e89] [cursor=pointer]
      - button "Прогноз" [ref=f1e96] [cursor=pointer]
      - button "Аналитика и закупки" [ref=f1e101] [cursor=pointer]
      - button "Аккаунты" [ref=f1e105] [cursor=pointer]
      - button "Журнал событий" [ref=f1e110] [cursor=pointer]
      - button "Демонстрация" [ref=f1e114] [cursor=pointer]
    - generic [ref=f1e117]:
      - generic [ref=f1e122]:
        - text: Склад под контролем
        - generic [ref=f1e123]: Учёт по партиям · FEFO
      - button "Администратор Настройки ресторана" [ref=f1e124] [cursor=pointer]:
        - generic [ref=f1e129]:
          - text: Администратор
          - generic [ref=f1e130]: Настройки ресторана
  - generic [ref=f1e131]:
    - banner [ref=f1e132]:
      - generic [ref=f1e134]:
        - text: Рабочее пространство
        - strong [ref=f1e137]: Аккаунты
      - generic [ref=f1e138]:
        - generic [ref=f1e139]:
          - generic [ref=f1e140]:
            - generic [ref=f1e141]: Демо-режим
            - generic [ref=f1e142]: Время демо (+2 ч)
          - time [ref=f1e143]:
            - generic [ref=f1e144]: 15 окт. 2026 г.
            - generic [ref=f1e145]: 22:05:54
            - generic [ref=f1e146]: Europe/Moscow
        - button "Уведомления" [ref=f1e148] [cursor=pointer]
        - button "Выйти" [ref=f1e153] [cursor=pointer]
    - main [ref=f1e157]:
      - generic [ref=f1e158]:
        - generic [ref=f1e160]:
          - paragraph [ref=f1e161]: ОПЕРАЦИОННЫЙ КОНТРОЛЬ
          - heading "Аккаунты" [level=1] [ref=f1e162]
          - paragraph [ref=f1e163]: Аккаунты, API-ключи и видимость страниц для менеджеров.
        - generic [ref=f1e164]: "Проверено 20:05:55 · #27"
        - generic [ref=f1e166]:
          - generic [ref=f1e168]:
            - heading "Аккаунты и API-ключи" [level=2] [ref=f1e169]
            - paragraph [ref=f1e173]: Управляйте доступом сотрудников и поставщиков
          - generic [ref=f1e174]:
            - generic [ref=f1e175]:
              - generic [ref=f1e176]:
                - text: Логин
                - textbox "Логин" [ref=f1e177]: limited-a3518b57-4831-486d-93ef-94e6304319ba
              - generic [ref=f1e178]:
                - text: Имя
                - textbox "Имя" [ref=f1e179]: Менеджер с меню
              - generic [ref=f1e180]:
                - text: Роль
                - combobox "Роль" [ref=f1e182] [cursor=pointer]: Менеджер
              - generic [ref=f1e183]:
                - text: Пароль
                - textbox "Пароль" [ref=f1e184]
            - group "Страницы в меню менеджера" [ref=f1e185]:
              - paragraph [ref=f1e187]: Выберите хотя бы одну страницу. Настройка управляет навигацией; рабочие права роли сохраняются.
              - generic [ref=f1e188]:
                - generic [ref=f1e189]:
                  - checkbox "Обзор кухни" [ref=f1e190]
                  - text: Обзор кухни
                - generic [ref=f1e191]:
                  - checkbox "Склад и партии" [checked] [ref=f1e192]
                  - text: Склад и партии
                - generic [ref=f1e193]:
                  - checkbox "Поставки" [ref=f1e194]
                  - text: Поставки
                - generic [ref=f1e195]:
                  - checkbox "Меню и рецептуры" [ref=f1e196]
                  - text: Меню и рецептуры
                - generic [ref=f1e197]:
                  - checkbox "Заказы" [checked] [ref=f1e198]
                  - text: Заказы
                - generic [ref=f1e199]:
                  - checkbox "Стоп-лист" [ref=f1e200]
                  - text: Стоп-лист
                - generic [ref=f1e201]:
                  - checkbox "Горячие предложения" [ref=f1e202]
                  - text: Горячие предложения
                - generic [ref=f1e203]:
                  - checkbox "Аналитика и закупки" [ref=f1e204]
                  - text: Аналитика и закупки
                - generic [ref=f1e205]:
                  - checkbox "Сроки годности" [ref=f1e206]
                  - text: Сроки годности
                - generic [ref=f1e207]:
                  - checkbox "Закупки" [ref=f1e208]
                  - text: Закупки
                - generic [ref=f1e209]:
                  - checkbox "Прогноз" [ref=f1e210]
                  - text: Прогноз
                - generic [ref=f1e211]:
                  - checkbox "Заявки поставщикам" [ref=f1e212]
                  - text: Заявки поставщикам
            - generic [ref=f1e213]:
              - checkbox "Активен" [checked] [ref=f1e214]
              - text: Активен
            - button "Сохранить аккаунт" [ref=f1e215] [cursor=pointer]
            - button "Отмена редактирования" [ref=f1e216] [cursor=pointer]
          - article [ref=f1e217]:
            - heading "Администратор" [level=3] [ref=f1e218]
            - paragraph [ref=f1e219]: manager · Администратор · Активен
            - button "Изменить аккаунт" [ref=f1e220] [cursor=pointer]
            - button "Выдать API-ключ" [ref=f1e221] [cursor=pointer]
            - button "Просмотреть ключи" [ref=f1e222] [cursor=pointer]
          - article [ref=f1e223]:
            - heading "supplier-d7d27507" [level=3] [ref=f1e224]
            - paragraph [ref=f1e225]: supplier-d7d27507 · Поставщик · Активен
            - button "Изменить аккаунт" [ref=f1e226] [cursor=pointer]
            - button "Выдать API-ключ" [ref=f1e227] [cursor=pointer]
            - button "Просмотреть ключи" [ref=f1e228] [cursor=pointer]
          - article [ref=f1e229]:
            - heading "supplier-28445309" [level=3] [ref=f1e230]
            - paragraph [ref=f1e231]: supplier-28445309 · Поставщик · Активен
            - button "Изменить аккаунт" [ref=f1e232] [cursor=pointer]
            - button "Выдать API-ключ" [ref=f1e233] [cursor=pointer]
            - button "Просмотреть ключи" [ref=f1e234] [cursor=pointer]
          - article [ref=f1e235]:
            - heading "waiter-b825c5d1" [level=3] [ref=f1e236]
            - paragraph [ref=f1e237]: waiter-b825c5d1 · Официант · Активен
            - button "Изменить аккаунт" [ref=f1e238] [cursor=pointer]
            - button "Выдать API-ключ" [ref=f1e239] [cursor=pointer]
            - button "Просмотреть ключи" [ref=f1e240] [cursor=pointer]
          - article [ref=f1e241]:
            - heading "cook-9786c802" [level=3] [ref=f1e242]
            - paragraph [ref=f1e243]: cook-9786c802 · Повар · Активен
            - button "Изменить аккаунт" [ref=f1e244] [cursor=pointer]
            - button "Выдать API-ключ" [ref=f1e245] [cursor=pointer]
            - button "Просмотреть ключи" [ref=f1e246] [cursor=pointer]
          - article [ref=f1e247]:
            - heading "Менеджер с меню" [level=3] [ref=f1e248]
            - paragraph [ref=f1e249]: limited-a3518b57-4831-486d-93ef-94e6304319ba · Менеджер · Активен
            - button "Изменить аккаунт" [active] [ref=f1e250] [cursor=pointer]
            - button "Выдать API-ключ" [ref=f1e251] [cursor=pointer]
            - button "Просмотреть ключи" [ref=f1e252] [cursor=pointer]
        - generic [ref=f1e253]:
          - generic [ref=f1e254]: Флагман · каждый продукт имеет значение
          - generic [ref=f1e258]: Единый склад · точные остатки · контроль сроков
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
  16 |  await search.fill(order.id);await expect(page.getByRole('cell',{name:'Заказ готов к выдаче',exact:false})).toBeVisible();
  17 |  // This event is emitted after the log page has subscribed to updates.
  18 |  expect((await command(page.request,f.waiter.token,'/order-requests/'+order.id+'/serve',{expectedVersion:2})).ok()).toBeTruthy();
  19 |  await expect(page.getByRole('cell',{name:'Заказ выдан гостю',exact:false})).toBeVisible();
  20 |  await search.fill(delivery.deliveryId);await expect(page.getByText('Поставка принята на склад',{exact:true})).toBeVisible();
  21 |  await page.request.post('/api/demo/time',{headers,data:{hours:2}});
  22 |  await search.fill(f.product.slice(2));await expect(page.getByText('Истёк срок годности продукта',{exact:true})).toBeVisible();
  23 |  await page.goto('/accounts');
  24 |  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Менеджер с меню',exact:true})});
  25 |  await card.getByRole('button',{name:'Изменить аккаунт'}).click();
> 26 |  await expect(page.getByLabel('Склад и партии',{exact:true})).toBeChecked();
     |                                                               ^ Error: expect(locator).toBeChecked() failed
  27 |  await expect(page.getByLabel('Обзор кухни',{exact:true})).not.toBeChecked();
  28 |  await page.getByLabel('Сроки годности',{exact:true}).check();
  29 |  await page.getByRole('button',{name:'Сохранить аккаунт'}).click();
  30 |  await expect(page.getByRole('button',{name:'Создать аккаунт',exact:true})).toBeVisible();
  31 |  await loginPage(page,login,password,'/overview');await expect(page).toHaveURL(/\/stock$/);
  32 |  const nav=page.getByRole('navigation');
  33 |  await expect(nav.getByRole('button')).toHaveCount(3);
  34 |  await expect(nav.getByRole('button',{name:'Сроки годности',exact:true})).toBeVisible();
  35 |  await expect(nav.getByRole('button',{name:'Обзор кухни',exact:true})).toHaveCount(0);
  36 |  await page.goto('/event-log');await expect(page).toHaveURL(/\/stock$/);
  37 |  await page.goto('/analytics');await expect(page).toHaveURL(/\/stock$/);
  38 |  await page.reload();await expect(nav.getByRole('button')).toHaveCount(3);
  39 |  for(const width of [390,280]){await page.setViewportSize({width,height:850});await page.getByRole('button',{name:'Открыть навигацию',exact:true}).click();await expect(nav.getByRole('button',{name:'Склад и партии',exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть навигацию',exact:true}).click();}
  40 | });
  41 | 
```