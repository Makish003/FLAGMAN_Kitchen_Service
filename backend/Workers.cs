namespace Flagman;
public sealed class Generator(Store store)
{
    readonly object gate = new();
    bool running; int seed = 42, interval = 5, index, nextIndex; DateTimeOffset next; string? error;
    public object Status { get { lock(gate) return new { running, seed, intervalSeconds = interval, index, nextIndex, error }; } }
    public void Start(GeneratorInput input)
    {
        Inventory.Require(input.IntervalSeconds is >= 1 and <= 60, "Интервал: 1–60 секунд");
        lock(gate) {
            Inventory.Require(!running, "Генератор уже запущен", 409);
            nextIndex = store.Read(s => s.Requests.Select(r => r.Id).Where(id => id.StartsWith($"wf:demo-generator:delivery:generator-{input.Seed}-", StringComparison.Ordinal) || id.StartsWith($"wf:demo-generator:order:generator-{input.Seed}-", StringComparison.Ordinal))
                .Select(id => int.TryParse(id[(id.LastIndexOf('-') + 1)..], out var step) ? step + 1 : 0).DefaultIfEmpty(0).Max());
            seed = input.Seed; interval = input.IntervalSeconds; index = 0; next = DateTimeOffset.UtcNow; error = null; running = true;
        }
    }
    public void Stop() { lock(gate) running = false; }
    public void Tick()
    {
        lock(gate)
        {
            if (!running || DateTimeOffset.UtcNow < next) return;
            try {
                store.Write(s => {
                    var now = s.Now(DateTimeOffset.UtcNow);
                    var result = Demo.Generate(s, seed, nextIndex, now);
                    var entry = result switch {
                        DeliveryRequest d => new GeneratorEvent(Inventory.Id(),now,seed,nextIndex,"delivery",d.Id,"submitted","Ожидает приёмки: "+d.Number),
                        OrderRequest o => new GeneratorEvent(Inventory.Id(),now,seed,nextIndex,"order",o.Id,"submitted","Ожидает решения менеджера"),
                        Delivery d => new GeneratorEvent(Inventory.Id(), now, seed, nextIndex, "delivery", d.Id, "accepted", $"Поставка {d.Number}: " + string.Join(", ", s.Batches.Where(b => d.BatchIds.Contains(b.Id)).Select(b => $"{s.Products.Find(p => p.Id == b.ProductId)!.Name} — {b.InitialQuantity} {s.Products.Find(p => p.Id == b.ProductId)!.Unit}"))),
                        Order o => new GeneratorEvent(Inventory.Id(), now, seed, nextIndex, "order", o.Id, o.Status, string.Join(", ", o.Items.Select(i => $"{s.Dishes.Find(d => d.Id == i.DishId)!.Name} — {i.Portions} порц.")) + (o.Status == "accepted" ? "; ингредиенты списаны по FEFO" : "; не хватает: " + string.Join(", ", o.Shortages.Select(x => $"{x.ProductName} — {x.Missing} {x.Unit}")))),
                        _ => new GeneratorEvent(Inventory.Id(), now, seed, nextIndex, nextIndex % 3 == 0 ? "delivery" : "order", null, "replayed", "Ранее обработанное событие; повторного изменения склада нет")
                    };
                    s.GeneratorEvents.Add(entry);
                    s.Emit("generator.processed", now);
                    return result;
                });
                index++; nextIndex++; next = DateTimeOffset.UtcNow.AddSeconds(interval);
            }
            catch (Exception ex) {
                error = ex.Message; running = false;
                store.Write(s => { var now = s.Now(DateTimeOffset.UtcNow); s.GeneratorEvents.Add(new(Inventory.Id(), now, seed, nextIndex, nextIndex % 3 == 0 ? "delivery" : "order", null, "error", error)); s.Emit("generator.failed", now); return 0; });
            }
        }
    }
}
public sealed class Monitor(Store store, Generator generator, ILogger<Monitor> logger) : BackgroundService
{
    public static int RefreshExpiryStatus(State s,DateTimeOffset now)
    {
        var known=s.WarningSignature.Split(',',StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.Ordinal);
        var changed=s.Batches.Where(b=>b.RemainingQuantity>0&&b.ExpiresAt<=now&&!known.Contains(b.Id+":expired")).ToList();
        if(changed.Count>0){Telemetry.LastExpiryLagMs=changed.Max(b=>(now-b.ExpiresAt).TotalMilliseconds);Telemetry.ExpiryLag.Record(Telemetry.LastExpiryLagMs);}
        return Inventory.Expire(s,now);
    }
    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        using var lease = await store.AcquireWriter(cancellationToken);
        store.Write(s => RefreshExpiryStatus(s, s.Now(DateTimeOffset.UtcNow)));
        await base.StartAsync(cancellationToken);
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
                using var lease = await store.AcquireWriter(stoppingToken);
                store.Write(s => {
                    var now = s.Now(DateTimeOffset.UtcNow);
                    RefreshExpiryStatus(s,now);
                    return 0;
                });
                generator.Tick();
                if (DateTimeOffset.UtcNow.Second == 0) store.RetainEvents();
                Telemetry.MonitorSuccess = DateTimeOffset.UtcNow; Telemetry.MonitorError = null;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { Telemetry.Errors.Add(1); Telemetry.MonitorError = "Monitor failed; inspect server logs"; if (ex is Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 5 }) Telemetry.Busy.Add(1); logger.LogError(ex, "Inventory monitor failed; retrying next tick"); }
        }
    }
}
