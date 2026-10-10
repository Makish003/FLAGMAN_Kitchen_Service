# Матрица выполнения R01–R25

10 октября 2026. Этапы 0–9 выполнены для локального приложения: 14 критических проверок C#/SQLite и 3 сквозных Playwright-теста прошли. Доказательства: docs/domain-checks.log, docs/browser-checks.log, docs/VERIFICATION.md. «Проверено» означает локальную приёмку, а не публикацию или контейнерный запуск.

| ID | Состояние | Реализация | Проверка / оставшаяся работа |
|---|---|---|---|
| R01 | проверено | backend/Inventory.cs Deliver/Once, Store.cs | FEFO fixture, повтор ID/ключа, rollback второй строки |
| R02 | проверено | Inventory.cs ValidateQuantity/ConvertQuantity | отрицательные/дробные количества, несовместимые единицы |
| R03 | проверено | Models.cs Batch, Inventory.cs Deliver | независимые 2 кг и 3 кг партии |
| R04 | проверено | Inventory.cs Deliver/Usable | manufactured/received/local-end-of-day, exact boundary |
| R05 | проверено | Insights.cs Snapshot, Inventory.cs | журнал сходится с каждой партией; склад и журнал просмотрены в браузере |
| R06 | проверено | Inventory.cs SaveDish, main.tsx | валидация рецептов; UI создаёт рецепт и использует в заказе |
| R07 | проверено | Inventory.cs PlaceOrder | заказ нескольких блюд и общий ингредиент |
| R08 | проверено | Inventory.cs Missing/PlaceOrder | отказ без движений, rollback |
| R09 | проверено | Store.cs Write, Inventory.cs Once | повтор accepted/rejected, реальная БД, 10 соединений и 4 отдельных процесса |
| R10 | проверено | Inventory.cs Usable/Consume | 2 кг + 3 кг, расход 2.5 кг |
| R11 | проверено | Inventory.cs Portions/Missing, Insights.cs | refill возвращает одну порцию, точная граница срока |
| R12 | проверено | Workers.cs Monitor, stock UI | точная граница и фоновое истечение без заказов; экран партий |
| R13 | проверено | Insights.cs Purchases | ручной пример спроса/целевого запаса; параметры и основания в UI |
| R14 | проверено | Insights.cs Rate | строго растущая срочность при прочих равных |
| R15 | проверено | Insights.cs Recommendations, offers UI | конкретные партии, стоп-лист исключён |
| R16 | проверено | Workers.cs Monitor, SSE, App refresh | вычисление от времени; два SSE-клиента и обновление UI |
| R17 | проверено | Inventory.cs Expire, Monitor | один расход по сроку, повтор и новый Store после рестарта |
| R18 | проверено | Insights.cs Analytics | отдельно 500 г расхода / 500 г потерь |
| R19 | проверено | PlaceOrder, ShortageEvent, Analytics | один отказ при повторе ключа; shortageQuantity и блюда |
| R20 | проверено | Insights.cs Forecasts | ручные 72 ч, отсутствие истории, истечение без спроса |
| R21 | проверено | Program.cs /events, App EventSource | два клиента получают изменения; Last-Event-ID воспроизводит событие |
| R22 | проверено | Demo.cs Generate, Workers.cs Generator | 15 событий/seed; повтор после сдвига времени безопасен; start/stop E2E |
| R23 | проверено | frontend/src/main.tsx, styles.scss | все экраны, реальные операции через формы, визуальная приёмка |
| R24 | проверено | Program.cs auth/CSRF/rate limiter, Store, UI | 401/403/409, npm/NuGet audit, пагинация, mobile 390 px без переполнения |
| R25 | проверено локально | tests/, frontend/e2e/, README, Dockerfile, compose | чистый запуск, 14 C# + 3 E2E; Docker недоступен, публикация не выполнялась |

Dockerfile/Compose/TLS подготовлены, но контейнерный запуск не проверен: Docker отсутствует. Внешняя публикация не выполнялась. Пределы прогноза, масштабирования SQLite и размера снимка описаны в README и VERIFICATION; production-нагрузочная приёмка не заявляется.
