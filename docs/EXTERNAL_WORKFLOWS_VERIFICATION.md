# Проверка внешних заявок, ролей и ручного списания

Дата: 15 октября 2026. Спецификация: [external-workflows-design](superpowers/specs/2026-10-14-external-workflows-design.md). План: [external-workflows](superpowers/plans/2026-10-14-external-workflows.md).

## Состояние исполнения

Реализованы schema4, accounts/credentials, три роли и отдельные проекции, закупка/ответ/приёмка, самостоятельные поставки, pending-заказы и FEFO-финализация, visibility/accent, сохранение просроченного физического остатка, ручное списание, страницы и обработка сетевых сбоев. Ветка `codex/external-workflows`; исходные незакоммиченные изменения сохранены. Публикация и push не выполнялись. Переключение заявок/проведённых поставок реализовано и проверено. Все строки матрицы выполнены и проверены.

## Проверенные команды

- `.tools/dotnet/dotnet.exe run --no-restore --project tests/Flagman.Tests.csproj`: **65 PASS**, exit 0. FEFO, precision, all-or-nothing, analytics/calendar/DST, pagination >500, migration/backup, independent-process concurrency, domain workflows.
- `npm.cmd --prefix frontend run build`: **PASS**, TypeScript/Vite exit 0.
- `npm.cmd --prefix frontend run test:e2e -- roles.spec.ts supply-workflow.spec.ts waiter-orders.spec.ts manual-writeoff.spec.ts offer-publication.spec.ts pending-actor.spec.ts reauth-workflow.spec.ts authorization-paths.spec.ts workflow-touch.spec.ts`: **23 PASS**, exit 0 на новой изолированной demo-БД. Тесты используют реальный API и bootstrap; основные workflow-сценарии без HTTP-моков.
- `npm.cmd --prefix frontend run test:e2e -- onboarding.spec.ts`: **1 PASS**, exit 0 на другой новой БД с FLAGMAN_DEMO=false; ресторанная зона отличается от зоны браузера.
- `npm.cmd --prefix frontend run test:e2e -- workflow-touch.spec.ts`: **1 PASS**, exit 0; Chromium hasTouch/isMobile, реальные tap поставщика/официанта на 390×844.
- `.tools/dotnet/dotnet.exe run --no-restore --project tests/Flagman.Tests.csproj -- --migration-copy backend/data/flagman.db tmp/external-workflows/legacy-copy2.db`: **PASS**, exit 0. Исходный файл открывался read-only для SQLite backup; миграция и повторные monitor/restart выполнялись только на копии. ID, количества, timestamps и движения сравнивались как typed records; добавление nullable actor/reason не считалось изменением операции. Verified backup/restored copy прошли integrity_check и movement reconciliation.
- Последний полный E2E: **92 PASS, 1 skipped**, exit 0 (93 зарегистрированных теста). Skipped — onboarding с demo=false; он отдельно прошёл на новой production-БД. Предыдущие отказы зафиксированы и исправлены: legacy ожидания прямых проводок/автосписания, фикстуры новых проекций, несколько SSE-подписчиков, выбор очереди вместо складского журнала. Не считать старые провалы внешним блокером или PASS.

Логи: `tmp/external-workflows/domain-final.log`, `workflows-complete.log`, `ui-build.log`, `http-checks2.log`, `production-onboarding.log`, `touch.log`, `migration-copy2.log`, `full-e2e.log`. Команды исполнялись из D:\Progs\hack; localhost-порты 5088/5089/5090/5091, случайные bootstrap-пароли и новые БД. Chromium: `.tools/browsers/chromium-1248/chrome-win64/chrome.exe`. Секреты не сохранены в исходниках или логах.

Для повторения добавлен [verify-external-workflows.ps1](../scripts/verify-external-workflows.ps1): `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-external-workflows.ps1 -Full`. Он создаёт отдельную БД для targeted, production-onboarding и full, восстанавливает окружение и останавливает только свои серверы. В этой сессии проверен синтаксис wrapper; перечисленные составляющие команды исполнялись отдельными эквивалентными скриптами. На Windows test startup отключает только EventLog provider, недоступный в ограниченном процессе; исходный сбой логгера не маскируется как дефект API.

## Матрица готовности

| Требование | Проверка | Результат |
|---|---|---|
| Роли/accounts/cookie/bearer/ownership | roles, AccessChecks; 401/403/404, body spoofing берёт actor из principal; отзыв ключа закрывает открытый SSE | PASS |
| Закупка только адресованному поставщику | Procurement domain + supply live API/UI | PASS |
| 10kg+5l → 8kg+0, сроки/причины, pending delivery без склада | supply API и supplier UI desktop/mobile | PASS |
| Самостоятельная поставка; 8→7; полный отказ; expired lot | WorkflowBoundaryChecks, supply acceptance UI | PASS |
| Pending waiter order, manager accept/reject, FEFO/shortage | waiter live, concurrent last500g, recipe change, manual reject | PASS |
| Visibility auto/show/hide и независимый акцент | Offer domain/API/UI, disabled unavailable card, persisted override | PASS |
| Истечение без уничтожения stock | natural expiry в открытом waiter меню; copy migration/monitor/restart; demo time | PASS |
| Красная просрочка, кнопка ручного списания, loss | manual-writeoff API/UI; written_off/legacy expiry, actor/reason, один movement | PASS |
| Безопасная миграция и backup/restore | Копия рабочей БД + domain old/future schema, сохранённые ID/values | PASS |
| Повторы/restart/recovery/body conflict/concurrency | Domain + HTTP; lost response; actor/role isolation и changed-decision guard | PASS |
| Mobile/keyboard/touch/push | 1440×960/390×844, Tab/Escape; real touch; initial snapshot не вызывает push; общий PushNotice/usePresence | PASS |
| Переключение заявки/проведённые поставки | Браузерный тест delivery tabs: RED до реализации, GREEN после | PASS |

## Аудит и ограничения

Независимый read-only reviewer проверил владение, повтор/версию, приёмку просрочки, смену рецепта и атомарность. В независимом просмотре Critical не были найдены; итоговый self-review обнаружил обход роли через регистр URL. Регрессия /API/snapshot показала 200 вместо403; нормализация пути закрыла чтение и запись, повторные HTTP-тесты PASS. Исправлены пять Important: очистка чужого intent при смене actor, восстановление старого accept как результата нового reject, невозможный re-login, блокировка pending после смены роли, недоступные старые приёмки за первым экраном. Дополнительно исправлены отзыв конкретного bearer SSE, manager redirects, цена/валюта поставщика и обновление версии публикации. Регрессии actor clearing и нормализованных уникальных логинов наблюдались RED→GREEN.

Self-review: новые бизнес-команды работают внутри Store.Write/BEGIN IMMEDIATE; principal повторно проверяется внутри транзакции. Internal receipt/order keys не возвращаются вместо workflow-документов. Owner-фильтр применяется до count/page. Полная карта маршрутов и JSON 10→8→7 — [API](API.md).

Локальные результаты не проверяют публичный HTTPS, Docker/CI или целевой сервер. NuGet предупреждал о недоступном источнике данных уязвимостей (NU1900); сборка и runner использовали имеющийся restore/cache. Workflow-путь читает State целиком — пригодность для большого ресторана/мультиарендности не заявляется. Неподдерживаемые первой версией резервирование, замены и дробные отгрузки описаны в спецификации.

## Дополнительная сверка

Сохранены manufacturing/shelf metadata поставщика при поздней приёмке, абсолютный expiry не продлевается. Учебные write_off сохраняют свои audit-записи при объединении демо-истории. Лаг монитора измеряет только новые переходы в expired, включая startup, и не растёт из-за старого физического просроченного остатка. Эти регрессии прошли RED→GREEN, доменный runner содержит 65 проверок. Production smoke и config-check прошли на отдельных БД: Secure/HttpOnly cookie flags, запрет demo, история после archive/version, реальная ротация пароля через account API, Origin и429. Это проверка профиля настроек, а не публичного TLS.

Обновлены старые login/load/profile/smoke helpers под личный login и отдельную финализацию заявок. Для load/profile выполнена проверка синтаксиса; большой нагрузочный профиль отдельно не запускался и не объявляется PASS.

## Скриншоты

[Поставщик 1440](verification/external-workflows/external-supplier-1440.png), [поставщик 390](verification/external-workflows/external-supplier-390.png), [приёмка 1440](verification/external-workflows/external-acceptance-1440.png), [приёмка 390](verification/external-workflows/external-acceptance-390.png), [официант 1440](verification/external-workflows/external-waiter-1440.png), [официант 390](verification/external-workflows/external-waiter-390.png), [публикация](verification/external-workflows/external-offer.png), [списание](verification/external-workflows/external-writeoff.png), [touch](verification/external-workflows/external-touch.png).

Последний bootstrap/config regression: существующие аккаунты запускаются и авторизуются без FLAGMAN_PASSWORD; переменная нужна только при создании первого manager. Вход по одному паролю не восстановлен. Проверка config-check прошла после RED на прежнем обязательном startup guard.

Незавершённых функциональных требований плана и внешних блокеров локальной матрицы нет. Коммиты/merge/push агентом не выполнялись: исходные пользовательские изменения и параллельные изменения runner сохранены в текущей ветке.

Последний общий браузерный прогон относится к завершённым UI/workflow изменениям. После него уточнены bootstrap существующих аккаунтов и диагностика лага статуса; для этих серверных правок повторно выполнены полный доменный runner (65 PASS) и production/config smoke (exit 0). Общий E2E второй раз только из-за этих двух уточнений не повторялся.
