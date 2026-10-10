namespace Flagman;
public sealed class Generator(Store store)
{
    readonly object gate = new();
    bool running; int seed = 42, interval = 5, index; DateTimeOffset next; string? error;
    public object Status { get { lock(gate) return new { running, seed, intervalSeconds = interval, index, error }; } }
    public void Start(GeneratorInput input)
    {
        Inventory.Require(input.IntervalSeconds is >= 1 and <= 60, "Интервал: 1–60 секунд");
        lock(gate) { Inventory.Require(!running, "Генератор уже запущен", 409); seed = input.Seed; interval = input.IntervalSeconds; index = 0; next = DateTimeOffset.UtcNow; error = null; running = true; }
    }
    public void Stop() { lock(gate) running = false; }
    public void Tick()
    {
        lock(gate)
        {
            if (!running || DateTimeOffset.UtcNow < next) return;
            try { store.Write(s => Demo.Generate(s, seed, index, s.Now(DateTimeOffset.UtcNow))); index++; next = DateTimeOffset.UtcNow.AddSeconds(interval); }
            catch (Exception ex) { error = ex.Message; running = false; }
        }
    }
}
public sealed class Monitor(Store store, Generator generator, ILogger<Monitor> logger) : BackgroundService
{
    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        using var lease = await store.AcquireWriter(cancellationToken);
        store.WriteOperation("monitor", "", s => Inventory.Expire(s, s.Now(DateTimeOffset.UtcNow)));
        await base.StartAsync(cancellationToken);
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1)); string previous = ""; DateTimeOffset lastNotification = DateTimeOffset.MinValue;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var lease = await store.AcquireWriter(stoppingToken);
                store.WriteOperation("monitor", "", s => {
                    var now = s.Now(DateTimeOffset.UtcNow);
                    var expired=s.Batches.Where(b=>b.RemainingQuantity>0&&b.ExpiresAt<=now).ToList();
                    if(expired.Count>0){Telemetry.LastExpiryLagMs=expired.Max(b=>(now-b.ExpiresAt).TotalMilliseconds);Telemetry.ExpiryLag.Record(Telemetry.LastExpiryLagMs);}
                    Inventory.Expire(s, now);
                    var signature = s.WarningSignature;
                    if (signature != previous || DateTimeOffset.UtcNow - lastNotification >= TimeSpan.FromMinutes(1))
                    { s.Emit("time.changed", now); previous = signature; lastNotification = DateTimeOffset.UtcNow; }
                    return 0;
                });
                generator.Tick();
                if (DateTimeOffset.UtcNow.Second == 0) store.RetainEvents();
                Telemetry.MonitorSuccess = DateTimeOffset.UtcNow; Telemetry.MonitorError = null;
            }
            catch (Exception ex) { Telemetry.Errors.Add(1); Telemetry.MonitorError = "Monitor failed; inspect server logs"; if (ex is Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 5 }) Telemetry.Busy.Add(1); logger.LogError(ex, "Inventory monitor failed; retrying next tick"); }
        }
    }
}
