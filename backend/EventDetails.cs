using System.Globalization;

namespace Flagman;

// Descriptions are captured with the transaction, before related documents can change.
public static class EventDetails
{
    static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");
    static string Number(decimal value) => value.ToString("0.##", Ru);
    static string Unit(string unit) => unit switch { "g" => "г", "kg" => "кг", "ml" => "мл", "l" => "л", "pcs" => "шт.", _ => unit };
    static string Quantity(decimal value, string unit) => $"{Number(value)} {Unit(unit)}";
    static string ProductName(State s, string id) => s.Products.Find(p => p.Id == id)?.Name ?? $"Продукт #{id}";
    static string ProductQuantity(State s, string id, decimal value, string? unit = null) => $"{ProductName(s, id)} — {Quantity(value, unit ?? s.Products.Find(p => p.Id == id)?.Unit ?? "")}";
    static string UserName(State s, string? id) => s.Users.Find(u => u.Id == id)?.Name ?? "сотрудник";
    static string Dishes(State s, List<OrderItem> items) => string.Join("; ", items.Select(i => $"{s.Dishes.Find(d => d.Id == i.DishId)?.Name ?? "Блюдо #" + i.DishId} — {i.Portions} порц."));
    static string Shortages(List<Shortage>? items) => items is { Count: > 0 } ? "; не хватает: " + string.Join("; ", items.Select(i => $"{i.ProductName} — {Quantity(i.Missing, i.Unit)}")) : "";
    static string Reason(string? value) => string.IsNullOrWhiteSpace(value) ? "" : "; причина: " + (value == "expired" ? "истёк срок годности" : value);
    static string Date(State s, DateTimeOffset value) => TimeZoneInfo.ConvertTime(value, TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone)).ToString("dd.MM.yyyy HH:mm", Ru);

    public static string? Describe(State s, string type, string? id, DateTimeOffset at, bool historical = false)
    {
        if (type.StartsWith("delivery-request."))
        {
            var r = s.DeliveryRequests.Find(x => x.Id == id);
            if (r == null) return null;
            var decision = type != "delivery-request.submitted";
            var lines = r.Items.Select(l => {
                var accepted = decision ? r.Acceptance?.Find(a => a.LineId == l.Id) : null;
                var text = ProductQuantity(s, l.ProductId, l.Quantity, l.Unit);
                if (accepted != null) text += $"; принято {Quantity(accepted.AcceptedQuantity, l.Unit)} из {Quantity(l.Quantity, l.Unit)}" + Reason(accepted.Reason);
                return text + "; годен до " + Date(s, accepted?.VerifiedExpiresAt ?? l.ExpiresAt);
            });
            return $"Поставка «{r.Number}»: " + string.Join("; ", lines);
        }
        if (type == "delivery.created")
        {
            var d = s.Deliveries.Find(x => x.Id == id);
            return d == null ? null : $"Поставка «{d.Number}»: " + string.Join("; ", s.Batches.Where(b => d.BatchIds.Contains(b.Id)).Select(b => ProductQuantity(s, b.ProductId, b.InitialQuantity) + "; годен до " + Date(s, b.ExpiresAt)));
        }
        if (type.StartsWith("order-request."))
        {
            var r = s.OrderRequests.Find(x => x.Id == id);
            if (r == null) return null;
            var text = Dishes(s, r.Items);
            if (type == "order-request.rejected" || type == "order-request.decided" && r.Reason != null || type == "order-request.submitted" && !historical && r.Status == "rejected") text += Reason(r.Reason) + Shortages(r.Shortages);
            return text;
        }
        if (type is "order.accepted" or "order.rejected")
        {
            var o = s.Orders.Find(x => x.Id == id);
            if (o == null) return null;
            var text = Dishes(s, o.Items) + Shortages(o.Shortages);
            var movements = s.Movements.Where(m => m.OrderId == id && m.Quantity < 0).GroupBy(m => m.ProductId).ToList();
            if (movements.Count > 0) text += "; списано: " + string.Join("; ", movements.Select(g => ProductQuantity(s, g.Key, -g.Sum(m => m.Quantity))));
            return text;
        }
        if (type.StartsWith("procurement."))
        {
            var r = s.ProcurementRequests.Find(x => x.Id == id);
            if (r == null) return null;
            return $"Поставщик: {UserName(s, r.SupplierId)}; " + string.Join("; ", r.Items.Select(l => {
                var response = type == "procurement.responded" ? r.Response?.Find(x => x.LineId == l.Id) : null;
                return ProductQuantity(s, l.ProductId, l.Quantity, l.Unit) + (response == null ? "" : $"; подтверждено {Quantity(response.ConfirmedQuantity, l.Unit)} из {Quantity(l.Quantity, l.Unit)}" + Reason(response.Reason));
            })) + (string.IsNullOrWhiteSpace(r.Comment) ? "" : "; комментарий: " + r.Comment);
        }
        if (type.StartsWith("batch."))
        {
            var b = s.Batches.Find(x => x.Id == id);
            if (b == null) return null;
            if (type == "batch.written-off")
            {
                var m = s.Movements.FindLast(x => x.BatchId == id && x.Kind is "expiry" or "write_off" && x.At <= at);
                return m == null ? null : ProductQuantity(s, b.ProductId, -m.Quantity) + Reason(m.Reason);
            }
            return ProductQuantity(s, b.ProductId, historical ? b.InitialQuantity : b.RemainingQuantity) + (historical ? " (исходная партия)" : " в остатке") + "; годен до " + Date(s, b.ExpiresAt);
        }
        if (type is "catalog.changed" or "catalog.archived")
        {
            var p = s.Products.Find(x => x.Id == id);
            if (p != null) return $"Продукт «{p.Name}»; единица учёта: {Unit(p.Unit)}";
            var d = s.Dishes.Find(x => x.Id == id);
            return d == null ? null : $"Блюдо «{d.Name}»";
        }
        if (type == "recipe.changed")
        {
            var d = s.Dishes.Find(x => x.Id == id);
            return d == null ? null : $"Блюдо «{d.Name}»; " + string.Join("; ", d.Ingredients.Select(i => ProductQuantity(s, i.ProductId, i.Quantity)));
        }
        if (type.StartsWith("session."))
        {
            var u = s.Users.Find(x => x.Id == id);
            return u == null ? null : $"{u.Name}; логин: {u.Login}";
        }
        if (type == "account.saved")
        {
            var u = s.Users.Find(x => x.Id == id);
            if (u == null) return null;
            var role = u.Role switch { "admin" => "администратор", "manager" => "менеджер", "supplier" => "поставщик", "waiter" => "официант", "cook" => "повар", _ => u.Role };
            return $"{u.Name}; логин: {u.Login}; роль: {role}; {(u.Active ? "активен" : "отключён")}" + (u.Role == "manager" ? $"; страниц в меню: {u.VisiblePages?.Count ?? AccessService.ManagerPages.Length}" : "");
        }
        if (type.StartsWith("key."))
        {
            var key = s.Credentials.Find(x => x.Id == id);
            return key == null ? null : $"Аккаунт: {UserName(s, key.UserId)}; {(type == "key.issued" ? "выдан" : "отозван")} API-ключ";
        }
        if (type is "offer.changed" or "offer.updated")
        {
            var o = s.OfferOverrides.Find(x => x.Id == id);
            var d = s.Dishes.Find(x => x.Id == id);
            if (o == null || d == null) return null;
            var visibility = o.Visibility switch { "show" => "показывать", "hide" => "скрыть", _ => "автоматически" };
            return $"Блюдо «{d.Name}»; публикация: {visibility}; акцент: {(o.Emphasized ? "да" : "нет")}" + (string.IsNullOrWhiteSpace(o.WaiterNote) ? "" : "; официанту: " + o.WaiterNote);
        }
        if (type == "settings.changed") return historical ? null : $"Часовой пояс: {s.Settings.Timezone}; предупреждать за {Number(s.Settings.WarningHours)} ч; планирование на {s.Settings.PlanningHours} ч; поставка через {s.Settings.LeadTimeHours} ч";
        if (type == "time.changed") return historical ? null : $"Время ресторана: {Date(s, at)}; партий с истёкшим сроком: {s.Batches.Count(b => b.RemainingQuantity > 0 && b.ExpiresAt <= at)}";
        if(type is "generator.processed" or "generator.failed") {
            var entry=s.GeneratorEvents.FindLast(e=>e.At==at && (type!="generator.failed" || e.Status=="error"));
            return entry?.Summary;
        }
        return type switch {
            "generator.started" => "Запущено автоматическое создание демонстрационных поставок и заказов",
            "generator.stopped" => "Автоматическое создание демонстрационных поставок и заказов остановлено",
            "demo.enriched" => "Дополнены демонстрационные данные ресторана",
            _ => null
        };
    }

    public static string Historical(State s, DomainEvent e)
    {
        var description = Describe(s, e.Type, e.EntityId, e.At, historical: true);
        if (!string.IsNullOrWhiteSpace(description)) return "По сохранённому документу: " + description;
        return string.IsNullOrWhiteSpace(e.Summary) ? "Подробности не сохранялись в старой версии приложения." : e.Summary + "; дополнительные подробности не сохранялись.";
    }
}
