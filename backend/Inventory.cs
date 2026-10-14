using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Flagman;

public static class Inventory
{
    public static string Id() => Guid.NewGuid().ToString("N");
    public static void Require(bool condition, string message, int status = 400) { if (!condition) throw new DomainException(message, status); }
    public static Product Product(State s, string id) => s.Products.Find(p => p.Id == id) ?? throw new DomainException("Неизвестный продукт: " + id);
    public static void ValidateQuantity(decimal quantity)
        => Require(quantity > 0 && quantity <= 1_000_000_000m && decimal.Round(quantity, 3) == quantity, "Количество должно быть положительным, не более 1 млрд и до 3 знаков после запятой");
    public static decimal ConvertQuantity(decimal quantity, string from, string to)
    {
        Require(quantity > 0 && quantity <= 1_000_000_000m, "Количество должно быть положительным и не более 1 млрд");
        var normalized = (from, to) switch { ("kg", "g") or ("l", "ml") => quantity * 1000,
            _ when from == to => quantity, _ => throw new DomainException("Несовместимые единицы измерения") };
        ValidateQuantity(normalized);
        return normalized;
    }
    public static T Once<T>(State s, string scope, string key, object input, Func<T> action)
    {
        Require(!string.IsNullOrWhiteSpace(key) && key.Length <= 100, "Нужен Idempotency-Key (1–100 символов)");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(input, Store.Json))));
        var requestId = scope + ":" + key; var existing = s.Requests.Find(x => x.Id == requestId);
        if (existing is not null)
        {
            Require(existing.Hash == hash, "Ключ уже использован с другим содержимым", 409);
            return JsonSerializer.Deserialize<T>(existing.ResultJson, Store.Json)!;
        }
        var result = action(); s.Requests.Add(new(requestId, hash, JsonSerializer.Serialize(result, Store.Json))); return result;
    }
    public static Product AddProduct(State s, Product product, DateTimeOffset now)
    {
        Require(!string.IsNullOrWhiteSpace(product.Id) && product.Id.Length <= 80 && !string.IsNullOrWhiteSpace(product.Name) && product.Name.Length <= 120, "Укажите ID и название продукта");
        Require(new[] { "g", "ml", "pcs" }.Contains(product.Unit), "Базовая единица: g, ml или pcs");
        Require(product.WarningHours > 0 && product.WarningHours <= 8760, "Некорректный порог предупреждения");
        Require(s.Products.All(x => x.Id != product.Id), "Продукт с таким ID уже существует", 409);
        s.Products.Add(product); s.Emit("catalog.changed", now); return product;
    }
    public static Dish SaveDish(State s, Dish dish, DateTimeOffset now)
    {
        Require(!string.IsNullOrWhiteSpace(dish.Id) && dish.Id.Length <= 80 && !string.IsNullOrWhiteSpace(dish.Name) && dish.Name.Length <= 120, "Укажите ID и название блюда");
        Require(dish.Category is { Length: <= 120 }, "Укажите категорию блюда");
        Require(dish.Ingredients is { Count: > 0 and <= 100 }, "Нужна непустая рецептура");
        Require(dish.Ingredients.Select(x => x.ProductId).Distinct().Count() == dish.Ingredients.Count, "Ингредиент повторяется");
        foreach (var ingredient in dish.Ingredients) { Require(!Product(s, ingredient.ProductId).Archived,"Продукт архивирован"); ValidateQuantity(ingredient.Quantity); }
        Require(!s.Orders.Any(o => o.Status == "accepted" && o.Items.Any(i => i.DishId == dish.Id)), "Рецепт проданного блюда неизменяем; создайте новую версию", 409);
        s.Dishes.RemoveAll(x => x.Id == dish.Id); s.Dishes.Add(dish); s.Emit("recipe.changed", now); return dish;
    }
    public static Delivery Deliver(State s, DeliveryInput input, string key, DateTimeOffset now)
        => Once(s, "delivery", key, input, () =>
        {
            Require(!string.IsNullOrWhiteSpace(input.Number) && input.Number.Length <= 100 && input.Items is { Count: > 0 and <= 100 }, "Нужны номер и продукты поставки");
            var received = input.ReceivedAt ?? now; var created = input.CreatedAt ?? now;
            Require(received <= now && created <= now, "Поставка не может быть из будущего");
            var id = input.Id ?? Id(); Require(!string.IsNullOrWhiteSpace(id) && id.Length <= 100 && s.Deliveries.All(x => x.Id != id), "ID поставки уже существует или некорректен", 409);
            var batches = new List<Batch>();
            foreach (var item in input.Items)
            {
                var product = Product(s, item.ProductId); var quantity = ConvertQuantity(item.Quantity, item.Unit, product.Unit);
                Require(!product.Archived,"Продукт архивирован");
                Require(item.UnitCost is null || item.UnitCost is >=0 and <=1000000000,"Цена должна быть от 0 до 1 млрд");
                Require(item.UnitCost is null ? item.Currency is null : item.Currency is "RUB" or "USD" or "EUR","Для цены выберите RUB, USD или EUR; без цены валюта не задаётся");
                Require(item.ManufacturedAt is null || item.ManufacturedAt <= received, "Производство не может быть позже поступления");
                Require(item.ShelfLifeHours is null || item.ShelfLifeHours is > 0 and <= 87600, "Некорректный срок хранения");
                Require(item.ExpiresAt is null || item.ExpiryDate is null, "Передайте expiresAt или expiryDate, не оба поля");
                DateTimeOffset expiry; string basis;
                if (item.ExpiresAt is { } explicitExpiry) { expiry = explicitExpiry; basis = "explicit"; }
                else if (item.ExpiryDate is { } date)
                {
                    Require(DateOnly.TryParseExact(date, "yyyy-MM-dd", out var day), "Дата должна иметь формат yyyy-MM-dd");
                    var zone = TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone);
                    var local = day.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
                    expiry = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero); basis = "local-end-of-day";
                }
                else
                {
                    Require(item.ShelfLifeHours.HasValue, "Укажите срок хранения или дату истечения");
                    expiry = (item.ManufacturedAt ?? received).AddHours((double)item.ShelfLifeHours!.Value);
                    basis = item.ManufacturedAt.HasValue ? "manufactured" : "received";
                }
                Require(expiry > received, "Срок годности должен быть позже поступления");
                var unitCost=item.UnitCost / (item.Unit is "kg" or "l" ? 1000m : 1m);
                batches.Add(new(Id(), id, product.Id, quantity, quantity, received.ToUniversalTime(), expiry.ToUniversalTime(), item.ManufacturedAt, item.ShelfLifeHours, basis,unitCost,item.Currency));
            }
            var delivery = new Delivery(id, input.Number, created.ToUniversalTime(), received.ToUniversalTime(), batches.Select(x => x.Id).ToList());
            s.Deliveries.Add(delivery); s.Batches.AddRange(batches);
            foreach (var b in batches) s.Movements.Add(new(Id(), b.Id, b.ProductId, b.InitialQuantity, "receipt", null, now));
            s.Emit("delivery.created", now); return delivery;
        });
    public static List<Batch> Usable(State s, string productId, DateTimeOffset now)
        => s.Batches.Where(b => b.ProductId == productId && b.RemainingQuantity > 0 && b.ExpiresAt > now)
            .OrderBy(b => b.ExpiresAt).ThenBy(b => b.ReceivedAt).ThenBy(b => b.Id, StringComparer.Ordinal).ToList();
    public static decimal Available(State s, string productId, DateTimeOffset now) => Usable(s, productId, now).Sum(x => x.RemainingQuantity);
    public static int Portions(State s, Dish dish, DateTimeOffset now)
        => dish.Ingredients.Count == 0 ? 0 : (int)Math.Min(1_000_000, dish.Ingredients.Min(x => decimal.Floor(Available(s, x.ProductId, now) / x.Quantity)));
    public static List<Shortage> Missing(State s, Dictionary<string, decimal> needs, IEnumerable<string> dishes, DateTimeOffset now)
        => needs.Where(x => x.Value > Available(s, x.Key, now)).Select(x =>
        {
            var p = Product(s, x.Key); var available = Available(s, x.Key, now);
            return new Shortage(p.Id, p.Name, p.Unit, x.Value, available, x.Value - available,
                s.Dishes.Where(d => dishes.Contains(d.Id) && d.Ingredients.Any(i => i.ProductId == p.Id)).Select(d => d.Id).ToList());
        }).ToList();
    public static Order PlaceOrder(State s, OrderInput input, string key, DateTimeOffset now)
        => Once(s, "order", key, input, () =>
        {
            Require(input.Items is { Count: > 0 and <= 100 }, "Заказ должен содержать блюда");
            var needs = new Dictionary<string, decimal>();
            foreach (var item in input.Items)
            {
                Require(item.Portions is > 0 and <= 10000, "Количество порций: 1–10000");
                var dish = s.Dishes.Find(x => x.Id == item.DishId) ?? throw new DomainException("Неизвестное блюдо");
                Require(!dish.Archived,"Блюдо архивировано");
                Require(dish.Ingredients.Count > 0, "Рецептура не настроена");
                foreach (var ingredient in dish.Ingredients) needs[ingredient.ProductId] = needs.GetValueOrDefault(ingredient.ProductId) + ingredient.Quantity * item.Portions;
            }
            var shortages = Missing(s, needs, input.Items.Select(x => x.DishId), now);
            var order = new Order(Id(), now, shortages.Count > 0 ? "rejected" : "accepted", input.Items, shortages);
            s.Orders.Add(order);
            if (shortages.Count > 0)
                foreach (var shortage in shortages) s.Shortages.Add(new(Id(), order.Id, now, shortage));
            else
                foreach (var need in needs.OrderBy(x => x.Key, StringComparer.Ordinal)) Consume(s, need.Key, need.Value, now, order.Id);
            s.Emit("order." + order.Status, now); return order;
        });
    public static void Consume(State s, string productId, decimal amount, DateTimeOffset now, string? orderId = null)
    {
        foreach (var batch in Usable(s, productId, now))
        {
            var used = Math.Min(amount, batch.RemainingQuantity); amount -= used;
            s.Batches[s.Batches.FindIndex(x => x.Id == batch.Id)] = batch with { RemainingQuantity = batch.RemainingQuantity - used };
            if (orderId is not null && used > 0) s.Movements.Add(new(Id(), batch.Id, productId, -used, "order", orderId, now));
            if (amount == 0) break;
        }
        Require(amount == 0, "Нарушен инвариант доступности", 500);
    }
    public static int Expire(State s, DateTimeOffset now)
    {
        var expired = s.Batches.Where(b => b.RemainingQuantity > 0 && b.ExpiresAt <= now).ToList();
        foreach (var b in expired)
        {
            s.Movements.Add(new(Id(), b.Id, b.ProductId, -b.RemainingQuantity, "expiry", null, now));
            s.Batches[s.Batches.FindIndex(x => x.Id == b.Id)] = b with { RemainingQuantity = 0 };
        }
        if (expired.Count > 0) s.Emit("expiry.written-off", now);
        return expired.Count;
    }
    public static void ValidateSettings(Settings settings)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(settings.Timezone); } catch { throw new DomainException("Неизвестный часовой пояс"); }
        Require(settings.WarningHours is > 0 and <= 8760 && settings.DemandWindowDays is >= 1 and <= 90 && settings.PlanningHours is >= 1 and <= 720
            && settings.LeadTimeHours is >= 0 and <= 720 && settings.SafetyFactor is >= 0 and <= 5 && settings.ForecastHours is >= 1 and <= 720, "Некорректные настройки");
        Require(settings.OpenHour is >=0 and <=23 && settings.CloseHour>settings.OpenHour && settings.CloseHour<=24,"Расписание: открытие 0–23, закрытие позже открытия до 24");
        Require(settings.OpenDays is null || settings.OpenDays.Count>0 && settings.OpenDays.All(d=>d is >=0 and <=6) && settings.OpenDays.Distinct().Count()==settings.OpenDays.Count,"Дни работы: 0 (воскресенье) – 6");
        Require(settings.MinimumHistoryDays is >=1 and <=90 && settings.MinimumHistoryOrders is >=1 and <=10000,"Некорректный минимум истории");
        Require(settings.ManualDailyDemand is null || settings.ManualDailyDemand.All(x=>x.Value is >=0 and <=10000),"Ручной спрос: 0–10000 порций в день");
    }
}
