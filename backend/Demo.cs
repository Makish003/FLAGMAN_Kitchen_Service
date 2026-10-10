using System.Text.Json;
namespace Flagman;
public static class Demo
{
    public static void Seed(State s, DateTimeOffset now)
    {
        if (s.Products.Count > 0) return;
        foreach (var p in new[] { new Product("tomato", "Томаты", "g"), new Product("mozzarella", "Моцарелла", "g"), new Product("basil", "Базилик", "g"),
            new Product("pasta", "Паста", "g"), new Product("cream", "Сливки", "ml"), new Product("salmon", "Лосось", "g"), new Product("rice", "Рис", "g"),
            new Product("chicken", "Куриное филе", "g"), new Product("egg", "Яйца", "pcs"), new Product("lettuce", "Салат романо", "g") }) Inventory.AddProduct(s, p, now);
        foreach (var d in new[] { new Dish("caprese", "Капрезе", "Закуски", [new("tomato", 200), new("mozzarella", 120), new("basil", 10)]),
            new Dish("pasta", "Паста с томатами", "Горячие блюда", [new("pasta", 150), new("tomato", 150), new("basil", 5)]),
            new Dish("salmon", "Лосось со сливочным рисом", "Горячие блюда", [new("salmon", 180), new("rice", 120), new("cream", 60)]),
            new Dish("caesar", "Цезарь с курицей", "Салаты", [new("chicken", 150), new("lettuce", 100), new("egg", 1)]),
            new Dish("omelet", "Омлет с моцареллой", "Завтраки", [new("egg", 2), new("mozzarella", 60), new("cream", 40)]) }) Inventory.SaveDish(s, d, now);
        Inventory.Deliver(s, new("ПС-1041", [new("tomato", 2, "kg", now.AddHours(8)), new("mozzarella", 1.5m, "kg", now.AddHours(20)),
            new("basil", 150, "g", now.AddHours(12)), new("salmon", 1200, "g", now.AddHours(30)), new("cream", 2, "l", now.AddDays(4))]), "seed-1", now);
        Inventory.Deliver(s, new("ПС-1042", [new("tomato", 3, "kg", now.AddDays(7)), new("pasta", 5, "kg", now.AddDays(30)),
            new("rice", 4, "kg", now.AddDays(30)), new("chicken", 2, "kg", now.AddDays(3)), new("egg", 24, "pcs", now.AddDays(10))]), "seed-2", now);
        Inventory.PlaceOrder(s, new([new("caprese", 2), new("pasta", 3)]), "seed-order-1", now);
        Inventory.PlaceOrder(s, new([new("salmon", 1), new("omelet", 2)]), "seed-order-2", now);
        Inventory.PlaceOrder(s, new([new("caesar", 1)]), "seed-order-3", now);
        // Two independent comparison fixtures, included in the single reproducible demo seed.
        foreach(var p in new[]{new Product("compare-1","Контрольный продукт 1","g"),new Product("compare-2","Контрольный продукт 2","g"),new Product("scarce-1","Редкий продукт 1","g"),new Product("scarce-2","Редкий продукт 2","g")})Inventory.AddProduct(s,p,now);
        Inventory.SaveDish(s,new("compare-a","Контрольное A (100 / 10)","Сравнение",[new("compare-1",100),new("compare-2",10)]),now);
        Inventory.SaveDish(s,new("compare-b","Контрольное B (100 / 100)","Сравнение",[new("compare-1",100),new("compare-2",100)]),now);
        Inventory.SaveDish(s,new("scarce-a","Жадный выбор (60 / 60)","Сравнение",[new("scarce-1",60),new("scarce-2",60)]),now);
        Inventory.SaveDish(s,new("scarce-b","Улучшенный выбор (50 / 50)","Сравнение",[new("scarce-1",50),new("scarce-2",50)]),now);
        Inventory.Deliver(s,new("СРАВНЕНИЕ-42",[new("compare-1",1,"kg",now.AddHours(8),UnitCost:300,Currency:"RUB"),new("compare-2",1,"kg",now.AddHours(8),UnitCost:300,Currency:"RUB"),new("scarce-1",100,"g",now.AddHours(8)),new("scarce-2",100,"g",now.AddHours(8))]),"seed-comparison-42",now);
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
            return Inventory.Deliver(s, new($"ГЕН-{seed}-{index}", [new(p.Id, p.Unit == "pcs" ? amount * 10 : amount * 500, p.Unit, now.AddHours(hours))]), $"generator-{seed}-{index}", now);
        }
        var d = s.Dishes.OrderBy(x => x.Id, StringComparer.Ordinal).ElementAt((int)(choice % s.Dishes.Count));
        return Inventory.PlaceOrder(s, new([new(d.Id, (int)amount)]), $"generator-{seed}-{index}", now);
    }
}
