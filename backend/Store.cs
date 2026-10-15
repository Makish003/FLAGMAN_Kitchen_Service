using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Flagman;

// A restaurant is a consistency boundary. BEGIN IMMEDIATE protects it across processes.
// JSON payloads preserve decimal quantities exactly; tables provide durable entity identities.
public sealed class Store
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    readonly string connectionString;
    readonly SemaphoreSlim writer = new(1,1);
    sealed class WriterLease(SemaphoreSlim gate):IDisposable { public void Dispose()=>gate.Release(); }
    public async Task<IDisposable> AcquireWriter(CancellationToken cancellationToken) { var timer=System.Diagnostics.Stopwatch.StartNew();await writer.WaitAsync(cancellationToken);Telemetry.Timing("writerWait",timer.Elapsed.TotalMilliseconds);return new WriterLease(writer); }
    static readonly string[] Tables = ["products", "dishes", "deliveries", "batches", "orders", "movements", "shortages", "events", "requests", "audit", "generatorEvents", "users", "credentials", "procurementRequests", "deliveryRequests", "orderRequests", "offerOverrides"];
    public Store(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        connectionString = new SqliteConnectionStringBuilder { DataSource = path, DefaultTimeout = 30 }.ToString();
        using var db = Open();
        var version = 0;
        using (var check = db.CreateCommand()) { check.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name='schema_migrations'"; if (Convert.ToInt32(check.ExecuteScalar()) > 0) { check.CommandText = "SELECT COALESCE(MAX(version),0) FROM schema_migrations"; version=Convert.ToInt32(check.ExecuteScalar()); if (version > 4) throw new InvalidOperationException("Unsupported database schema; restore a compatible application/database pair."); } }
        if (version is > 0 and < 4) { using var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.GetFullPath(path)+".pre-v4-"+Guid.NewGuid().ToString("N")+".db" }.ToString()); backup.Open(); db.BackupDatabase(backup); }
        if (version == 1) { using var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.GetFullPath(path)+".pre-v2-"+Guid.NewGuid().ToString("N")+".db" }.ToString()); backup.Open(); db.BackupDatabase(backup); }
        if (version is 1 or 2) { using var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.GetFullPath(path)+".pre-v3-"+Guid.NewGuid().ToString("N")+".db" }.ToString()); backup.Open(); db.BackupDatabase(backup); }
        using var cmd = db.CreateCommand();
        cmd.CommandText = "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY); " +
            "CREATE TABLE IF NOT EXISTS metadata(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); " +
            string.Join(" ", Tables.Select(t => $"CREATE TABLE IF NOT EXISTS {t}(id TEXT PRIMARY KEY, payload TEXT NOT NULL);")) +
            "INSERT OR IGNORE INTO schema_migrations VALUES(1);";
        cmd.ExecuteNonQuery();
        cmd.CommandText = "CREATE INDEX IF NOT EXISTS events_cursor ON events(CAST(id AS INTEGER)); " +
            "CREATE INDEX IF NOT EXISTS batches_active ON batches(json_extract(payload,'$.remainingQuantity'),julianday(json_extract(payload,'$.expiresAt'))); " +
            "CREATE INDEX IF NOT EXISTS batches_fefo ON batches(json_extract(payload,'$.productId'),julianday(json_extract(payload,'$.expiresAt')),julianday(json_extract(payload,'$.receivedAt')),id) WHERE json_extract(payload,'$.remainingQuantity')>0; " +
            "CREATE INDEX IF NOT EXISTS orders_at ON orders(julianday(json_extract(payload,'$.createdAt'))); " +
            "CREATE INDEX IF NOT EXISTS movements_at ON movements(julianday(json_extract(payload,'$.at'))); " +
            "CREATE INDEX IF NOT EXISTS shortages_at ON shortages(julianday(json_extract(payload,'$.at'))); INSERT OR IGNORE INTO schema_migrations VALUES(2);";
        cmd.ExecuteNonQuery();
        // Optional price/calendar fields remain null/default in historical JSON payloads.
        cmd.CommandText = "CREATE UNIQUE INDEX IF NOT EXISTS users_login ON users(lower(json_extract(payload,'$.login'))); " +
            "CREATE INDEX IF NOT EXISTS procurements_owner ON procurementRequests(json_extract(payload,'$.supplierId'),json_extract(payload,'$.status'),json_extract(payload,'$.createdAt')); " +
            "CREATE INDEX IF NOT EXISTS deliveries_owner ON deliveryRequests(json_extract(payload,'$.authorId'),json_extract(payload,'$.status'),json_extract(payload,'$.createdAt')); " +
            "CREATE INDEX IF NOT EXISTS requests_owner ON orderRequests(json_extract(payload,'$.authorId'),json_extract(payload,'$.status'),json_extract(payload,'$.createdAt')); " +
            "CREATE INDEX IF NOT EXISTS credentials_owner ON credentials(json_extract(payload,'$.userId')); INSERT OR IGNORE INTO schema_migrations VALUES(3); INSERT OR IGNORE INTO schema_migrations VALUES(4);";
        cmd.ExecuteNonQuery();
    }
    public State Metadata()
    {
        using var db = Open(); using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT payload FROM metadata WHERE id=1";
        return cmd.ExecuteScalar() is string value ? JsonSerializer.Deserialize<State>(value, Json)! : new();
    }
    public object Readiness()
    {
        using var db = Open(); using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT MAX(version) FROM schema_migrations";
        var version = Convert.ToInt32(cmd.ExecuteScalar()); if (version != 4) throw new InvalidOperationException("Schema not ready");
        return new { status = "ok", database = "sqlite", schema = version };
    }
    public string? Operation(string scope, string key)
    {
        using var db = Open(); using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT json_extract(payload,'$.resultJson') FROM requests WHERE id=$id"; cmd.Parameters.AddWithValue("$id", scope + ":" + key); return cmd.ExecuteScalar() as string;
    }
    public object Details(string entity, string id)
    {
        Inventory.Require(entity is "batches" or "deliveries" or "orders", "Неизвестная сущность",404);
        using var db = Open(); using var tx = db.BeginTransaction(deferred:true); var rows=Selected<JsonElement>(db,tx,entity,"id=$key",id); Inventory.Require(rows.Count==1,"Запись не найдена",404);
        var movementPredicate = entity switch { "batches" => "json_extract(payload,'$.batchId')=$key", "orders" => "json_extract(payload,'$.orderId')=$key", _ => "json_extract(payload,'$.batchId') IN (SELECT id FROM batches WHERE json_extract(payload,'$.deliveryId')=$key)" };
        var movements=Selected<Movement>(db,tx,"movements",movementPredicate+" ORDER BY julianday(json_extract(payload,'$.at')),id",id);
        var batches=Selected<Batch>(db,tx,"batches",entity=="batches"?"id=$key":entity=="deliveries"?"json_extract(payload,'$.deliveryId')=$key":"id IN (SELECT json_extract(payload,'$.batchId') FROM movements WHERE json_extract(payload,'$.orderId')=$key)",id);
        tx.Commit(); return new { entity=rows[0], batches, movements };
    }
    public void RetainEvents(int count=10000)
    {
        using var db=Open();using var cmd=db.CreateCommand();cmd.CommandText="DELETE FROM events WHERE CAST(id AS INTEGER)<(SELECT MAX(CAST(id AS INTEGER))-$count FROM events)";cmd.Parameters.AddWithValue("$count",count);cmd.ExecuteNonQuery();
    }
    public List<DomainEvent> EventsAfter(long cursor)
    {
        using var db = Open(); using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT payload FROM events WHERE CAST(id AS INTEGER)>$cursor ORDER BY CAST(id AS INTEGER) LIMIT 100"; cmd.Parameters.AddWithValue("$cursor", cursor);
        using var reader = cmd.ExecuteReader(); var result = new List<DomainEvent>(); while (reader.Read()) result.Add(JsonSerializer.Deserialize<DomainEvent>(reader.GetString(0), Json)!); return result;
    }
    public object History(string entity, int page, int size, string? search, string? status, string? sort = null)
    {
        Inventory.Require(page > 0 && page <= 100000 && size is > 0 and <= 100, "Некорректная пагинация");
        Inventory.Require(entity is "batches" or "deliveries" or "orders" or "movements" or "audit" or "generatorEvents", "Неизвестный журнал", 404);
        using var db = Open(); using var tx = db.BeginTransaction(deferred: true);
        var metadata = Metadata(db, tx); var now = metadata.Now(DateTimeOffset.UtcNow);
        var where = " WHERE ($q='' OR instr(unicode_lower(t.payload),unicode_lower($q))>0" + (entity == "batches" ? " OR EXISTS(SELECT 1 FROM products p WHERE p.id=json_extract(t.payload,'$.productId') AND instr(unicode_lower(json_extract(p.payload,'$.name')),unicode_lower($q))>0)" : "") + ")";
        if (entity == "batches" && !string.IsNullOrEmpty(status) && status != "all") {
            var remaining = "json_extract(t.payload,'$.remainingQuantity')";
            var expiry = "julianday(json_extract(t.payload,'$.expiresAt'))";
            var warning = "MIN(COALESCE((SELECT json_extract(p.payload,'$.warningHours') FROM products p WHERE p.id=json_extract(t.payload,'$.productId')),48),$warning)/24.0";
            where += status switch { "empty" => $" AND {remaining}=0", "written_off" => $" AND {remaining}=0 AND EXISTS(SELECT 1 FROM movements m WHERE json_extract(m.payload,'$.batchId')=t.id AND json_extract(m.payload,'$.kind') IN ('expiry','write_off'))", "consumed" => $" AND {remaining}=0 AND NOT EXISTS(SELECT 1 FROM movements m WHERE json_extract(m.payload,'$.batchId')=t.id AND json_extract(m.payload,'$.kind') IN ('expiry','write_off'))", "expired" => $" AND {remaining}>0 AND {expiry}<=$now", "warning" => $" AND {remaining}>0 AND {expiry}>$now AND {expiry}<=$now+{warning}", "fresh" => $" AND {remaining}>0 AND {expiry}>$now+{warning}", _ => throw new DomainException("Неизвестный фильтр") };
        }
        var date = entity == "batches" ? "expiresAt" : entity is "movements" or "audit" or "generatorEvents" ? "at" : "createdAt";
        using var cmd = db.CreateCommand(); cmd.Transaction = tx; cmd.Parameters.AddWithValue("$q", search ?? ""); cmd.Parameters.AddWithValue("$warning", (double)metadata.Settings.WarningHours); cmd.Parameters.AddWithValue("$now", now.UtcDateTime.ToOADate()+2415018.5);
        cmd.CommandText = $"SELECT COUNT(*) FROM {entity} t" + where; var total = Convert.ToInt32(cmd.ExecuteScalar());
        cmd.Parameters.AddWithValue("$limit", size); cmd.Parameters.AddWithValue("$offset", (page-1)*size);
        Inventory.Require(sort is null or "oldest" or "newest", "Неизвестный порядок сортировки");
        cmd.CommandText = $"SELECT t.payload FROM {entity} t" + where + $" ORDER BY julianday(json_extract(t.payload,'$.{date}')) " + (sort == "oldest" || sort is null && entity=="batches" ? "ASC" : "DESC") + ",t.id LIMIT $limit OFFSET $offset";
        var items = new List<JsonElement>(); using (var reader = cmd.ExecuteReader()) while (reader.Read()) items.Add(JsonSerializer.Deserialize<JsonElement>(reader.GetString(0)));
        if(entity=="batches") {var state=ActiveState(db,tx,false);state.Movements=Selected<Movement>(db,tx,"movements","json_extract(payload,'$.kind') IN ('expiry','write_off')");items=items.Select(item=>{var batch=item.Deserialize<Batch>(Json)!;var node=System.Text.Json.Nodes.JsonNode.Parse(item.GetRawText())!;node["status"]=Inventory.BatchStatus(state,batch,now);return JsonSerializer.SerializeToElement(node,Json);}).ToList();}
        tx.Commit(); return new { total, page, size, items };
    }
    static State Metadata(SqliteConnection db, SqliteTransaction tx)
    {
        using var cmd = db.CreateCommand(); cmd.Transaction = tx; cmd.CommandText = "SELECT payload FROM metadata WHERE id=1";
        return cmd.ExecuteScalar() is string value ? JsonSerializer.Deserialize<State>(value, Json)! : new();
    }
    static List<T> Selected<T>(SqliteConnection db, SqliteTransaction tx, string table, string predicate = "1", string? key = null)
    {
        using var cmd = db.CreateCommand(); cmd.Transaction = tx; cmd.CommandText = $"SELECT payload FROM {table} WHERE {predicate}"; cmd.Parameters.AddWithValue("$key", key ?? "");
        using var reader = cmd.ExecuteReader(); var result = new List<T>(); while (reader.Read()) result.Add(JsonSerializer.Deserialize<T>(reader.GetString(0), Json)!); return result;
    }
    static State ActiveState(SqliteConnection db, SqliteTransaction tx, bool includeBatches = true)
    {
        var state = Metadata(db, tx); state.Products = Selected<Product>(db, tx, "products"); state.Dishes = Selected<Dish>(db, tx, "dishes");
        if(includeBatches) state.Batches = Selected<Batch>(db, tx, "batches", "json_extract(payload,'$.remainingQuantity')>0"); return state;
    }
    public T WriteOperation<T>(string scope, string key, Func<State,T> action, string? deliveryId = null, OrderInput? orderInput = null)
    {
        var timer=System.Diagnostics.Stopwatch.StartNew();
        using var db = Open(); using var tx = db.BeginTransaction(deferred: false); var state = ActiveState(db, tx, scope is not ("monitor" or "product" or "dish" or "settings" or "delivery" or "archive" or "audit") && orderInput is null);
        state.TransactionRealNow=DateTimeOffset.UtcNow;
        var julian=(state.Now(DateTimeOffset.UtcNow).UtcDateTime.ToOADate()+2415018.5).ToString(System.Globalization.CultureInfo.InvariantCulture);
        if(orderInput is not null) {
            var needs=new Dictionary<string,decimal>();
            foreach(var item in orderInput.Items)foreach(var ingredient in state.Dishes.Find(d=>d.Id==item.DishId)?.Ingredients??[]) needs[ingredient.ProductId]=needs.GetValueOrDefault(ingredient.ProductId)+ingredient.Quantity*item.Portions;
            foreach(var need in needs){var predicate=$"json_extract(payload,'$.productId')=$key AND json_extract(payload,'$.remainingQuantity')>0 AND julianday(json_extract(payload,'$.expiresAt'))>{julian} ORDER BY julianday(json_extract(payload,'$.expiresAt')),julianday(json_extract(payload,'$.receivedAt')),id";
                var rows=Selected<Batch>(db,tx,"batches",predicate+" LIMIT 128",need.Key);
                if(rows.Sum(b=>b.RemainingQuantity)<need.Value)rows=Selected<Batch>(db,tx,"batches",predicate,need.Key);
                state.Batches.AddRange(rows);
            }
        }
        if(scope=="monitor") {
            state.Batches=Selected<Batch>(db,tx,"batches",$"json_extract(payload,'$.remainingQuantity')>0 AND julianday(json_extract(payload,'$.expiresAt'))<={julian}");
            using var cmd=db.CreateCommand();cmd.Transaction=tx;cmd.CommandText=$"SELECT b.id FROM batches b JOIN products p ON p.id=json_extract(b.payload,'$.productId') WHERE json_extract(b.payload,'$.remainingQuantity')>0 AND julianday(json_extract(b.payload,'$.expiresAt'))>{julian} AND julianday(json_extract(b.payload,'$.expiresAt'))<={julian}+MIN(json_extract(p.payload,'$.warningHours'),$warning)/24.0 ORDER BY b.id";cmd.Parameters.AddWithValue("$warning",(double)state.Settings.WarningHours);
            using var reader=cmd.ExecuteReader();var ids=new List<string>();while(reader.Read())ids.Add(reader.GetString(0));state.WarningSignature=string.Join(",",ids);
        }
        state.Requests = Selected<RequestRecord>(db, tx, "requests", "id=$key", scope+":"+key);
        if (deliveryId is not null) state.Deliveries = Selected<Delivery>(db, tx, "deliveries", "id=$key", deliveryId);
        if (scope == "dish") state.Orders = Selected<Order>(db, tx, "orders", "json_extract(payload,'$.status')='accepted' AND EXISTS(SELECT 1 FROM json_each(json_extract(orders.payload,'$.items')) WHERE json_extract(value,'$.dishId')=$key) LIMIT 1", key);
        var batches = state.Batches.ToDictionary(x=>x.Id); var products = state.Products.ToDictionary(x=>x.Id); var dishes = state.Dishes.ToDictionary(x=>x.Id); var orders = state.Orders.ToDictionary(x=>x.Id); var requests = state.Requests.ToDictionary(x=>x.Id); var deliveries = state.Deliveries.ToDictionary(x=>x.Id);
        var result = action(state);
        state.Batches.RemoveAll(x=>batches.TryGetValue(x.Id,out var old)&&x==old); state.Products.RemoveAll(x=>products.TryGetValue(x.Id,out var old)&&x==old); state.Dishes.RemoveAll(x=>dishes.TryGetValue(x.Id,out var old)&&x==old); state.Orders.RemoveAll(x=>orders.TryGetValue(x.Id,out var old)&&x==old); state.Requests.RemoveAll(x=>requests.TryGetValue(x.Id,out var old)&&x==old); state.Deliveries.RemoveAll(x=>deliveries.TryGetValue(x.Id,out var old)&&x==old);
        Save(db, tx, state);Telemetry.Timing(scope+"PrepareSave",timer.Elapsed.TotalMilliseconds);timer.Restart();tx.Commit();Telemetry.Timing(scope+"Commit",timer.Elapsed.TotalMilliseconds);return result;
    }
    public object Dashboard()
    {
        using var db = Open(); using var tx = db.BeginTransaction(deferred: true); var s = ActiveState(db, tx); var now = s.Now(DateTimeOffset.UtcNow);
        var from = now.AddDays(-s.Settings.DemandWindowDays).UtcDateTime.ToOADate()+2415018.5;
        s.Batches.AddRange(Selected<Batch>(db, tx, "batches", "json_extract(payload,'$.remainingQuantity')=0 ORDER BY julianday(json_extract(payload,'$.expiresAt')) LIMIT 500"));
        s.Deliveries = Selected<Delivery>(db, tx, "deliveries", "1 ORDER BY julianday(json_extract(payload,'$.createdAt')) DESC LIMIT 100");
        s.Orders = Selected<Order>(db, tx, "orders", $"julianday(json_extract(payload,'$.createdAt'))>={from.ToString(System.Globalization.CultureInfo.InvariantCulture)} OR rowid IN (SELECT rowid FROM orders ORDER BY julianday(json_extract(payload,'$.createdAt')) DESC LIMIT 100)");
        s.Movements = Selected<Movement>(db, tx, "movements", $"julianday(json_extract(payload,'$.at'))>={from.ToString(System.Globalization.CultureInfo.InvariantCulture)} OR rowid IN (SELECT rowid FROM movements ORDER BY julianday(json_extract(payload,'$.at')) DESC LIMIT 100)");
        // Financial analytics must resolve historical batch prices beyond the 500-row UI sample.
        var loadedBatchIds=s.Batches.Select(b=>b.Id).ToHashSet();
        s.Batches.AddRange(Selected<Batch>(db,tx,"batches",$"json_extract(payload,'$.remainingQuantity')=0 AND id IN (SELECT json_extract(payload,'$.batchId') FROM movements WHERE julianday(json_extract(payload,'$.at'))>={from.ToString(System.Globalization.CultureInfo.InvariantCulture)})").Where(b=>!loadedBatchIds.Contains(b.Id)));
        s.Shortages = Selected<ShortageEvent>(db, tx, "shortages", $"julianday(json_extract(payload,'$.at'))>={from.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
        var totals = new Dictionary<string,int>(); foreach(var table in new[]{"batches","deliveries","orders","movements"}) { using var cmd = db.CreateCommand(); cmd.Transaction=tx; cmd.CommandText=$"SELECT COUNT(*) FROM {table}"; totals[table]=Convert.ToInt32(cmd.ExecuteScalar()); }
        // Resolve the last receipt across full history, including consumed batches outside the UI sample.
        var latestDeliveryBatches = Selected<Batch>(db, tx, "batches", "rowid IN (SELECT (SELECT b.rowid FROM batches b WHERE json_extract(b.payload,'$.productId')=products.id ORDER BY julianday(json_extract(b.payload,'$.receivedAt')) DESC, b.rowid DESC LIMIT 1) FROM products)");
        s.Movements.AddRange(Selected<Movement>(db,tx,"movements","json_extract(payload,'$.kind') IN ('expiry','write_off')").Where(m=>s.Movements.All(x=>x.Id!=m.Id)));
        var result = Insights.Snapshot(s, now, totals, latestDeliveryBatches); tx.Commit(); return result;
    }
    public State PlanningState()
    {
        using var db=Open();using var tx=db.BeginTransaction(deferred:true);var s=ActiveState(db,tx);
        var from=s.Now(DateTimeOffset.UtcNow).AddDays(-s.Settings.DemandWindowDays).UtcDateTime.ToOADate()+2415018.5;
        s.Orders=Selected<Order>(db,tx,"orders",$"julianday(json_extract(payload,'$.createdAt'))>={from.ToString(System.Globalization.CultureInfo.InvariantCulture)}");
        tx.Commit();return s;
    }
    public object Analytics(DateTimeOffset? from,DateTimeOffset? to, DateOnly? fromDate = null, DateOnly? toDate = null, string? days = null)
    {
        using var db=Open();using var tx=db.BeginTransaction(deferred:true);var s=Metadata(db,tx);var now=s.Now(DateTimeOffset.UtcNow);var begin=from??now.AddDays(-7);var end=to??now;Inventory.Require(end>=begin,"Конец периода раньше начала");
        if (fromDate.HasValue || toDate.HasValue)
        {
            Inventory.Require(fromDate.HasValue && toDate.HasValue && !from.HasValue && !to.HasValue, "Укажите обе календарные даты без from/to");
            Inventory.Require(toDate >= fromDate && toDate < DateOnly.MaxValue, "Некорректный календарный период");
            var zone = TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone);
            DateTimeOffset Midnight(DateOnly day)
            {
                var local = day.ToDateTime(TimeOnly.MinValue);
                Inventory.Require(!zone.IsInvalidTime(local) && !zone.IsAmbiguousTime(local), "Полночь пропущена или неоднозначна: используйте from/to с явным смещением");
                return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
            }
            begin = Midnight(fromDate!.Value); end = Midnight(toDate!.Value.AddDays(1)).AddTicks(-1);
        }
        HashSet<DateOnly>? selectedDays = null;
        if (days is not null)
        {
            selectedDays = [];
            var zone = TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone);
            var first = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(begin, zone).Date);
            var last = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(end, zone).Date);
            foreach (var value in days.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                Inventory.Require(DateOnly.TryParseExact(value, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var day) && day >= first && day <= last, "Выбранный день вне периода или имеет неверный формат");
                selectedDays.Add(day);
            }
        }
        string Between(string field)=>$"julianday(json_extract(payload,'$.{field}')) BETWEEN {(begin.UtcDateTime.ToOADate()+2415018.5).ToString(System.Globalization.CultureInfo.InvariantCulture)} AND {(end.UtcDateTime.ToOADate()+2415018.5).ToString(System.Globalization.CultureInfo.InvariantCulture)}";
        s.Products=Selected<Product>(db,tx,"products");s.Dishes=Selected<Dish>(db,tx,"dishes");s.Orders=Selected<Order>(db,tx,"orders",Between("createdAt"));s.Movements=Selected<Movement>(db,tx,"movements",Between("at"));s.Shortages=Selected<ShortageEvent>(db,tx,"shortages",Between("at"));s.Batches=Selected<Batch>(db,tx,"batches","id IN (SELECT json_extract(payload,'$.batchId') FROM movements WHERE "+Between("at")+")");var result=Insights.Analytics(s,begin,end,selectedDays);tx.Commit();return result;
    }
    public void Backup(string target)
    {
        if (File.Exists(target)) throw new IOException("Backup target must be new");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(target))!);
        using var source = Open(); using var destination = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = target }.ToString()); destination.Open(); source.BackupDatabase(destination);
        using var cmd = destination.CreateCommand(); cmd.CommandText = "PRAGMA integrity_check"; if ((string?)cmd.ExecuteScalar() != "ok") throw new IOException("Backup integrity check failed");
    }
    public static void BackupFile(string source, string target)
    {
        if (!File.Exists(source) || File.Exists(target)) throw new IOException("Existing source and new target required");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(target))!);
        using var db=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=source,Mode=SqliteOpenMode.ReadOnly,DefaultTimeout=30}.ToString());db.Open();
        using var copy=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=target}.ToString());copy.Open();db.BackupDatabase(copy);
    }
    public void VerifyIntegrity()
    {
        using (var db = Open()) { using var cmd = db.CreateCommand(); cmd.CommandText = "PRAGMA integrity_check"; if ((string?)cmd.ExecuteScalar() != "ok") throw new IOException("SQLite integrity check failed"); }
        Read(s => { var quantities = s.Movements.GroupBy(m => m.BatchId).ToDictionary(g => g.Key, g => g.Sum(m => m.Quantity)); foreach (var batch in s.Batches) if (batch.RemainingQuantity < 0 || batch.RemainingQuantity != quantities.GetValueOrDefault(batch.Id)) throw new IOException("Movement reconciliation failed: " + batch.Id); return 0; });
    }
    SqliteConnection Open() {
        var db = new SqliteConnection(connectionString); db.Open();
        using(var cmd=db.CreateCommand()){cmd.CommandText="PRAGMA synchronous=FULL;";cmd.ExecuteNonQuery();}
        db.CreateFunction<string,string>("unicode_lower", x=>x.ToLowerInvariant(), isDeterministic:true); return db;
    }
    public T Read<T>(Func<State, T> action)
    {
        using var db = Open(); using var tx = db.BeginTransaction(deferred: true);
        var result = action(Load(db, tx)); tx.Commit(); return result;
    }
    public T Write<T>(Func<State, T> action)
    {
        using var db = Open(); using var tx = db.BeginTransaction(deferred: false);
        var state = Load(db, tx); var result = action(state); Save(db, tx, state); tx.Commit(); return result;
    }
    // Offline maintenance only: replace all restaurant data in a single transaction.
    public void Reset(bool demo, DateTimeOffset now)
    {
        using var db = Open(); using var tx = db.BeginTransaction(deferred: false);
        using var cmd = db.CreateCommand(); cmd.Transaction = tx;
        cmd.CommandText = string.Join(" ", Tables.Select(t => $"DELETE FROM {t};")) + " DELETE FROM metadata;";
        cmd.ExecuteNonQuery();
        var state = new State();
        if (demo) Demo.Seed(state, now);
        Save(db, tx, state); tx.Commit();
    }
    static List<T> Rows<T>(SqliteConnection db, SqliteTransaction tx, string table)
    {
        using var cmd = db.CreateCommand(); cmd.Transaction = tx; cmd.CommandText = $"SELECT payload FROM {table} ORDER BY rowid";
        using var reader = cmd.ExecuteReader(); var rows = new List<T>();
        while (reader.Read()) rows.Add(JsonSerializer.Deserialize<T>(reader.GetString(0), Json)!);
        return rows;
    }
    static State Load(SqliteConnection db, SqliteTransaction tx)
    {
        using var cmd = db.CreateCommand(); cmd.Transaction = tx; cmd.CommandText = "SELECT payload FROM metadata WHERE id=1";
        var metadata = cmd.ExecuteScalar() as string;
        var s = metadata is null ? new State() : JsonSerializer.Deserialize<State>(metadata, Json)!;
        s.Products = Rows<Product>(db, tx, "products"); s.Dishes = Rows<Dish>(db, tx, "dishes");
        s.Deliveries = Rows<Delivery>(db, tx, "deliveries"); s.Batches = Rows<Batch>(db, tx, "batches");
        s.Orders = Rows<Order>(db, tx, "orders"); s.Movements = Rows<Movement>(db, tx, "movements");
        s.Shortages = Rows<ShortageEvent>(db, tx, "shortages"); s.Events = Rows<DomainEvent>(db, tx, "events");
        s.Requests = Rows<RequestRecord>(db, tx, "requests"); s.Audit = Rows<AuditEntry>(db, tx, "audit"); s.GeneratorEvents = Rows<GeneratorEvent>(db, tx, "generatorEvents");
        s.Users=Rows<UserAccount>(db,tx,"users"); s.Credentials=Rows<ApiCredential>(db,tx,"credentials");
        s.ProcurementRequests=Rows<ProcurementRequest>(db,tx,"procurementRequests"); s.DeliveryRequests=Rows<DeliveryRequest>(db,tx,"deliveryRequests");
        s.OrderRequests=Rows<OrderRequest>(db,tx,"orderRequests"); s.OfferOverrides=Rows<OfferOverride>(db,tx,"offerOverrides"); return s;
    }
    static void Upsert<T>(SqliteConnection db, SqliteTransaction tx, string table, IEnumerable<T> rows, Func<T, string> key)
    {
        using var cmd = db.CreateCommand(); cmd.Transaction = tx;
        // Update only changed payloads; append-only journal rows never get rewritten.
        cmd.CommandText = $"INSERT INTO {table}(id,payload) VALUES($id,$payload) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE payload<>excluded.payload";
        var id = cmd.Parameters.Add("$id", SqliteType.Text); var payload = cmd.Parameters.Add("$payload", SqliteType.Text);
        foreach (var row in rows) { id.Value = key(row); payload.Value = JsonSerializer.Serialize(row, Json); cmd.ExecuteNonQuery(); }
    }
    static void Save(SqliteConnection db, SqliteTransaction tx, State s)
    {
        Upsert(db, tx, "products", s.Products, x => x.Id); Upsert(db, tx, "dishes", s.Dishes, x => x.Id);
        Upsert(db, tx, "deliveries", s.Deliveries, x => x.Id); Upsert(db, tx, "batches", s.Batches, x => x.Id);
        Upsert(db, tx, "orders", s.Orders, x => x.Id); Upsert(db, tx, "movements", s.Movements, x => x.Id);
        Upsert(db, tx, "shortages", s.Shortages, x => x.Id); Upsert(db, tx, "events", s.Events, x => x.Id.ToString());
        Upsert(db, tx, "requests", s.Requests, x => x.Id);
        Upsert(db, tx, "audit", s.Audit, x => x.Id);
        Upsert(db, tx, "generatorEvents", s.GeneratorEvents, x => x.Id);
        Upsert(db,tx,"users",s.Users,x=>x.Id); Upsert(db,tx,"credentials",s.Credentials,x=>x.Id);
        Upsert(db,tx,"procurementRequests",s.ProcurementRequests,x=>x.Id); Upsert(db,tx,"deliveryRequests",s.DeliveryRequests,x=>x.Id);
        Upsert(db,tx,"orderRequests",s.OrderRequests,x=>x.Id); Upsert(db,tx,"offerOverrides",s.OfferOverrides,x=>x.Id);
        var metadata = new State { Settings = s.Settings, DemoOffsetHours = s.DemoOffsetHours, Revision = s.Revision, WarningSignature = s.WarningSignature };
        using var cmd = db.CreateCommand(); cmd.Transaction = tx;
        cmd.CommandText = "INSERT INTO metadata VALUES(1,$payload) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE payload<>excluded.payload";
        cmd.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(metadata, Json)); cmd.ExecuteNonQuery();
    }
}
