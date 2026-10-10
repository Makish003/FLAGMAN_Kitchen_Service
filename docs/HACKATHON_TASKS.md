# Выполнение HACKATHON_MAX_SCORE_PLAN

Начато 10 октября 2026. Один агент, текущий checkout main. Исходные изменения README и план сохраняются. Проверки используют отдельные БД и порты. Исторические отчёты не считаются новыми доказательствами.

## Покрытие PDF (страницы просмотрены визуально)

| Страница / требование | Экран | API / реализация | Проверка |
|---|---|---|---|
| 3: поставка, дата, ID, номер, состав | Поставки | POST /deliveries, Inventory.Deliver | R01–R05, production-smoke |
| 3: отдельные партии, количество и срок | Склад, детали партии | /snapshot, /history/batches, /details/batches | FEFO, manufactured/received/expiryDate |
| 4: многоблюдный заказ, суммарный состав | Заказы, рецептуры | POST /orders, Inventory.PlaceOrder | общий ингредиент, атомарный отказ |
| 4: списание / отказ / стоп-лист | Заказы, Стоп-лист | Inventory.Missing/Consume/Portions | конкурентность, отказ без расхода |
| 5: остатки, время, предупреждение, FEFO | Склад, Сроки, Закупки | Monitor, Inventory.Usable, Insights.Purchases | граница срока, повтор списания |
| 6: приоритет, причины, автообновления | Горячие предложения | Insights.Recommendations, /events | срочность, E2E SSE, независимый oracle 65 случаев, explicit /planning |
| 7: автосписание, потери, дефицит | Аналитика | Inventory.Expire, /analytics | движения / аналитика |
| 7: прогноз | Прогноз | POST /scenario, ScenarioDemand | календарь/FEFO/expiry, held-out backtest |
| 7: SSE, API/генератор, дашборд, UX | Обзор, Демонстрация | /events, /generator, /snapshot | E2E, seed, визуальная приёмка |
| 8: стек, корректность, стабильность, дизайн | всё приложение | ASP.NET/SQLite/React/TS/SCSS | verify-release |
| 8: GitHub, доступное демо (приветствуются) | README / deployment | remote есть; Docker отсутствует | публичная приёмка требует внешнего действия |

## Журнал

| ID | Статус | Файлы / доказательство / ограничение |
|---|---|---|
| H00 | проверено | PDF страницы 3–8 просмотрены; матрица выше, фактический код прочитан |
| H01 | проверено | журнал H00–H30 и покрытие PDF |
| H02 | проверено | исходный release-20261010-205449-8453d5: 18/18, build/publish; HTTP заблокирован sandbox EACCES. release-20261010-211051-c18fcd с разрешённым loopback: все проверки прошли; включает ранние новые функции |
| H03 | проверено | h03-before.log воспроизводит Archived dish took virtual stock; Insights.cs фильтрует архив; регрессия прошла |
| H04 | проверено | tests/Program.cs: FEFO, общая потребность, атомарность, граница, reconciliation, конкуренция процессов |
| H05 | проверено | tests/Program.cs и app.spec.ts: архив/expiry-between-offer, last portion между процессами, lost response/reload, повтор автосписания; финальные 29 domain и 7 E2E прошли |
| H06 | проверено | SalesPlanner.cs / OffersView: 6/12/24/shiftEnd, timezone, stock/manual/history, кухня и server revision; domain + hackathon E2E |
| H07 | проверено | нормированные доли × срочность; отдельный денежный режим с полной валютой; oracle 65 сценариев |
| H08 | проверено | FEFO в момент готовности, целые порции; независимое воспроизведение, stock immutability, граница и конкурирующий заказ |
| H09 | проверено | SalesPlanner / PlanningService: greedy baseline, DFS/ограниченные альтернативы/fallback, вне writer/SSE; cache revision+parameters+expiry/warning/history, p95 20/100=650мс и 100/1000=160мс |
| H10 | проверено | mode/provenOptimal/stop/nodes/calculationMs/baselineCalculationMs/остаточный риск; предел 10000 явно раскрыт; gap не заявлен. Oracle/benchmark/UI проверены |
| H11 | проверено | HackathonChecks.cs; planner-comparison.json (65), обязательный A/B, строгое улучшение, смешанные единицы, архив, большие объёмы; p95 20/100=650мс |
| H12 | проверено | Models/Inventory/Store v3; цены optional decimal, kg/l conversion, предварительная backup; v2/v3 restore сохраняет остатки и журнал |
| H13 | проверено | Batch price/coverage по валютам, actual movements 150/450 RUB; исторические цены 600 партий сверх UI limit500; domain/details/UI проходят |
| H14 | проверено | OffersView: один снимок baseline/improved/остаточный риск, потенциальный эффект отделён от фактических движений; 65 сравнений опубликованы, есть строгий выигрыш |
| H15 | проверено | OffersView/DetailsDialog: названия, единицы, время ресторана, limiting ingredient, расход/срок каждой партии, журналы; E2E и визуальный просмотр |
| H16 | проверено | OperationModal + /orders/preview: точный перенос10 B, read-only preview; другой оператор расходует запас, stale visible, подтверждение отказывает без partial; после поставки принят B1 |
| H17 | проверено | PlanningView/OperationModal + /deliveries/preview: редактируемый2-line draft, явное поступление/срок, before/arrival/after, no movements before save; hackathon E2E прошёл |
| H18 | проверено | существующая фиксация payload+key сохранена; lost-response E2E прошёл в release-211051 |
| H19 | проверено | ScenarioDemand: календарь/день/час, 60/100/140%, достаточность/ручной fallback; 14 held-out синтетических окон, будущие события исключены из обучения; реальный ресторан не валидирован |
| H20 | проверено | принятые/уникальные отказы раздельно; идемпотентные повторы не добавляют orders; гипотеза includeRejectedDemand по умолчанию false |
| H21 | проверено | Общий сценарий меню, FEFO/expiry/closed hours/FutureSupplies; интервалы<=15мин, конкретный ингредиент. Доменные случаи/backtest/UI прошли |
| H22 | проверено | Спрос до/после приезда, истечение внутри горизонта, общая потребность и safety; domain контрольные случаи + editable draft E2E |
| H23 | проверено | quantity/lead/shelf редактируются, повторная оценка FEFO excess, без истории/срока явное неизвестно; domain и responsive E2E |
| H24 | проверено | Конечный publish production-smoke: demo=false, атрибуты Secure/HttpOnly проверены по Set-Cookie на loopback HTTP в Production, JSON/Origin/session/readiness. Реальный внешний TLS — H25; пакет проверяется в H30 |
| H25 | требуется внешнее действие | Docker CLI/хост отсутствуют; нужен Docker-хост и адрес HTTPS |
| H26 | проверено | Конечный release один оператор 133/25/943мс; 3×5 без оптимизатора и 3×5 с ним, errors0/reconciliation6/6. Худшие с оптимизатором284/60/972мс, planner HTTP1576мс. БД C:, диск D: не прошёл; точные профили/логи в VERIFICATION |
| H27 | требуется внешнее действие | verify-clean-source: новый экспорт без .tools/node_modules/data, npm ci/build/29 domain/publish/production launch прошли. npm/NuGet audit выполнен. CI release.yml подготовлен; нужны авторизация публикации и GitHub workflow на новых изменениях |
| H28 | проверено | scripts/verify-release.ps1: конечный release-20261010-214826-caf22d, полный RESULT.txt; 29 domain, 7 E2E, production/security/config, backup/restore, invariant нагрузка; failed logs сохранены |
| H29 | проверено | Конечные screenshots: offers/procurement/forecast и формы 390/768/1440 просмотрены; overflow assertions, axe/клавиатура/Escape/reduced motion, два SSE/replay, stale rejection. Исправлены padding и ложное сравнение с запаздывающим client revision |
| H30 | проверено | DEMO/README/OPERATOR/DECISIONS/VERIFICATION обновлены; единый seed42 и два сравнения. output/flagman-1.2.0-rc1-20261010-215740.zip + .sha256; packaged backup/restore/integrity/reconciliation прошли (package-check-20261010-215835), private-data guard и ZIP audit |

Локальная итоговая приёмка: test-results/release-20261010-214826-caf22d. Проверяемый запуск из чистого экспорта: test-results/clean-source-20261010-215316 (это не опубликованный Git checkout). H25 и внешняя часть H27 требуют Docker-хост, DNS/HTTPS, отдельные демо-данные и авторизацию GitHub/хостинга; артефакты Dockerfile/Compose/Caddy/release.yml и RUNBOOK подготовлены. Публичная готовность пока не подтверждена.
