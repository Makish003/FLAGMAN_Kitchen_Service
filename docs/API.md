# API: роли и внешние заявки

В журнале партий `GET /history/batches` параметр `sort=received_newest` сортирует по времени поступления, последние сверху, до пагинации. Этот порядок выбран по умолчанию в разделе «Склад / Партии». `sort=oldest|newest` сортирует по сроку годности по возрастанию или убыванию, включая просроченные даты.

Базовый путь `/api`, JSON camelCase. Актуальный контракт после перехода на заявки. Прежние `/orders` и `/deliveries` больше не проводят складские операции напрямую.

Полный журнал `GET /history/orders` доступен только manager. Параметр `status=all|accepted|rejected` фильтрует записи и total до пагинации; `sort=newest|oldest`, по умолчанию новые первыми. Кабинет менеджера отдельно показывает состояния заявок и складской журнал завершённых/отклонённых попыток списания.

## Авторизация

`POST /login {"login":"manager","password":"..."}` устанавливает HttpOnly cookie. Первый manager создаётся один раз из `FLAGMAN_PASSWORD` (минимум 10 символов). После bootstrap переменная не требуется для запуска и вход только по общему паролю запрещён. `/session` возвращает `{id,name,role,timezone,demo}`. Регистр символов в имени маршрута и схеме Bearer не отменяет проверки роли. Лимит входа: 10/IP/минуту, `429` и Retry-After. Анонимный защищённый запрос: `401`.

Cookie-команды требуют `X-Requested-With: Flagman`, проверяется Origin. Внешний API использует `Authorization: Bearer <token>` без cookie/CSRF-заголовка. Роль, active и sessionVersion проверяются по БД; изменение аккаунта инвалидирует прежние cookie и ключи. `/events` прекращает поток при отзыве доступа. Ключи хранятся в виде SHA-256 hash, пароли через ASP.NET PasswordHasher. Ответ выдачи ключа показывается один раз; не сохраняйте его в журналах.

## Команды и повторы

Создание/ответ/решение/списание требуют `Idempotency-Key` (1–100 символов). Область: стабильный actorId + операция. Повтор того же тела возвращает первоначальный документ; другое тело с тем же ключом даёт `409`. Решения требуют `expectedVersion`; retry восстанавливается до проверки версии. Все изменения документа, партии, движения, audit, события и результата фиксируются в одной SQLite BEGIN IMMEDIATE.

Recovery: `GET /operations/{scope}/{key}`. Scope: `procurement`, `procurement-response`, `procurement-cancel`, `delivery`, `delivery-acceptance`, `order`, `order-decision`, `order-serve`, `write-off`. Другой аккаунт не видит результат (`404` при допустимой роли). После timeout сначала recovery, затем исходный запрос с прежним key. Legacy scopes теперь возвращают DeliveryRequest/OrderRequest, а не складские Delivery/Order.

## Закупка 10 → 8 → 7 кг

Менеджер отправляет `POST /procurement-requests`:

```json
{"supplierId":"ACCOUNT_ID","items":[{"id":"t","productId":"tomato","quantity":10,"unit":"kg"},{"id":"c","productId":"cream","quantity":5,"unit":"l"}],"comment":"Для смены"}
```

Ответ `201`, статус submitted, version=1. Количества исходного заказа неизменны. Поставщик отвечает `POST /procurement-requests/{id}/supplier-response`:

```json
{"expectedVersion":1,"items":[{"lineId":"t","confirmedQuantity":8,"expiresAt":"2027-01-01T10:00:00Z","reason":"Подтверждено меньше"},{"lineId":"c","confirmedQuantity":0,"reason":"Нет в наличии"}]}
```

Каждая строка обязательна ровно один раз. При уменьшении/отказе нужна причина. Ответ: `{procurementRequest,deliveryRequestId}`; partially_accepted, version=2, связанная поставка submitted. Склад пока не меняется. Доступны expiresAt или expiryDate (конец ресторанного дня), manufacturedAt/shelfLifeHours; положительное количество требует срока. Вычисленный абсолютный срок сохраняется; приёмка не отсчитывает хранение заново.

Самостоятельная поставка: `POST /delivery-requests` или `/deliveries`, `{number,items:[{productId,quantity,unit,expiresAt,...}]}`, 201 submitted. Автор берётся из principal, supplierId из тела не выбирает другого владельца. Старые id/createdAt/receivedAt не являются складской проводкой: фактический приход создаёт только менеджер при приёмке.

Менеджер вызывает `POST /delivery-requests/{id}/acceptance`:

```json
{"expectedVersion":1,"items":[{"lineId":"DELIVERY_LINE_ID","acceptedQuantity":7,"reason":"1 кг брак"}]}
```

Все строки обязательны. Количество 0..заявленного; проверенный срок `verifiedExpiresAt` необязателен, исходный сохраняется. Срок <=now нельзя принять. Появляются одна Delivery, Batch=7000 g и receipt; request=partially_accepted с deliveryId. Полный отказ (все нули с причинами) не создаёт прихода. Два лота одного продукта сохраняются отдельно. Ответ и приёмка окончательные. Закупку submitted можно отменить `/cancel {expectedVersion}`.

## Заказы, предложения, списание

Официант/manager отправляет `POST /order-requests` или `/orders {items:[{dishId,portions}]}`: 201 submitted: продукты атомарно резервируются по партиям FEFO, физического расхода пока нет. Общие ингредиенты всех строк проверяются вместе; нехватка свободного остатка даёт 409 без частичного резерва. Резерв исключается из доступных порций, предложений и планирования, сохраняется после перезапуска и освобождается при отказе. Snapshot продукта содержит physical, usable (свободный пригодный остаток), reserved. Стоп-лист, архив и неверные порции запрещены. Повар (cook) вызывает `POST /order-requests/{id}/decision {expectedVersion,decision:"accept"|"reject",reasonCode?,productIds?,reason?}`. Рецепт изменился/архивирован: 409, заявка остаётся pending. Подтверждение переводит заявку в `ready`, фиксирует DecisionActorId/DecidedAt и повторно проверяет FEFO/сроки; shortage окончательно отклоняет без частичного расхода. Ручной отказ требует reasonCode: expired_product (просроченный продукт), product_shortage (нехватка), spoiled_product (испорчен), equipment_failure (оборудование), other (другое). Для первых трёх обязателен непустой productIds без повторов: только продукты состава заказа. Для equipment_failure/other обязателен непустой reason до 500 символов, productIds не передаётся. Неизвестная категория, чужой продукт и незаполненные поля дают 400, сохраняя заказ и резерв. Отказ сохраняет структурированный rejection {code,products:[{id,name}],comment} и читаемый reason для всех участников; названия продуктов сохраняются в истории. Поле rejectionProducts [{id,name}] в представлении заказа доступно повару для выбора, без количеств рецептуры. Отказ не создаёт ложный дефицит. Pending не входит в продажи/спрос/потери. `POST /order-requests/{id}/serve {expectedVersion}` доступен только автору заказа (waiter или manager), только из ready: статус `served`, ServedById/ServedAt, версия +1, без складских движений. Повтор с прежним ключом возвращает прежний результат; другой ключ или устаревшая версия даёт 409. Старые accepted остаются историей и не превращаются в ready. При запуске старые submitted без поля Reservations получают резерв имеющихся продуктов, начиная с самых ранних. Ранее допущенный дефицит не создаёт фиктивный запас: при готовности повар получит отказ по нехватке, если склад так и не пополнен.

`PUT /dishes/{id}/offer {visibility:"auto"|"show"|"hide",emphasized,waiterNote,expectedVersion}`: первая версия ожидает 0. Пояснение <=240 символов. Акцент независим от доступности; архив не публикуется. `/waiter/offers` не содержит рецептов/цен.

`POST /batches/{id}/write-off {"reason":"Повреждена упаковка"}` с ключом, manager/admin: полный положительный остаток любой партии, включая свежую; результат `{batchId,quantity,movementId}`. Причина обязательна: после удаления пробелов по краям 1–500 символов; иначе 400. Уже пустая партия с новым key: 409. Старый key с тем же составом возвращает прежний результат; другая причина с прежним ключом даёт 409. Movement write_off содержит actorId и указанную reason. Резерв списанной партии снимается; заявки остаются в очереди, при готовности доступность проверяется заново. Истечение само не обнуляет остаток; physical включает, usable исключает. Статусы fresh/warning/expired/consumed/written_off. Старые expiry считаются историческими списаниями, остатки не восстанавливаются.

## Полная карта доступа

Все защищённые маршруты допускают cookie и bearer. Фильтр владельца выполняется до count/page. Manager видит все документы. Supplier/waiter/cook не получают manager snapshot или складскую историю.

| Метод/маршрут | Роль | Ownership/проекция |
|---|---|---|
| GET live, health, ready; POST login | anonymous | Состояние процесса/вход |
| GET session; POST logout; GET events | любая активная | Собственный principal; SSE только revision |
| GET snapshot, analytics, ops/status | manager | Полный ресторан |
| POST planning, scenario, orders/preview, deliveries/preview | manager | Только расчёт, без движений |
| POST products, dishes; POST archive/{products\|dishes}/{id}; PUT settings | manager | Каталог/настройки ресторана |
| GET history/{batches\|deliveries\|orders\|movements\|audit\|generatorEvents}; GET details/{batches\|deliveries\|orders}/{id} | manager | Складская история |
| GET accounts; POST accounts; PUT accounts/{id}; GET/POST accounts/{id}/keys; DELETE keys/{id} | manager | Администрирование; последний manager защищён |
| POST procurement-requests; POST procurement-requests/{id}/cancel | manager | Адресат должен быть активным supplier |
| GET procurement-requests; GET supplier/procurement-requests; GET procurement-requests/{id} | manager/supplier | Supplier только supplierId=actorId |
| POST procurement-requests/{id}/supplier-response | supplier | Только адресованная закупка |
| POST delivery-requests, deliveries | manager/supplier | AuthorId=actorId; создаётся pending |
| GET delivery-requests; GET supplier/delivery-requests; GET delivery-requests/{id} | manager/supplier | Supplier только authorId=actorId |
| POST delivery-requests/{id}/acceptance | manager | Актуальный документ внутри транзакции |
| POST order-requests, orders | manager/waiter | AuthorId=actorId; создаётся pending |
| GET order-requests; GET waiter/order-requests; GET cook/order-requests; GET order-requests/{id} | manager/waiter/cook | Waiter только authorId=actorId; списки cook содержат только заказы за сегодня по часовому поясу ресторана и демо-времени, независимо от адреса списка. Состав с названиями и автором, без рецептов/цен. Фильтр status: all/submitted/ready/served/rejected/accepted/cancelled; применяется до пагинации. Сначала submitted, ready (старые первыми), затем served, rejected, accepted, cancelled (новые первыми внутри статуса). Детали доступны по ID |
| POST order-requests/{id}/decision | cook | Готовность/отказ, актуальная рецептура/FEFO |
| POST order-requests/{id}/serve | waiter/manager | Только собственный ready-заказ, без повторного расхода |
| GET supplier/catalog | manager/supplier | Активные ID/name/unit |
| GET waiter/menu, waiter/offers | manager/waiter | Названия/категория/порции без цен и рецептов |
| PUT dishes/{id}/offer; GET offers/overrides | manager | Управление публикацией |
| POST batches/{id}/write-off | manager/admin | Любой положительный остаток, обязательная причина |
| GET operations/{scope}/{key} | роль scope | Только ключ actorId; без legacy обхода |
| POST demo/seed, demo/time, generator/start, generator/stop; GET generator | manager | Запись демо только FLAGMAN_DEMO=true |

Списки заявок: `{items,total,page,size}`, page>=1, size=1..100. Ошибки: 400 валидация, 401 вход, 403 роль/CSRF, 404 чужая/несуществующая запись, 409 версия/содержимое ключа/состояние, 429 вход, 503 занятый склад (повторить с тем же key).

Аналитика сохраняет restaurant-calendar fromDate/toDate, timestamp from/to и произвольные `days=YYYY-MM-DD,...` внутри периода. Рейтинг блюд считает окончательные shortage orders один раз; стоимость списаний и цена раздельно по валютам. priceCoverage.kind=expiry объединяет old expiry + new write_off. Потери считаются по дате команды, не по времени истечения.

SSE: `event: sync`, `data: {revision}`; затем `id: N`, `event: change`, `data: {revision:N}`. События не содержат чужие бизнес-данные. Клиент обновляет разрешённую проекцию; Last-Event-ID поддерживается. Истечение меняет сохранённую сигнатуру warning/expired и revision только при изменении, включая старт сервера.

### Журнал администратора и меню менеджеров

- `GET /api/history/eventLog?page=1&size=50&q=...&status=all` — только администратор. Постоянный журнал, новые записи сверху; поиск по названию продукта, номеру поставки, ID и коду события. Категории: delivery, order, batch, procurement, account, key, session, catalog, recipe, offer, settings, generator, time. События содержат id, type, at, entityId, actorId, summary. SSE сообщает об обновлениях; очистка технического потока events не удаляет eventLog. При первом запуске копируются сохранившиеся события из events; ранее очищенные события восстановить нельзя.
- `visiblePages` в запросах создания/изменения аккаунта и ответах аккаунтов/сессии — список страниц менеджера. null означает все обычные страницы; непустой список задаёт индивидуальное меню. Пустые и неизвестные списки отклоняются, административные страницы выбрать нельзя. Настройка управляет меню и навигацией клиента; API сохраняет права роли менеджера. Сохранение аккаунта завершает прежние сессии и отзывает старые ключи через sessionVersion, как и раньше.

Поле summary журнала содержит снимок подробностей на момент события: состав и количества, принятое/подтверждённое количество, причины отказа или списания, сроки годности. Единицы и числа выводятся по-русски. Снимки не меняются при дальнейшей обработке документов и входят в поиск q. detailsVersion=1 отмечает заполненное описание. При запуске приложения старые события дополняются из связанных документов с пометкой «По сохранённому документу»; при отсутствии исходных данных показывается явное пояснение. Обновляются обе копии записи (eventLog и сохранившийся events), без изменения складских остатков и revision. Пароли, хеши и содержимое API-ключей в summary не записываются.
