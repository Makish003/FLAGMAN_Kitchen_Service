# API v1

Базовый путь `/api`, JSON camelCase. Все запросы, кроме health/login, требуют cookie `flagman.session`. `POST/PUT` требуют `X-Requested-With: Flagman`. Браузерные запросы проверяют Origin. Не передавайте сессионные cookies третьим сторонам.

`POST /login {"password":"..."}` устанавливает HttpOnly cookie; 401 при неверном пароле, 429 при превышении 10 попыток/IP/минуту. `POST /logout`, `GET /session {name,demo}`. `GET /health` проверяет чтение БД.

`GET /snapshot` — общий снимок: now, revision, settings, products, batches, dishes, deliveries, orders, movements, recommendations, salePlan, procurement, forecasts, analytics, totals. Snapshot не заменяет полный журнал.

`POST /products {"id":"tomato","name":"Томаты","unit":"g","warningHours":48}`. Unit: g/ml/pcs. `POST /dishes {"id":"caprese","name":"Капрезе","category":"Закуски","ingredients":[{"productId":"tomato","quantity":200}]}`. Quantity в базовой единице на порцию. До продаж рецепт можно изменить тем же ID.

`POST /deliveries`, обязательный заголовок `Idempotency-Key: external-delivery-001`:

```json
{
  "id": "external-delivery-001",
  "number": "ПС-1001",
  "createdAt": "2026-10-10T09:00:00Z",
  "receivedAt": "2026-10-10T09:00:00Z",
  "items": [
    {"productId":"tomato","quantity":2,"unit":"kg","expiresAt":"2026-10-11T09:00:00Z"},
    {"productId":"tomato","quantity":3,"unit":"kg","shelfLifeHours":168,"manufacturedAt":"2026-10-10T07:00:00Z"}
  ]
}
```

ID и времена необязательны, по умолчанию сервер создаёт их. Строка также может содержать `expiryDate: "2026-10-11"` вместо expiresAt. При отсутствии явной даты нужен положительный shelfLifeHours: расчёт от manufacturedAt, иначе receivedAt. Дата производства не позже поступления; поступление не из будущего.

`POST /orders`, обязательный `Idempotency-Key: external-order-001`:

```json
{"items":[{"dishId":"caprese","portions":2},{"dishId":"pasta","portions":1}]}
```

Ответ 201: `{id,createdAt,status:"accepted",items,shortages:[]}`. Ответ 422 — **сохранённый отклонённый заказ** с status rejected, shortages (productId, productName, unit, requested, available, missing, dishIds). При отказе движений расхода нет. Повтор возвращает прежний статус и ID; 409 при другом содержимом. Неизвестные блюда, единицы, неположительные количества: 400 `{error}`.

`GET /history/{batches|deliveries|orders|movements}?page=1&size=50` — total, page, size, items. Размер 1–100.

`GET /analytics?from=2026-10-01T00:00:00Z&to=2026-10-10T23:59:59Z` — отдельный расход на заказы, потери, статистика отказов по продуктам и дневные заказы. По умолчанию последние 7 дней. Дневные графики ограничены 90 днями.

`PUT /settings` — полный объект:

```json
{"timezone":"Europe/Moscow","warningHours":48,"demandWindowDays":7,"planningHours":48,"leadTimeHours":12,"safetyFactor":0.2,"forecastHours":168}
```

`GET /events` — SSE: `sync {revision}` при каждом соединении, далее `change {id,type,at}` с полем `id: N`. `Last-Event-ID` воспроизводит события после курсора. Получив sync/change, клиент перечитывает snapshot: состояние восстанавливается даже при пропущенных событиях. Heartbeat каждые 1 с. Журнал событий хранится в той же транзакции с операцией склада.

Только `FLAGMAN_DEMO=true`: `POST /demo/seed` (безопасно повторять), `POST /demo/time {"hours":8}` (вперёд, 0<hours<=720), `POST /generator/start {"seed":42,"intervalSeconds":5}`, `POST /generator/stop`. `GET /generator` — running/seed/intervalSeconds/index/error. Для нового потока используйте новый seed. В production часы не сдвигаются и генератор не запускается.
