using Flagman;
using Microsoft.Data.Sqlite;
using System.Text.Json;

public static class EventDetailsChecks
{
    public static int Run()
    {
        var now = DateTimeOffset.Parse("2026-10-15T10:00:00Z");
        var path = Path.Combine(Path.GetTempPath(), "flagman-event-details-" + Guid.NewGuid() + ".db");
        try
        {
            var store = new Store(path);
            string deliveryId = "", batchId = "", submittedSummary = "", keyToken = "";
            store.Write(s => {
                AccessService.Bootstrap(s, "secret-admin-password");
                var admin = new Actor(s.Users.Single().Id, "admin");
                var supplier = AccessService.SaveAccount(s, null, new("supplier", "Поставщик овощей", "supplier", "secret-supplier-password"), admin, now);
                keyToken = AccessService.IssueKey(s, supplier.Id, admin, now).Token;
                Inventory.AddProduct(s, new("p", "Томаты", "g"), now);
                Inventory.SaveDish(s, new("d", "Салат", "Холодные блюда", [new("p", 500)]), now);
                var procurement = WorkflowService.CreateProcurement(s, new(supplier.Id, [new("line", "p", 10, "kg")]), admin, "procure", now);
                var response = WorkflowService.RespondProcurement(s, procurement.Id, new(1, [new("line", 8, now.AddHours(2), Reason:"Нет нужного объёма")]), new(supplier.Id, "supplier"), "respond", now);
                var request = s.DeliveryRequests.Single();
                deliveryId = request.Id;
                // Supplied quantity is a snapshot: later acceptance must not enter this description.
                s.Emit("delivery-request.submitted", now, request.Id);
                submittedSummary = s.Events.Last().Summary!;
                WorkflowService.AcceptDelivery(s, deliveryId, new(1, [new(request.Items.Single().Id, 7, Reason:"Повреждена упаковка")]), admin, "accept", now);
                batchId = s.Batches.Single().Id;
                var accepted = s.Events.Last().Summary!;
                WorkflowChecks.Check(accepted.Contains("принято 7 кг из 8 кг") && accepted.Contains("Повреждена упаковка"), "Acceptance details and reason");
                WorkflowChecks.Check(s.Events.Single(e => e.Type == "procurement.responded").Summary!.Contains("подтверждено 8 кг из 10 кг"), "Supplier response details");
                var ready = WorkflowService.SubmitOrder(s, new([new("d", 2)]), admin, "order", now);
                WorkflowService.DecideOrder(s, ready.Id, new(1, "accept"), admin, "ready", now);
                WorkflowService.ServeOrder(s, ready.Id, new(2), admin, "serve", now);
                WorkflowChecks.Check(s.Events.Single(e => e.Type == "order-request.ready").Summary!.Contains("Салат — 2 порц."), "Ready order composition");
                WorkflowChecks.Check(s.Events.Single(e => e.Type == "order.accepted").Summary!.Contains("списано: Томаты — 1000 г"), "Consumption details");
                var rejected = WorkflowService.SubmitOrder(s, new([new("d", 1)]), admin, "rejected", now);
                WorkflowService.DecideOrder(s, rejected.Id, new(1, "reject", "Сломана плита", "equipment_failure"), admin, "reject", now);
                WorkflowChecks.Check(s.Events.Last().Summary!.Contains("Сломана плита"), "Order rejection reason");
                Inventory.Expire(s, now.AddHours(3));
                var expiry = s.Events.Single(e => e.Type == "batch.expired").Summary!;
                Inventory.WriteOff(s, batchId, new("expired"), admin, "writeoff", now.AddHours(3));
                WorkflowChecks.Check(expiry.Contains("6000 г в остатке") && s.Events.Last().Summary!.Contains("6000 г; причина: истёк срок годности"), "Expiry and writeoff quantities");
                WorkflowChecks.Check(s.Events.All(e => !string.IsNullOrWhiteSpace(e.Summary)), "Every emitted event has details");
                var descriptions = string.Join("\n", s.Events.Select(e => e.Summary));
                WorkflowChecks.Check(!descriptions.Contains("secret-") && !descriptions.Contains(keyToken) && !descriptions.Contains(supplier.PasswordHash), "Descriptions exclude credentials");
                WorkflowChecks.Check(s.Events.Single(e => e.Type == "delivery-request.submitted").Summary == submittedSummary && !submittedSummary.Contains("принято"), "Submitted event remains unchanged");
                return 0;
            });
            store = new Store(path);
            var receiptEvents = JsonSerializer.SerializeToElement(store.History("eventLog", 1, 100, "Повреждена упаковка", "delivery"), Store.Json);
            WorkflowChecks.Check(receiptEvents.GetProperty("total").GetInt32() == 1, "Search descriptions after restart");
            // Recreate both versions of legacy records, including an archived-only entry.
            using (var db = new SqliteConnection("Data Source=" + path))
            {
                db.Open(); using var cmd = db.CreateCommand();
                cmd.CommandText = "UPDATE eventLog SET payload=json_remove(payload,'$.summary','$.detailsVersion') WHERE json_extract(payload,'$.entityId')=$id; UPDATE events SET payload=json_remove(payload,'$.summary','$.detailsVersion') WHERE json_extract(payload,'$.entityId')=$id; INSERT INTO eventLog(id,payload) VALUES('999999',$missing);";
                cmd.Parameters.AddWithValue("$id", deliveryId);
                cmd.Parameters.AddWithValue("$missing", JsonSerializer.Serialize(new DomainEvent(999999, "order.accepted", now), Store.Json));
                cmd.ExecuteNonQuery();
            }
            var revision = store.Metadata().Revision;
            store = new Store(path);
            var restored = JsonSerializer.SerializeToElement(store.History("eventLog", 1, 100, "Повреждена упаковка", "delivery"), Store.Json);
            var summary = restored.GetProperty("items")[0].GetProperty("summary").GetString()!;
            WorkflowChecks.Check(summary.StartsWith("По сохранённому документу:") && summary.Contains("принято 7 кг из 8 кг"), "Legacy details reconstructed with provenance");
            store.Write(s => { s.Emit("time.changed", now.AddHours(4)); return 0; });
            store = new Store(path);
            var again = JsonSerializer.SerializeToElement(store.History("eventLog", 1, 100, "Повреждена упаковка", "delivery"), Store.Json);
            WorkflowChecks.Check(again.GetProperty("items")[0].GetProperty("summary").GetString() == summary, "Backfill survives writes and remains idempotent");
            var missing = JsonSerializer.SerializeToElement(store.History("eventLog", 1, 100, "старой версии", "order"), Store.Json);
            WorkflowChecks.Check(missing.GetProperty("total").GetInt32() == 1, "Unrecoverable legacy event is explained honestly");
            WorkflowChecks.Check(store.Metadata().Revision == revision + 1 && store.Read(s => s.Batches.Single().RemainingQuantity) == 0, "Backfill does not mutate stock or revision");
            store.VerifyIntegrity();
            Console.WriteLine("PASS Event_details_composition_decisions_reasons_snapshots_secrets_search_legacy_backfill");
            return 1;
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var file in Directory.GetFiles(Path.GetDirectoryName(path)!, Path.GetFileName(path) + "*")) File.Delete(file);
        }
    }
}
