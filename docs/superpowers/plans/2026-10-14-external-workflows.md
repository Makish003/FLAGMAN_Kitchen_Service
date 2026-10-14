# Роли, внешние заявки и ручное списание — план реализации агентом

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task; use superpowers:subagent-driven-development only if the user selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать цепочку менеджер → поставщик → приёмка, самостоятельные внешние поставки, заказы официанта с подтверждением, управляемые предложения и ручное списание просрочки.

**Architecture:** Расширить существующий ASP.NET API и SQLite отдельными документами заявок; складские `Delivery`, `Order`, `Batch` и `Movement` появляются только при финализации. Общие серверные проверки ролей, владельца, версии и идемпотентности используются страницами и bearer API. Не выделять отдельный сервис и не переносить склад в другую БД.

**Tech Stack:** ASP.NET Core/.NET 8, Microsoft.Data.Sqlite/WAL, React 19, TypeScript, SCSS, существующий консольный тестовый runner и Playwright.

**Spec:** [2026-10-14-external-workflows-design.md](../specs/2026-10-14-external-workflows-design.md). Прочитать перед выполнением; функциональные ограничения зафиксированы там.

## Global Constraints

- Сохранить текущие незакоммиченные изменения; не reset/clean и не удалять рабочие базы. Не включать чужие изменения в коммиты.
- SQLite WAL и атомарные транзакции сохраняются. Изменение документа, складское движение, audit, событие и результат идемпотентности фиксируются вместе.
- Все команды создания и финализации требуют `Idempotency-Key`; область ключа включает стабильный ID аккаунта и тип операции.
- Решения требуют `expectedVersion`; устаревшее решение — `409`.
- Монитор меняет уведомления и доступность, но не количество и не движения.
- Pending-заявки не резервируют склад; частичное подтверждение заказа, замены продуктов и дробные отгрузки одной закупки не включены.
- Время — ресторанная зона; не пересчитывать срок хранения заново при поздней приёмке.
- Миграция без удаления данных, с согласованной SQLite backup-копией. Демо и тесты используют отдельную БД.
- Серверная авторизация обязательна для каждого API, истории, recovery и SSE; скрытая кнопка не является защитой.
- Локальный PASS не означает проверку публичного HTTPS или целевого хоста.

## Review Focus

1. Поставщик меняет ID в URL или теле: чужие заявки/ключи недоступны, авторство нельзя подменить — задача 2.
2. Ответ HTTP потерян после commit, затем повтор и перезапуск: прежний результат восстанавливается без второй проводки — задачи 3, 4, 5.
3. Два менеджера одновременно подтверждают документ либо два заказа на общий остаток: одна допустимая финализация, остаток не отрицательный — задачи 4, 5.
4. Товар истёк между ответом поставщика и разгрузкой; два лота одного продукта с разными сроками: корректная построчная приёмка — задача 4.
5. Блюдо изменили/архивировали между отправкой и подтверждением; истечение без других событий: устаревший заказ и просрочка не расходуют склад — задачи 5, 6.

## Порядок и карта файлов

Выполнять 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Это единая связанная функция; выпускать только после сквозной проверки. Задачи 6 и 7 логически самостоятельны после основы, но общие `Store`, типы и авторизация требуют последовательного исполнения без конфликтующих правок.

Новые backend-файлы: `AccessModels.cs`, `AccessService.cs`, `AccessEndpoints.cs`, `WorkflowModels.cs`, `WorkflowService.cs`, `WorkflowEndpoints.cs`, `OfferPublication.cs`. Складское ядро остаётся в `Inventory.cs`; persistence и транзакции — `Store.cs`; HTTP wiring — `Program.cs`.

Новые frontend-файлы: `SupplierView.tsx`, `WaiterView.tsx`, `ProcurementRequestsView.tsx`, `DeliveryAcceptanceDialog.tsx`, `OrderRequestsView.tsx`, `AccountManagementView.tsx`. Общий API и типы — существующие `api.ts`, `types.ts`; использовать существующие компоненты, dialog/presence и токены.

Новые тесты: `tests/WorkflowChecks.cs`, `tests/AccessChecks.cs`; браузер/HTTP — `frontend/e2e/roles.spec.ts`, `supply-workflow.spec.ts`, `waiter-orders.spec.ts`, `manual-writeoff.spec.ts`, `offer-publication.spec.ts`. Результаты — `docs/EXTERNAL_WORKFLOWS_VERIFICATION.md`.

### Задача 1. Зафиксировать исходное состояние и добавить модель документов

**Files:** `backend/WorkflowModels.cs`, `AccessModels.cs` (create); `Models.cs`, `Store.cs`, `tests/Program.cs` (modify); `tests/WorkflowChecks.cs` (create).

**Interfaces:** `Actor(string UserId, string Role)`; `UserAccount` (id/login/name/role/active/passwordHash/sessionVersion); `ApiCredential` (id/userId/hash/createdAt/revokedAt); `ProcurementRequest`, `DeliveryRequest`, `OrderRequest`, `OfferOverride` с ID, авторами, timestamps и версией. Добавить соответствующие коллекции в `State`.

Документы: закупка хранит адресата, строки с ID/product/quantity/unit, желаемую доставку и комментарий; ответ поставщика сохраняется отдельно от исходных строк. Поставка хранит связи закупки и её строк, исходные сроки/количества и отдельное решение менеджера, `DeliveryId`. Заказ хранит items, отпечаток рецептур, `OrderId`, причину и shortages. Не подменять заявками исторические проводки.

- [ ] Снять `git status --short`, прочитать актуальные инструкции проекта и перечисленные файлы. Проверить доступный SDK; сохранить baseline команд в журнале без секретов. Новые worktree только при необходимости изоляции и с переносом требуемого текущего состояния.
- [ ] В `WorkflowChecks.Run(): int` добавить тест `Migration_preserves_legacy_inventory`: создать БД предыдущей схемы с приходом, расходом и старым `expiry`; после миграции количество/ID/движения неизменны, новые коллекции пусты; повторное открытие безопасно. Подключить runner к `tests/Program.cs`.
- [ ] Запустить тест и подтвердить ожидаемое отсутствие новых сущностей, затем реализовать модели и новую версию миграции. Сделать SQLite backup перед миграцией существующей БД; не копировать только основной файл при активном WAL.
- [ ] Обновить `Tables`, полный Load/Save, выборочные загрузки, индексы по адресату/автору/статусу и истории. Для новых команд загружать нужный документ и связанные данные внутри той же `BEGIN IMMEDIATE`; нельзя проводить решение по объекту, прочитанному до транзакции.
- [ ] Проверить round-trip всех новых моделей, версий и точных decimal; перезапуск; отказ от неподдерживаемой будущей схемы. Коммитить только собственные изменения после PASS и при доступной Git-записи.

### Задача 2. Аккаунты, роли и внешняя авторизация

**Files:** create `AccessService.cs`, `AccessEndpoints.cs`, `tests/AccessChecks.cs`, `frontend/e2e/roles.spec.ts`; modify `Program.cs`, `Store.cs`, `api.ts`, `types.ts`, `main.tsx`.

**Interfaces:** `AccessService.RequireRole(Actor actor, params string[] roles): void`; `RequireOwner(Actor actor, string ownerId): void`; cookie и bearer дают одинаковые ID/role claims. `/api/login` принимает login/password; `/session` выдаёт id/name/role/demo. Аккаунты/ключи администрируются только manager.

- [ ] Добавить отрицательные HTTP-тесты: anonymous→401; waiter на приёмку→403; supplier A на закупку B→404; чужой recovery→404; spoofed supplierId не создаёт заявку от чужого имени. Повторить для истории, деталей, snapshot и SSE. Тестировать HTTP напрямую, не только навигацию UI.
- [ ] Реализовать password hashing, уникальные логины, bootstrap первого менеджера и manager CRUD аккаунтов; запретить отключение последнего активного менеджера. Валидация principal проверяет актуальные active/role/sessionVersion.
- [ ] Реализовать выдачу/отзыв ключей, одноразовый показ токена и хешированное хранение; cookie CSRF и bearer auth. Тест: отключение аккаунта/смена роли прекращает работу ранее выданного cookie и ключа. Не логировать пароли, ключи и их заголовки.
- [ ] Разделить чтение: `/snapshot` только manager; `/supplier/catalog`, `/supplier/procurement-requests`, `/supplier/delivery-requests`; `/waiter/menu`, `/waiter/offers`, `/waiter/order-requests`. Фильтры владельца применяются до pagination/count. Разрешённый SSE не передаёт чужую бизнес-информацию.
- [ ] Запустить `roles.spec.ts` на реальном изолированном API и проверить отсутствие закупочных цен/рецептур в waiter JSON. Старый вход только по паролю не должен авторизовать после bootstrap. Зафиксировать PASS.

### Задача 3. Закупочная заявка менеджера и ответ поставщика

**Files:** create `WorkflowService.cs`, `WorkflowEndpoints.cs`; modify `WorkflowModels.cs`, `Store.cs`, `Program.cs`, `WorkflowChecks.cs`.

**Interfaces:** методы `WorkflowService.CreateProcurement(State s, ProcurementRequestInput input, Actor actor, string key, DateTimeOffset now): ProcurementRequest`; `RespondProcurement(State s, string id, ProcurementResponseInput input, Actor actor, string key, DateTimeOffset now): ProcurementResponseResult`; `CancelProcurement(State s, string id, VersionInput input, Actor actor, string key, DateTimeOffset now): ProcurementRequest`.

Вход ответа: `expectedVersion`, `items[{lineId, confirmedQuantity, expiresAt?, expiryDate?, manufacturedAt?, shelfLifeHours?, unitCost?, currency?, reason?}]`. Результат содержит обновлённую закупку и `deliveryRequestId` или null. Ключи новых workflow-команд обёрнуты областью actor+operation; legacy-idempotency не переписывать.

- [ ] Написать тест `Procurement_10kg_and_5l_response_8kg_and_rejection`: исходные quantities=10/5, ответ=8/0, status=`partially_accepted`; связанная заявка содержит одну строку; `Batches.Count=0`, `Movements.Count=0`.
- [ ] Добавить тесты: отсутствующая/дублированная lineId, неадресованный поставщик, 11 вместо 10, неподходящая единица, нет срока на положительной строке, отказ без причины, `0/0`→rejected без поставки. Подтвердить FAIL до реализации.
- [ ] Реализовать post `/api/procurement-requests`; post `/{id}/supplier-response`; post `/{id}/cancel`; GET списка и деталей с ролью/ownership. Сохранить абсолютный expiry поставщика. Все строки ответа обязательны и финальны.
- [ ] Проверить cancelled→response=409; ответ и связанная заявка создаются одной транзакцией. Тест `Response_retry_after_restart` восстанавливает тот же deliveryRequestId; тот же key с другим body=409; конкурентные ответы дают одну поставку-заявку.
- [ ] Прогнать runner, записать результаты и завершить задачу только после PASS.

### Задача 4. Самостоятельные поставки и фактическая приёмка

**Files:** modify `WorkflowService.cs`, `WorkflowEndpoints.cs`, `Inventory.cs`, `Store.cs`, `Program.cs`, `WorkflowChecks.cs`.

**Interfaces:** `SubmitDelivery(State s, DeliveryRequestInput input, Actor actor, string key, DateTimeOffset now): DeliveryRequest`; `AcceptDelivery(State s, string id, DeliveryAcceptanceInput input, Actor actor, string key, DateTimeOffset now): DeliveryRequest`. Решение содержит `expectedVersion`, `items[{lineId, acceptedQuantity, verifiedExpiresAt?, reason?}]`; полный отказ — все quantities=0 с причинами. Один положительный итог создаёт одну `Delivery` через складское ядро.

- [ ] Написать тест `Accept_7_of_8kg`: партия=7000 g; одно receipt; status=`partially_accepted`; исходные 10/8 и фактические 7 сохранены. До приёмки склад=0. Два лота одного продукта с разными сроками остаются отдельными строками/партиями.
- [ ] Добавить тесты: accept выше заявленного=400; все нули→rejected и без прихода; expiry<=now не принимается; одна испорченная строка может быть явно отклонена, другая принята; некорректная строка в решении откатывает всё. Поздняя приёмка не продлевает expiry.
- [ ] Реализовать post `/api/delivery-requests`, post `/{id}/acceptance`, GET с ownership; manager принимает, supplier только создаёт и читает свои заявки. Сохранить исходные и проверенные сроки, причины, автора и ссылки проводок.
- [ ] Закрыть старый путь: `/api/deliveries` вызывает создание pending-заявки (201), не `Inventory.Deliver`; supplier может пользоваться им с теми же правами. Документировать новый response и recovery. Не оставлять публичный endpoint прямого прихода.
- [ ] Тестировать два решения на один документ с разными key/version: одна финализация, второй=409; retry того же key после перезапуска возвращает исходный результат, не новую партию. Проверить movement reconciliation.

### Задача 5. Внешний заказ и подтверждение менеджером

**Files:** modify `WorkflowService.cs`, `WorkflowEndpoints.cs`, `Inventory.cs`, `Store.cs`, `Insights.cs`, `Program.cs`, `WorkflowChecks.cs`.

**Interfaces:** `SubmitOrder(State s, OrderRequestInput input, Actor actor, string key, DateTimeOffset now): OrderRequest`; `DecideOrder(State s, string id, OrderDecisionInput input, Actor actor, string key, DateTimeOffset now): OrderRequest`. `OrderDecisionInput(expectedVersion, decision, reason?)`, decision=`accept|reject`. API post `/api/order-requests`, `/{id}/decision`; legacy `/api/orders` переводится на submit (201 pending).

- [ ] Написать тест `Pending_order_does_not_consume`: после submit партии/движения/продажи неизменны; после accept один Order accepted и один комплект FEFO-движений, OrderId связан с заявкой.
- [ ] Написать тесты: shortage→rejected без частичного расхода; manual reject требует reason и не увеличивает дефицит; рецепт изменён→409/pending; блюдо архивировано→409/pending; истёк ингредиент→rejected/shortage без расхода. Проверка выполняется внутри транзакции с актуальным now.
- [ ] Реализовать finalization. При нехватке сохранить один окончательный Order rejected с shortages для существующей аналитики; ручной отказ хранить в заявке, без ложного shortage. Не считать pending и связанные документы дважды.
- [ ] Согласовать внутреннюю идемпотентность `Inventory.PlaceOrder` с workflow-командой; recovery новых публичных операций обязан возвращать OrderRequest, а не внутренний Order. Обновить `api.ts` recovery и старые E2E ожидания ответов.
- [ ] Конкурентный тест: два pending заказа на последние 500 g; при двух accept один accepted, второй rejected; остаток=0, единственный расход 500 g. Retry после перезапуска не повторяет расход. Зафиксировать PASS.

### Задача 6. Отмена автосписания и ручное списание

**Files:** modify `Inventory.cs`, `Workers.cs`, `Store.cs`, `Insights.cs`, `Program.cs`, `Demo.cs`, `Telemetry.cs`, `WorkflowChecks.cs`, `tests/Program.cs`.

**Interfaces:** `Inventory.WriteOffExpired(State s, string batchId, Actor actor, string key, DateTimeOffset now): WriteOffResult` (batchId/quantity/movementId); post `/api/batches/{id}/write-off`, только manager. `Inventory.Expire` удалить/заменить только после разбора всех callers; новый monitor не создаёт movements.

- [ ] Тест `Expiry_keeps_physical_stock`: в момент expiry остаток=500, physical=500, usable=0, status=expired; запуск/тик монитора и demo/time не меняют это; потери аналитики=0 до команды.
- [ ] Реализовать derived statuses и отображаемые totals из полной БД. При нуле проверить историю движений: old expiry/new write_off→written_off, только order→consumed. Не выводить «Израсходована» после списания.
- [ ] Реализовать полное списание оставшегося просроченного количества с движением write_off, actor/reason/audit, событием и idempotency. Fresh-партия=409; повтор прежнего key возвращает результат; другой key на уже пустую партию=409 без второго движения.
- [ ] Переработать warning signature: включить ID+состояние warning/expired, чтобы warning→expired давал событие. На старте сравнивать с сохранённым состоянием/границами, чтобы подключённые клиенты и кеши не оставались на старом статусе. Не увеличивать revision каждую секунду.
- [ ] Обновить cost/loss/priceCoverage для write_off и старого expiry, notifications, history filters/sort, details. Проверить >500 партий, границу ровно ExpiresAt, перезапуск и legacy written_off. Обновить тесты автоматического списания на новые требования, сохранив проверку сверки движений.
- [ ] Демо-история создаёт явные завершённые учебные списания; generator создаёт pending workflows. Изменить текст и метрики expiry lag: измеряется обновление статуса, а не задержка уничтожения остатка.

### Задача 7. Публикация и акцент горячих предложений

**Files:** create `OfferPublication.cs`; modify `WorkflowModels.cs`, `Store.cs`, `Program.cs`, `OffersView.tsx`, `types.ts`; create `frontend/e2e/offer-publication.spec.ts`.

**Interfaces:** `OfferPublication.Build(State s, DateTimeOffset now): List<PublishedOffer>`; `PublishedOffer` содержит dishId/name/category/availablePortions/visibility/emphasized/waiterNote и причину недоступности, без стоимости сырья. PUT `/api/dishes/{id}/offer` с visibility/emphasized/waiterNote/expectedVersion; разрешён manager, GET `/waiter/offers` — waiter/manager.

- [ ] Тесты `Show_dish_without_auto_rank`, `Hide_auto_offer`, `Reset_auto`, `Emphasized_unavailable_dish_cannot_be_ordered`, `Archived_dish_is_not_published`, `Override_survives_restart`.
- [ ] Реализовать independent visibility/accent с проверкой note<=240; ручной show объединить с auto без дублей, hide исключает, accent не меняет availablePortions.
- [ ] Добавить manager-контролы и проверку waiter JSON/страницы после SSE. Управление на каталоге позволяет выбрать блюдо, отсутствующее в рейтинге. Прогнать тесты, записать PASS.

### Задача 8. Страницы поставщика и менеджера

**Files:** create `SupplierView.tsx`, `ProcurementRequestsView.tsx`, `DeliveryAcceptanceDialog.tsx`, `AccountManagementView.tsx`; modify `main.tsx`, `pages.tsx`, `PlanningView.tsx`, `OperationModal.tsx`, `DetailsDialog.tsx`, `api.ts`, `types.ts`, `styles.scss`, `Notifications.tsx`; create `supply-workflow.spec.ts`.

**Interfaces:** `/supplier` — закупки/ответы/свои поставки; `/procurement-requests` — manager список/создание; существующий раздел поставок — очередь и история, с переключением между заявками и проведёнными поставками. Типы из задач 1–4, API из задач 2–4.

- [ ] E2E: менеджер создаёт 10kg+5l; supplier отвечает 8kg+0 с expiry/reason; manager принимает 7kg; все три экрана показывают правильные quantities/statuses; склад меняется только последним действием. Выполнять без HTTP-моков на отдельной БД.
- [ ] Реализовать построчные формы, причины, сроки, подтверждение полной/частичной приёмки и полного отказа, историю связей. В PlanningView заменить «создать приход» на заполнение заявки выбранному поставщику.
- [ ] Pending operations хранить с actorId+path+key; переключение аккаунта не должно восстанавливать чужую операцию. После сетевого сбоя сначала recovery, затем повтор с тем же ключом; пользователь не создаёт новую заявку из-за timeout.
- [ ] Добавить аккаунты/ключи менеджера, role redirects после login, прямые URL и back/forward; обработку 401/403/409 без потери заполненной формы. Supplier уведомляется о новой адресованной закупке, manager — о поставке, supplier — о приёмке.
- [ ] Проверить 1440×960 и 390×844: читаемые значения/единицы/сроки, строки без горизонтальной потери действий, touch, Tab, Escape, ошибки полей, disabled busy, пустые состояния. Сохранить скриншоты и PASS.

### Задача 9. Страница официанта, очередь заказов и интерфейс списания

**Files:** create `WaiterView.tsx`, `OrderRequestsView.tsx`, `waiter-orders.spec.ts`, `manual-writeoff.spec.ts`; modify `main.tsx`, `pages.tsx`, `WarehouseDashboard.tsx`, `DetailsDialog.tsx`, `Notifications.tsx`, `OffersView.tsx`, `styles.scss`, `api.ts`, `types.ts`.

**Interfaces:** `/waiter` — menu/offers/cart/own requests; manager очередь из задачи 5. Команда списания из задачи 6. Не передавать manager Snapshot в waiter/supplier компоненты.

- [ ] E2E `Waiter_submit_manager_accept`: cards→cart→pending; склад до решения неизменен; manager accept; waiter видит accepted и склад уменьшен ровно один раз. Отдельно reject reason, shortage, устаревшая доступность и два официанта с раздельной историей.
- [ ] Реализовать карточки, категории, поиск, корзину/порции, серверные ограничения и статус ожидания. Акцент/пояснение менеджера заметны; стоп-лист блокирует добавление. Не обещать резервирование после submit.
- [ ] Реализовать очередь manager с составом, preview актуального дефицита, accept/reject и обработкой 409. Новые заявки вызывают transient push через существующий notification lifecycle; initial snapshot не создаёт пачку push.
- [ ] E2E `Expired_visible_until_writeoff`: перевести время, увидеть красный продукт/партию и ненулевой физический остаток; открыть details, нажать «Списать товар», подтвердить; status=Списана, movement один, loss учтён. Проверить отсутствие кнопки и HTTP-доступа у supplier/waiter.
- [ ] Удалить тексты об автосписании из интерфейса, включая демо. Проверить mobile/desktop, keyboard/touch и обновление открытого waiter меню при expiry без ручного reload.

### Задача 10. Сквозная проверка, документация и передача

**Files:** modify `README.md`, `docs/API.md`, `OPERATOR.md`, `DEMO.md`, `RUNBOOK.md`, `DECISIONS.md`, existing E2E/domain tests; create `docs/EXTERNAL_WORKFLOWS_VERIFICATION.md`.

- [ ] Перечислить все маршруты `Program.cs` и новых endpoint-файлов; для каждого зафиксировать роль, owner filter и auth scheme. Проверить, что legacy create/recovery/preview/catalog endpoints не позволяют обходить workflow или читать чужие данные.
- [ ] Обновить старые тесты orders/deliveries/demo/time/preview: теперь submit и manager decision раздельны. Не удалять meaningful FEFO, precision, all-or-nothing, pagination, analytics, concurrency и idempotency проверки.
- [ ] Выполнить доменный runner, build и целевые HTTP/E2E проверки командами ниже; затем существующий полный E2E набор на подготовленной изолированной базе. Фиксировать реальные результаты, failures и причину внешнего блокера; не писать PASS по наличию кода.
- [ ] Проверить миграцию копии старой БД и повторный restart: исходные операции и ручные изменения сохранены; новых автосписаний нет. Проверить backup/restore локально; не запускать reset-db на рабочей базе.
- [ ] Документировать login/bootstrap, роли, lifecycle, bearer key issuance/revoke, JSON-примеры 10→8→7, Idempotency-Key/recovery, expectedVersion, статусы/ошибки, смену контрактов legacy API. Обновить операторские сценарии для всех ролей и демо.
- [ ] Выполнить итоговый self-review по спецификации и Review Focus. Передать пользователю изменения, проверенные команды, скриншоты, ограничения и список незавершённого. Готовность только при выполнении всей матрицы ниже.

## Команды проверки (PowerShell, из D:\Progs\hack)

Выбрать SDK без изменения системных переменных:

```powershell
$taskDotnet = if (Test-Path '.tools/dotnet/dotnet.exe') { (Resolve-Path '.tools/dotnet/dotnet.exe').Path } else { 'dotnet' }
& $taskDotnet run --project tests/Flagman.Tests.csproj
npm.cmd --prefix frontend run build
```

Ожидание: runner заканчивается без исключения, все зарегистрированные проверки PASS, exit code 0; TypeScript/Vite build exit code 0. Сначала добавлять failing regression для новой доменной функции, затем реализовывать её и подтверждать PASS. Для документационных/стилевых правок не создавать тесты, зеркалящие реализацию.

Для HTTP/E2E агент поднимает сервер на свободном локальном порту с новой тестовой БД и текущими startup-настройками; создаёт manager/supplier/waiter через реальный bootstrap/API. Секреты генерировать в процессе и не сохранять в репозиторий. `BASE_URL` направить на этот сервер; `FLAGMAN_BROWSER` задавать только при необходимости по фактическому пути доступного Chromium.

```powershell
$env:BASE_URL = 'http://127.0.0.1:5087'
npm.cmd --prefix frontend run test:e2e -- roles.spec.ts supply-workflow.spec.ts waiter-orders.spec.ts manual-writeoff.spec.ts offer-publication.spec.ts
npm.cmd --prefix frontend run test:e2e
```

Порт 5087 — пример для изолированного запуска; перед командой сервер должен быть готов, база наполнена по контракту конкретных тестов. Полный набор может требовать отдельной подготовленной demo-базы: не переиспользовать изменённую целевыми тестами БД без проверки fixtures. Старые hardcoded shared-password login helpers обновить под новые аккаунты. Проверять результаты каждого процесса, не маскировать сбой следующей командой.

## Матрица готовности

| Требование | Задачи | Доказательство |
|---|---|---|
| Три роли, accounts, cookie/bearer, ownership | 1–2, 8 | Прямые отрицательные HTTP-тесты; отозванные credentials не работают |
| Менеджер отправляет закупку поставщику | 3, 8 | Заявка появляется только у адресата; исходные количества сохранены |
| Поставщик принимает/отклоняет позиции и задаёт expiry | 3, 8 | 10kg+5l → 8kg+0, linked pending delivery, склад=0 |
| Самостоятельная поставка и полная/частичная приёмка/отказ | 4, 8 | 8→7kg; full reject без партии; legacy API не делает приход |
| Меню и внешние заказы официанта | 5, 9 | Pending без расхода; manager accept/reject; актуальная проверка FEFO |
| Управление visibility и акцентом | 7, 9 | show/hide/auto/emphasized, SSE/restart, недоступное блюдо не продаётся |
| Истечение без автоматического списания | 6, 9 | Physical>0, usable=0 после срока/старта/тика/demo time |
| Красная индикация и ручное списание | 6, 9 | Status expired→written_off, один movement, правильная стоимость потери |
| Безопасная миграция и старые данные | 1, 6, 10 | Backup, сохранённые ID/quantities/movements, old expiry=written_off |
| Повторы, конкуренция, сетевой сбой | 3–5, 8–10 | Retry/restart/recovery, 409 stale/body conflict, без двойных движений |
| Mobile, клавиатура, touch и уведомления | 8–9 | Desktop/mobile E2E и скриншоты, Tab/Escape, новые push без initial spam |

## Задание для запуска агента

«Реализуй полностью `docs/superpowers/plans/2026-10-14-external-workflows.md` по связанной спецификации. Сначала проверь актуальный код и сохрани текущие пользовательские изменения. Выполняй задачи по порядку, отмечай только выполненные пункты, проверяй серверную авторизацию и транзакции реальными тестами. Не ограничивайся интерфейсами: реализуй persistence, migration, HTTP API, все три роли и полный workflow. Не очищай рабочую БД. В конце представь результаты всей матрицы готовности и честно перечисли внешние блокеры. Не деплой, не отправляй сообщения и не публикуй изменения без отдельного поручения».
