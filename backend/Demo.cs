using System.Text.Json;
namespace Flagman;
public static class Demo
{
    // Illustrative RUB prices per stored unit (g, ml or pcs), not market quotes.
    static decimal UnitCost(string productId, string unit) => productId switch {
        "tomato" => 0.25m, "mozzarella" => 0.9m, "basil" => 1.5m,
        "pasta" => 0.18m, "cream" => 0.4m, "salmon" => 1.8m,
        "rice" => 0.12m, "chicken" => 0.38m, "egg" => 12m,
        "lettuce" => 0.45m,
        "compare-1" or "compare-2" or "scarce-1" or "scarce-2" => 0.3m,
        _ => unit == "pcs" ? 20m : 0.3m
    };
    static DeliveryLine Priced(string productId, decimal quantity, string unit, DateTimeOffset expiresAt) =>
        new(productId, quantity, unit, expiresAt, UnitCost: UnitCost(productId, unit) * (unit is "kg" or "l" ? 1000m : 1m), Currency: "RUB");

    public static int FillMissingPrices(State s)
    {
        var demoDeliveries = s.Requests.Where(r => r.Id is "delivery:seed-1" or "delivery:seed-2" or "delivery:seed-comparison-42" || r.Id.StartsWith("delivery:generator-", StringComparison.Ordinal) || r.Id.StartsWith("delivery:demo-history-v1-", StringComparison.Ordinal))
            .Select(r => JsonSerializer.Deserialize<Delivery>(r.ResultJson, Store.Json)!.Id).ToHashSet();
        var updated = 0;
        for (var i = 0; i < s.Batches.Count; i++) {
            var batch = s.Batches[i];
            if (batch.UnitCost.HasValue || !demoDeliveries.Contains(batch.DeliveryId)) continue;
            var product = s.Products.Single(p => p.Id == batch.ProductId);
            s.Batches[i] = batch with { UnitCost = UnitCost(product.Id, product.Unit), Currency = "RUB" };
            updated++;
        }
        return updated;
    }
    public static bool NeedsEnrichment(State s) =>
        s.Requests.Any(r => r.Id == "delivery:seed-1") &&
        (!s.Requests.Any(r => r.Id == "delivery:demo-history-v1-1") || s.Batches.Any(b => b.UnitCost is null));

    public static int Enrich(State s, DateTimeOffset now)
    {
        var updated = FillMissingPrices(s);
        if (!s.Requests.Any(r => r.Id == "delivery:seed-1") || s.Requests.Any(r => r.Id == "delivery:demo-history-v1-1")) return updated;
        var menu = s.Dishes.Where(d => !d.Archived && d.Id is "caprese" or "pasta" or "salmon" or "caesar" or "omelet")
            .Where(d => d.Ingredients.All(i => s.Products.Any(p => p.Id == i.ProductId && !p.Archived))).ToList();
        if (menu.Count == 0) return updated;
        // Build an independent historical ledger so past sales cannot consume today's stock.
        var history = new State { Products = s.Products, Dishes = menu, Settings = s.Settings };
        for (var day = 6; day >= 1; day--) {
            var received = now.AddDays(-day);
            var orders = Enumerable.Range(0, 4).Select(slot => menu.Select(d => new OrderItem(d.Id, 1 + (day + slot) % 3)).ToList()).ToList();
            var quantities = orders.SelectMany(items => items).SelectMany(item => menu.Single(d => d.Id == item.DishId).Ingredients
                .Select(i => new { i.ProductId, Quantity = i.Quantity * item.Portions })).GroupBy(i => i.ProductId)
                .ToDictionary(g => g.Key, g => decimal.Ceiling(g.Sum(i => i.Quantity) * 1.25m));
            var lines = quantities.Select(x => Priced(x.Key, x.Value, Inventory.Product(s, x.Key).Unit, received.AddHours(12))).ToList();
            Inventory.Deliver(history, new($"ДЕМО-ИСТОРИЯ-{day}", lines), $"demo-history-v1-{day}", received);
            for (var slot = 0; slot < orders.Count; slot++)
                Inventory.PlaceOrder(history, new(orders[slot]), $"demo-history-v1-{day}-{slot}", received.AddHours(slot * 2 + 1));
            Inventory.PlaceOrder(history, new(menu.Select(d => new OrderItem(d.Id, 1000)).ToList()), $"demo-history-v1-rejected-{day}", received.AddHours(8));
            Inventory.Expire(history, received.AddHours(12));
        }
        s.Deliveries.AddRange(history.Deliveries); s.Batches.AddRange(history.Batches);
        s.Orders.AddRange(history.Orders); s.Movements.AddRange(history.Movements);
        s.Shortages.AddRange(history.Shortages); s.Requests.AddRange(history.Requests);
        s.Emit("demo.enriched", now);
        return updated + history.Deliveries.Count;
    }
    public static void Seed(State s, DateTimeOffset now)
    {
        if (s.Products.Count > 0) { Enrich(s, now); return; }
        foreach (var p in new[] { new Product("tomato", "Томаты", "g"), new Product("mozzarella", "Моцарелла", "g"), new Product("basil", "Базилик", "g"),
            new Product("pasta", "Паста", "g"), new Product("cream", "Сливки", "ml"), new Product("salmon", "Лосось", "g"), new Product("rice", "Рис", "g"),
            new Product("chicken", "Куриное филе", "g"), new Product("egg", "Яйца", "pcs"), new Product("lettuce", "Салат романо", "g") }) Inventory.AddProduct(s, p, now);
        foreach (var d in new[] { new Dish("caprese", "Капрезе", "Закуски", [new("tomato", 200), new("mozzarella", 120), new("basil", 10)]),
            new Dish("pasta", "Паста с томатами", "Горячие блюда", [new("pasta", 150), new("tomato", 150), new("basil", 5)]),
            new Dish("salmon", "Лосось со сливочным рисом", "Горячие блюда", [new("salmon", 180), new("rice", 120), new("cream", 60)]),
            new Dish("caesar", "Цезарь с курицей", "Салаты", [new("chicken", 150), new("lettuce", 100), new("egg", 1)]),
            new Dish("omelet", "Омлет с моцареллой", "Завтраки", [new("egg", 2), new("mozzarella", 60), new("cream", 40)]) }) Inventory.SaveDish(s, d, now);
        Inventory.Deliver(s, new("ПС-1041", [Priced("tomato", 2, "kg", now.AddHours(8)), Priced("mozzarella", 1.5m, "kg", now.AddHours(20)),
            Priced("basil", 150, "g", now.AddHours(12)), Priced("salmon", 1200, "g", now.AddHours(30)), Priced("cream", 2, "l", now.AddDays(4))]), "seed-1", now);
        Inventory.Deliver(s, new("ПС-1042", [Priced("tomato", 3, "kg", now.AddDays(7)), Priced("pasta", 5, "kg", now.AddDays(30)),
            Priced("rice", 4, "kg", now.AddDays(30)), Priced("chicken", 2, "kg", now.AddDays(3)), Priced("egg", 24, "pcs", now.AddDays(10))]), "seed-2", now);
        Inventory.PlaceOrder(s, new([new("caprese", 2), new("pasta", 3)]), "seed-order-1", now);
        Inventory.PlaceOrder(s, new([new("salmon", 1), new("omelet", 2)]), "seed-order-2", now);
        Inventory.PlaceOrder(s, new([new("caesar", 1)]), "seed-order-3", now);
        // Two independent comparison fixtures, included in the single reproducible demo seed.
        foreach(var p in new[]{new Product("compare-1","Контрольный продукт 1","g"),new Product("compare-2","Контрольный продукт 2","g"),new Product("scarce-1","Редкий продукт 1","g"),new Product("scarce-2","Редкий продукт 2","g")})Inventory.AddProduct(s,p,now);
        Inventory.SaveDish(s,new("compare-a","Контрольное A (100 / 10)","Сравнение",[new("compare-1",100),new("compare-2",10)]),now);
        Inventory.SaveDish(s,new("compare-b","Контрольное B (100 / 100)","Сравнение",[new("compare-1",100),new("compare-2",100)]),now);
        Inventory.SaveDish(s,new("scarce-a","Жадный выбор (60 / 60)","Сравнение",[new("scarce-1",60),new("scarce-2",60)]),now);
        Inventory.SaveDish(s,new("scarce-b","Улучшенный выбор (50 / 50)","Сравнение",[new("scarce-1",50),new("scarce-2",50)]),now);
        Inventory.Deliver(s,new("СРАВНЕНИЕ-42",[Priced("compare-1",1,"kg",now.AddHours(8)),Priced("compare-2",1,"kg",now.AddHours(8)),Priced("scarce-1",100,"g",now.AddHours(8)),Priced("scarce-2",100,"g",now.AddHours(8))]),"seed-comparison-42",now);
        Enrich(s, now);
    }
    // Explicit portable LCG: stable across .NET versions; no runtime Random dependence.
    public static uint Next(ref uint state) { state = unchecked(state * 1664525u + 1013904223u); return state; }
    public static object Generate(State s, int seed, int index, DateTimeOffset now)
    {
        var scope = index % 3 == 0 ? "delivery" : "order";
        var existing = s.Requests.Find(r => r.Id == $"{scope}:generator-{seed}-{index}");
        if (existing is not null) return JsonSerializer.Deserialize<JsonElement>(existing.ResultJson, Store.Json);
        uint random = unchecked((uint)seed); for (var i = 0; i <= index * 4; i++) Next(ref random);
        var choice = Next(ref random); var amount = 1 + Next(ref random) % 3; var hours = 12 + Next(ref random) % 72;
        if (s.Products.Count == 0 || s.Dishes.Count == 0) throw new DomainException("Сначала создайте продукты и блюда");
        if (index % 3 == 0)
        {
            var p = s.Products.OrderBy(x => x.Id, StringComparer.Ordinal).ElementAt((int)(choice % s.Products.Count));
            return Inventory.Deliver(s, new($"ГЕН-{seed}-{index}", [Priced(p.Id, p.Unit == "pcs" ? amount * 10 : amount * 500, p.Unit, now.AddHours(hours))]), $"generator-{seed}-{index}", now);
        }
        var d = s.Dishes.OrderBy(x => x.Id, StringComparer.Ordinal).ElementAt((int)(choice % s.Dishes.Count));
        return Inventory.PlaceOrder(s, new([new(d.Id, (int)amount)]), $"generator-{seed}-{index}", now);
    }
}
