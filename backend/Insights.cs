using System.Text.Json;

namespace Flagman;

public record RecommendationReason(string BatchId, string ProductName, decimal Quantity, string Unit, DateTimeOffset ExpiresAt, decimal HoursLeft);
public record Recommendation(string DishId, string DishName, decimal Score, int AvailablePortions, List<RecommendationReason> Reasons);
public record SalePlan(string DishId, string DishName, int Portions, List<RecommendationReason> Reasons);
public record Procurement(string ProductId, string Name, string Unit, decimal DailyDemand, decimal Target, decimal UsableAtArrival, decimal Quantity, DateTimeOffset NeededAt, string Basis);
public record Forecast(string DishId, string DishName, DateTimeOffset? StopAt, string Reason, decimal DailyDemand, bool HasHistory);
public static class Insights
{
    static State Clone(State s) => JsonSerializer.Deserialize<State>(JsonSerializer.Serialize(s, Store.Json), Store.Json)!;
    static Recommendation Rate(State s, Dish dish, DateTimeOffset now)
    {
        var reasons = new List<RecommendationReason>(); decimal score = 0;
        var portions = Inventory.Portions(s, dish, now);
        if (portions == 0) return new(dish.Id, dish.Name, 0, 0, []);
        foreach (var ingredient in dish.Ingredients)
        {
            var amount = ingredient.Quantity; var p = Inventory.Product(s, ingredient.ProductId);
            foreach (var batch in Inventory.Usable(s, p.Id, now))
            {
                var used = Math.Min(amount, batch.RemainingQuantity); amount -= used;
                var hours = (decimal)(batch.ExpiresAt - now).TotalHours;
                if (hours <= Math.Min(p.WarningHours, s.Settings.WarningHours) && used > 0)
                {
                    // Dimensionless score; urgency rises strictly toward expiration.
                    score += used / batch.RemainingQuantity * (1 + s.Settings.WarningHours / (hours + 0.25m));
                    reasons.Add(new(batch.Id, p.Name, used, p.Unit, batch.ExpiresAt, decimal.Round(hours, 2)));
                }
                if (amount == 0) break;
            }
        }
        return new(dish.Id, dish.Name, decimal.Round(score, 6), portions, reasons);
    }
    public static (List<Recommendation> Ranking, List<SalePlan> Plan) Recommendations(State s, DateTimeOffset now)
    {
        var ranking = s.Dishes.Where(d=>!d.Archived).Select(d => Rate(s, d, now)).Where(x => x.Score > 0).OrderByDescending(x => x.Score).ThenBy(x => x.DishId).ToList();
        var virtualStock = Clone(s); var plan = new List<SalePlan>();
        // Re-score after every dish to account for ingredient competition.
        var candidates = s.Dishes.ToList();
        while (candidates.Count > 0)
        {
            var best = candidates.Select(d => Rate(virtualStock, d, now)).Where(x => x.Score > 0).OrderByDescending(x => x.Score).ThenBy(x => x.DishId).FirstOrDefault();
            if (best is null) break;
            var dish = candidates.Find(d => d.Id == best.DishId)!; candidates.Remove(dish);
            var portions = 0; var reasons = new Dictionary<string, RecommendationReason>();
            while (portions < 100)
            {
                var rate = Rate(virtualStock, dish, now); if (rate.Score <= 0) break;
                foreach (var r in rate.Reasons) reasons[r.BatchId] = reasons.TryGetValue(r.BatchId, out var previous) ? previous with { Quantity = previous.Quantity + r.Quantity } : r;
                foreach (var ingredient in dish.Ingredients) Inventory.Consume(virtualStock, ingredient.ProductId, ingredient.Quantity, now);
                portions++;
            }
            if (portions > 0) plan.Add(new(dish.Id, dish.Name, portions, reasons.Values.ToList()));
        }
        return (ranking, plan);
    }
    public static Dictionary<string, decimal> Demand(State s, DateTimeOffset now)
    {
        var start = now.AddDays(-s.Settings.DemandWindowDays);
        return s.Orders.Where(o => o.Status == "accepted" && o.CreatedAt >= start && o.CreatedAt <= now).SelectMany(o => o.Items)
            .GroupBy(i => i.DishId).ToDictionary(g => g.Key, g => g.Sum(i => (decimal)i.Portions) / s.Settings.DemandWindowDays);
    }
    public static List<Procurement> Purchases(State s, DateTimeOffset now)
    {
        var demand = Demand(s, now); var arrival = now.AddHours(s.Settings.LeadTimeHours);
        var items = new List<Procurement>();
        foreach (var p in s.Products.Where(p=>!p.Archived))
        {
            var daily = s.Dishes.Sum(d => demand.GetValueOrDefault(d.Id) * d.Ingredients.Where(i => i.ProductId == p.Id).Sum(i => i.Quantity));
            var target = daily * (s.Settings.PlanningHours + s.Settings.LeadTimeHours) / 24m * (1 + s.Settings.SafetyFactor);
            var usable = s.Batches.Where(b => b.ProductId == p.Id && b.ExpiresAt > arrival).Sum(b => b.RemainingQuantity);
            var minimum = s.Dishes.SelectMany(d => d.Ingredients).Where(i => i.ProductId == p.Id).Select(i => i.Quantity).DefaultIfEmpty(0).Max();
            // Without sales history, show only the operational deficit to restore one portion.
            if (daily == 0) target = minimum;
            var quantity = Math.Max(0, target - usable);
            if (quantity > 0) items.Add(new(p.Id, p.Name, p.Unit, decimal.Round(daily, 3), decimal.Round(target, 3), usable,
                decimal.Ceiling(quantity * 1000) / 1000, arrival, daily > 0 ? "История принятых заказов; равномерный спрос" : "Нет истории: запас для одной порции каждого блюда по отдельности"));
        }
        return items.OrderByDescending(x => x.Quantity > 0).ToList();
    }
    public static List<Forecast> Forecasts(State s, DateTimeOffset now)
    {
        var demand = Demand(s, now); var virtualStock = Clone(s);
        var productRates = s.Products.ToDictionary(p => p.Id, p => s.Dishes.Sum(d => demand.GetValueOrDefault(d.Id) / 24m * d.Ingredients.Where(i => i.ProductId == p.Id).Sum(i => i.Quantity)));
        var results = new Dictionary<string, Forecast>(); var end = now.AddHours(s.Settings.ForecastHours); var at = now;
        void Capture(DateTimeOffset time)
        {
            foreach (var dish in s.Dishes.Where(d=>!d.Archived).Where(d => !results.ContainsKey(d.Id)))
            {
                if (Inventory.Portions(virtualStock, dish, time) == 0)
                    results[dish.Id] = new(dish.Id, dish.Name, time, time == now ? "Уже в стоп-листе" : "Истечение партии или расход при равномерном спросе", demand.GetValueOrDefault(dish.Id), demand.ContainsKey(dish.Id));
            }
        }
        Capture(now);
        // Event-driven continuous FEFO model: expiration and one-portion thresholds.
        // Step bounds avoid a phantom exact forecast when no demand was measured.
        for (var iteration = 0; at < end && iteration < 10000; iteration++)
        {
            var next = end;
            foreach (var batch in virtualStock.Batches.Where(b => b.RemainingQuantity > 0 && b.ExpiresAt > at))
                if (batch.ExpiresAt < next) next = batch.ExpiresAt;
            foreach (var p in s.Products)
            {
                var rate = productRates[p.Id]; if (rate <= 0) continue;
                var usable = Inventory.Usable(virtualStock, p.Id, at); if (usable.Count == 0) continue;
                var exhaustAt = at.AddHours((double)(usable[0].RemainingQuantity / rate)); if (exhaustAt < next) next = exhaustAt;
                var available = usable.Sum(x => x.RemainingQuantity);
                foreach (var dish in s.Dishes.Where(d=>!d.Archived).Where(d => !results.ContainsKey(d.Id)))
                    foreach (var ingredient in dish.Ingredients.Where(i => i.ProductId == p.Id))
                    {
                        if (available <= ingredient.Quantity)
                        {
                            results[dish.Id] = new(dish.Id, dish.Name, at, "Граница одной порции при равномерном спросе", demand.GetValueOrDefault(dish.Id), demand.ContainsKey(dish.Id));
                        }
                        else
                        {
                            var threshold = at.AddHours((double)((available - ingredient.Quantity) / rate)); if (threshold < next) next = threshold;
                        }
                    }
            }
            if (next <= at) next = at.AddTicks(1);
            var elapsed = (decimal)(next - at).TotalHours;
            foreach (var p in s.Products)
            {
                var consumption = Math.Min(Inventory.Available(virtualStock, p.Id, at), elapsed * productRates[p.Id]);
                if (consumption > 0) Inventory.Consume(virtualStock, p.Id, consumption, at);
            }
            at = next;
            // Clamp tiny decimal/date conversion residue at exact portion thresholds.
            foreach (var dish in s.Dishes.Where(d=>!d.Archived).Where(d => !results.ContainsKey(d.Id)))
                if (dish.Ingredients.Any(i => productRates[i.ProductId] > 0 && Inventory.Available(virtualStock, i.ProductId, at) <= i.Quantity + 0.0000001m))
                    results[dish.Id] = new(dish.Id, dish.Name, at, "Граница одной порции при равномерном спросе", demand.GetValueOrDefault(dish.Id), demand.ContainsKey(dish.Id));
            Capture(at);
        }
        return s.Dishes.Where(d=>!d.Archived).Select(d => results.GetValueOrDefault(d.Id) ?? new(d.Id, d.Name, null,
            demand.ContainsKey(d.Id) ? "В пределах горизонта стоп-лист не ожидается" : "Недостаточно истории; истечение в горизонте не закрывает блюдо", demand.GetValueOrDefault(d.Id), demand.ContainsKey(d.Id))).ToList();
    }
    public static object Analytics(State s, DateTimeOffset from, DateTimeOffset to)
    {
        Inventory.Require(to >= from, "Конец периода раньше начала");
        var movements = s.Movements.Where(m => m.At >= from && m.At <= to).ToList();
        var shortages = s.Shortages.Where(x => x.At >= from && x.At <= to).ToList();
        return new {
            from, to,
            products = s.Products.Select(p => new { p.Id, p.Name, p.Unit,
                consumed = -movements.Where(m => m.ProductId == p.Id && m.Kind == "order").Sum(m => m.Quantity),
                wasted = -movements.Where(m => m.ProductId == p.Id && m.Kind == "expiry").Sum(m => m.Quantity),
                shortageCount = shortages.Count(x => x.Detail.ProductId == p.Id),
                shortageQuantity = shortages.Where(x => x.Detail.ProductId == p.Id).Sum(x => x.Detail.Missing),
                affectedDishes = shortages.Where(x => x.Detail.ProductId == p.Id).SelectMany(x => x.Detail.DishIds).Distinct().ToList() }),
            ordersAccepted = s.Orders.Count(o => o.CreatedAt >= from && o.CreatedAt <= to && o.Status == "accepted"),
            ordersRejected = s.Orders.Count(o => o.CreatedAt >= from && o.CreatedAt <= to && o.Status == "rejected"),
            lossBatches = movements.Where(m => m.Kind == "expiry").Select(m => m.BatchId).Distinct().Count(),
            daily = Enumerable.Range(0, Math.Min(90, (int)Math.Ceiling((to - from).TotalDays) + 1)).Select(i => {
                var day = from.Date.AddDays(i);
                return new { day, accepted = s.Orders.Count(o => o.CreatedAt.UtcDateTime.Date == day && o.CreatedAt >= from && o.CreatedAt <= to && o.Status == "accepted"),
                    rejected = s.Orders.Count(o => o.CreatedAt.UtcDateTime.Date == day && o.CreatedAt >= from && o.CreatedAt <= to && o.Status == "rejected") }; })
        };
    }
    public static object Snapshot(State s, DateTimeOffset now, Dictionary<string,int>? totals = null)
    {
        var recommendations = Recommendations(s, now);
        return new { now, revision = s.Revision, settings = s.Settings,
            products = s.Products.Select(p => new { p.Id, p.Name, p.Unit, p.WarningHours, p.Archived,
                physical = s.Batches.Where(b => b.ProductId == p.Id).Sum(b => b.RemainingQuantity),
                usable = Inventory.Available(s, p.Id, now),
                expired = s.Batches.Where(b => b.ProductId == p.Id && b.ExpiresAt <= now).Sum(b => b.RemainingQuantity),
                expiring = s.Batches.Where(b => b.ProductId == p.Id && b.ExpiresAt > now && b.ExpiresAt <= now.AddHours((double)Math.Min(p.WarningHours, s.Settings.WarningHours))).Sum(b => b.RemainingQuantity) }),
            dishes = s.Dishes.Select(d => new { d.Id, d.Name, d.Category, d.Ingredients, d.Archived, portions = d.Archived ? 0 : Inventory.Portions(s, d, now),
                shortages = Inventory.Missing(s, d.Ingredients.ToDictionary(i => i.ProductId, i => i.Quantity), new[] { d.Id }, now) }),
            batches = s.Batches.OrderByDescending(b => b.RemainingQuantity > 0).ThenBy(b => b.ExpiresAt).Take(500).Select(b => new { b.Id, b.DeliveryId, b.ProductId, b.InitialQuantity, b.RemainingQuantity, b.ReceivedAt, b.ExpiresAt, b.ManufacturedAt, b.ShelfLifeHours, b.ExpiryBasis,
                status = b.RemainingQuantity == 0 ? "empty" : b.ExpiresAt <= now ? "expired" : b.ExpiresAt <= now.AddHours((double)Math.Min(Inventory.Product(s,b.ProductId).WarningHours, s.Settings.WarningHours)) ? "warning" : "fresh" }),
            deliveries = s.Deliveries.OrderByDescending(x => x.CreatedAt).Take(100), orders = s.Orders.OrderByDescending(x => x.CreatedAt).Take(100),
            movements = s.Movements.OrderByDescending(x => x.At).Take(100), recommendations = recommendations.Ranking, salePlan = recommendations.Plan,
            procurement = Purchases(s, now), forecasts = Forecasts(s, now), analytics = Analytics(s, now.AddDays(-s.Settings.DemandWindowDays), now),
            totals = new { batches = totals?.GetValueOrDefault("batches") ?? s.Batches.Count, deliveries = totals?.GetValueOrDefault("deliveries") ?? s.Deliveries.Count, orders = totals?.GetValueOrDefault("orders") ?? s.Orders.Count, movements = totals?.GetValueOrDefault("movements") ?? s.Movements.Count },
            warning = "Прогноз предполагает равномерный спрос. История принятых заказов может занижать спрос во время дефицита. Количества разных единиц не суммируются." };
    }
}
