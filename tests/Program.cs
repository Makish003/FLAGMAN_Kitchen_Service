using Flagman;
using System.Diagnostics;
using System.Text.Json;

var now = DateTimeOffset.Parse("2026-10-10T09:00:00Z");
if (args.Length > 0 && args[0] == "--compete")
{
    new Store(args[1]).Write(s => Inventory.PlaceOrder(s, new([new("a", 1)]), args[2], now));
    return;
}
var passed = 0;
void Test(string name, Action action) { action(); Console.WriteLine("PASS " + name); passed++; }
void Assert(bool condition, string message = "Assertion failed") { if (!condition) throw new Exception(message); }
void Throws(Action action, int status = 400) { try { action(); } catch (DomainException e) { Assert(e.Status == status); return; } throw new Exception("Expected DomainException"); }
State Base()
{
    var s = new State(); Inventory.AddProduct(s, new("t", "Томаты", "g"), now);
    Inventory.SaveDish(s, new("a", "Блюдо А", "Тест", [new("t", 500)]), now);
    Inventory.SaveDish(s, new("b", "Блюдо Б", "Тест", [new("t", 500)]), now); return s;
}
void Delivery(State s, decimal quantity, DateTimeOffset expiry, string key = "d1") => Inventory.Deliver(s, new(key, [new("t", quantity, "g", expiry)]), key, now);
void Invariants(State s)
{
    foreach (var b in s.Batches) { Assert(b.RemainingQuantity >= 0); Assert(b.RemainingQuantity == s.Movements.Where(m => m.BatchId == b.Id).Sum(m => m.Quantity), "Movement reconciliation"); }
}
Test("R01–R05 R10 FEFO 2kg + 3kg / 2.5kg", () => {
    var s = Base(); Delivery(s, 2000, now.AddDays(1)); Delivery(s, 3000, now.AddDays(7), "d2");
    var o = Inventory.PlaceOrder(s, new([new("a", 5)]), "o1", now); Assert(o.Status == "accepted");
    Assert(s.Batches[0].RemainingQuantity == 0 && s.Batches[1].RemainingQuantity == 2500); Invariants(s);
});
Test("R07–R09 shared ingredients reject atomically", () => {
    var s = Base(); Delivery(s, 500, now.AddDays(1)); var o = Inventory.PlaceOrder(s, new([new("a", 1), new("b", 1)]), "o1", now);
    Assert(o.Status == "rejected" && o.Shortages[0].Missing == 500 && s.Batches[0].RemainingQuantity == 500); Assert(s.Movements.Count == 1); Invariants(s);
});
Test("R01 R09 R19 idempotency accepted / rejected / conflict", () => {
    var s = Base(); var input = new DeliveryInput("d", [new("t", 500, "g", now.AddDays(1))]);
    var a = Inventory.Deliver(s, input, "key", now); var b = Inventory.Deliver(s, input, "key", now); Assert(a.Id == b.Id && s.Batches.Count == 1);
    Throws(() => Inventory.Deliver(s, input with {Number="other"}, "key", now), 409);
    var orderInput = new OrderInput([new("a", 1)]); var o = Inventory.PlaceOrder(s, orderInput, "o", now); Assert(Inventory.PlaceOrder(s, orderInput, "o", now).Id == o.Id);
    var rejected = Inventory.PlaceOrder(s, orderInput, "r", now); Assert(Inventory.PlaceOrder(s, orderInput, "r", now).Id == rejected.Id && s.Shortages.Count == 1); Invariants(s);
});
Test("R04 R11 R12 R17 exact expiry, repeated write-off and replenishment", () => {
    var s = Base(); Delivery(s, 500, now.AddHours(1)); Assert(Inventory.Portions(s,s.Dishes[0],now)==1);
    var boundary = now.AddHours(1); Assert(Inventory.Portions(s,s.Dishes[0],boundary)==0); Assert(Inventory.Expire(s,boundary)==1); Assert(Inventory.Expire(s,boundary)==0);
    Assert(s.Movements.Count(m=>m.Kind=="expiry")==1); Delivery(s,500,now.AddDays(2),"new");Assert(Inventory.Portions(s,s.Dishes[0],boundary)==1);Invariants(s);
});
Test("R02 R06 validation units and recipes", () => {
    var s = Base(); Assert(Inventory.ConvertQuantity(2.5m,"kg","g")==2500);
    Throws(()=>Inventory.ConvertQuantity(1,"ml","g")); Throws(()=>Inventory.ValidateQuantity(-1));Throws(()=>Inventory.ValidateQuantity(0.0001m));
    Throws(()=>Inventory.SaveDish(s,new("x","empty","",[]),now));Throws(()=>Inventory.PlaceOrder(s,new([new("unknown",1)]),"o",now));
    Throws(()=>Inventory.Deliver(s,new("bad",[new("t",100,"g",ShelfLifeHours:-1)]),"bad",now)); Assert(s.Batches.Count==0);
});
Test("R04 manufactured / received / local end of day", () => {
    var s = Base();Inventory.Deliver(s,new("a",[new("t",1,"g",ShelfLifeHours:48,ManufacturedAt:now.AddHours(-4))]),"a",now);
    Assert(s.Batches[0].ExpiresAt==now.AddHours(44));Inventory.Deliver(s,new("b",[new("t",1,"g",ShelfLifeHours:24)]),"b",now);Assert(s.Batches[1].ExpiresAt==now.AddHours(24));
    Inventory.Deliver(s,new("c",[new("t",1,"g",ExpiryDate:"2026-10-10")]),"c",now);Assert(s.Batches[2].ExpiresAt==DateTimeOffset.Parse("2026-10-10T21:00:00Z"));
});
Test("R14–R16 urgency monotonic, shared sale plan, unavailable excluded", () => {
    var s = Base();Delivery(s,2000,now.AddHours(8));var first=Insights.Recommendations(s,now);var later=Insights.Recommendations(s,now.AddHours(4));
    Assert(later.Ranking[0].Score>first.Ranking[0].Score);Assert(first.Plan.Sum(p=>p.Portions)==4);
    Assert(first.Plan.SelectMany(p=>p.Reasons).Sum(r=>r.Quantity)==2000);Assert(Insights.Recommendations(s,now.AddHours(8)).Ranking.Count==0);
});
Test("R13 R18 R19 analytics and manual procurement", () => {
    var s = Base();s.Settings=s.Settings with {DemandWindowDays=1,PlanningHours=24,LeadTimeHours=0,SafetyFactor=0};Delivery(s,1000,now.AddHours(2));
    Inventory.PlaceOrder(s,new([new("a",1)]),"o",now);Inventory.PlaceOrder(s,new([new("b",2)]),"r",now);
    var purchase=Insights.Purchases(s,now);Assert(purchase.Count==0);Inventory.Expire(s,now.AddHours(2));purchase=Insights.Purchases(s,now.AddHours(2));Assert(purchase.Single().Quantity==500);
    var analytics=JsonSerializer.Serialize(Insights.Analytics(s,now,now.AddHours(3)),Store.Json);using var json=JsonDocument.Parse(analytics);var p=json.RootElement.GetProperty("products")[0];
    Assert(p.GetProperty("consumed").GetDecimal()==500&&p.GetProperty("wasted").GetDecimal()==500&&p.GetProperty("shortageCount").GetInt32()==1);Invariants(s);
});
Test("R20 manual continuous demand and expiry without history", () => {
    var s=Base();s.Settings=s.Settings with {DemandWindowDays=1};Delivery(s,2500,now.AddDays(10));Inventory.PlaceOrder(s,new([new("a",1)]),"o",now);
    var forecast=Insights.Forecasts(s,now).Find(x=>x.DishId=="a")!;Assert(Math.Abs((forecast.StopAt!.Value-now).TotalHours-72)<0.01,"Expected 72h until one-portion threshold");
    var empty=Base();Delivery(empty,500,now.AddHours(4));var f=Insights.Forecasts(empty,now).First();Assert(!f.HasHistory&&f.StopAt==now.AddHours(4));
    var insufficient=Base();var unknown=Insights.Forecasts(insufficient,now).First();Assert(!unknown.HasHistory);
});
Test("R22 deterministic generator sequence", () => {
    State Seed(){var s=new State();Demo.Seed(s,now);return s;}
    var a=Seed();var b=Seed();for(var i=0;i<15;i++){Demo.Generate(a,42,i,now);Demo.Generate(b,42,i,now);}
    Assert(JsonSerializer.Serialize(a.Orders.Select(o=>new{o.Status,o.Items}),Store.Json)==JsonSerializer.Serialize(b.Orders.Select(o=>new{o.Status,o.Items}),Store.Json));
    Assert(a.Deliveries.Select(x=>x.Number).SequenceEqual(b.Deliveries.Select(x=>x.Number)));Invariants(a);
    var movementCount=a.Movements.Count;for(var i=0;i<15;i++)Demo.Generate(a,42,i,now.AddHours(1));Assert(a.Movements.Count==movementCount,"Restart seed must not duplicate events");
});
var testDir=Path.Combine(Path.GetTempPath(),"flagman-tests-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(testDir);
try {
    Test("P13 v1 backup migration and unsupported schema refusal",()=>{
        var path=Path.Combine(testDir,"migration.db");new Store(path).Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;Delivery(s,500,now.AddDays(1));return 0;});
        using(var db=new Microsoft.Data.Sqlite.SqliteConnection("Data Source="+path)){db.Open();using var cmd=db.CreateCommand();cmd.CommandText="DELETE FROM schema_migrations WHERE version=2; DROP TABLE audit;";cmd.ExecuteNonQuery();}
        new Store(path).VerifyIntegrity();Assert(Directory.GetFiles(testDir,"migration.db.pre-v2-*.db").Length==1);
        using(var db=new Microsoft.Data.Sqlite.SqliteConnection("Data Source="+path)){db.Open();using var cmd=db.CreateCommand();cmd.CommandText="INSERT INTO schema_migrations VALUES(99)";cmd.ExecuteNonQuery();}
        var refused=false;try{new Store(path);}catch(InvalidOperationException){refused=true;}Assert(refused);
    });
    Test("P07 P12 P16 selective operations, old replay and live SQLite backup", () => {
        var store=new Store(Path.Combine(testDir,"selective.db"));store.Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;return 0;});
        var delivery=new DeliveryInput("selective",[new("t",500,"g",now.AddDays(2))]);
        var d=store.WriteOperation("delivery","d",s=>Inventory.Deliver(s,delivery,"d",now));
        var input=new OrderInput([new("a",1)]);var o=store.WriteOperation("order","o",s=>Inventory.PlaceOrder(s,input,"o",now));
        var again=store.WriteOperation("order","o",s=>Inventory.PlaceOrder(s,input,"o",now.AddDays(7)));Assert(again.Id==o.Id);
        Throws(()=>store.WriteOperation("order","o",s=>Inventory.PlaceOrder(s,new([new("a",2)]),"o",now)),409);
        Throws(()=>store.WriteOperation("dish","a",s=>Inventory.SaveDish(s,new("a","Changed","",[new("t",1)]),now)),409);
        store.Backup(Path.Combine(testDir,"backup.db"));new Store(Path.Combine(testDir,"backup.db")).VerifyIntegrity();store.VerifyIntegrity();
        Assert(store.Operation("order","o")!.Contains(o.Id));store.Read(s=>{Assert(s.Deliveries.Count==1&&s.Orders.Count==1&&s.Movements.Count==2);Invariants(s);return 0;});
    });
    Test("P16 P17 FEFO limited selection fallback, SQL totals and Unicode search",()=>{
        var store=new Store(Path.Combine(testDir,"paged.db"));var real=DateTimeOffset.UtcNow;
        store.Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;for(var i=0;i<150;i++)Inventory.Deliver(s,new("history-"+i,[new("t",500,"g",real.AddDays(i+1))]),"d"+i,real);return 0;});
        var input=new OrderInput([new("a",140)]);var order=store.WriteOperation("order","large",s=>Inventory.PlaceOrder(s,input,"large",s.Now(real)),orderInput:input);Assert(order.Status=="accepted");
        store.VerifyIntegrity();var snapshot=JsonSerializer.SerializeToElement(store.Dashboard(),Store.Json);Assert(snapshot.GetProperty("totals").GetProperty("batches").GetInt32()==150);Assert(snapshot.GetProperty("products")[0].GetProperty("usable").GetDecimal()==5000);
        var page=JsonSerializer.SerializeToElement(store.History("batches",1,10,"ТОМАТЫ","all"),Store.Json);Assert(page.GetProperty("total").GetInt32()==150&&page.GetProperty("items").GetArrayLength()==10);
        Assert(store.Read(s=>s.Movements.Count(m=>m.Kind=="order"))==140);store.VerifyIntegrity();
    });
    Test("P12 online backup during concurrent writes",()=>{
        var path=Path.Combine(testDir,"online.db");var store=new Store(path);var real=DateTimeOffset.UtcNow;
        store.Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;Delivery(s,50000,real.AddDays(1));return 0;});
        Parallel.Invoke(()=>{for(var i=0;i<20;i++)store.WriteOperation("order","online"+i,s=>Inventory.PlaceOrder(s,new([new("a",1)]),"online"+i,real));},()=>{for(var i=0;i<3;i++){var backup=Path.Combine(testDir,"online-backup"+i+".db");store.Backup(backup);new Store(backup).VerifyIntegrity();}});store.VerifyIntegrity();
    });
    Test("R08 R09 real SQLite parallel connections, last portion", () => {
        var path=Path.Combine(testDir,"concurrent.db");var store=new Store(path);store.Write(s=>{var fixture=Base();s.Products=fixture.Products;s.Dishes=fixture.Dishes;Delivery(s,500,now.AddDays(1));return 0;});
        Parallel.For(0,10,i=>new Store(path).Write(s=>Inventory.PlaceOrder(s,new([new("a",1)]),"parallel-"+i,now)));
        store.Read(s=>{Assert(s.Orders.Count(o=>o.Status=="accepted")==1&&s.Orders.Count(o=>o.Status=="rejected")==9);Invariants(s);return 0;});
    });
    Test("R01 R09 rollback invalid second line and persistence after restart", () => {
        var path=Path.Combine(testDir,"rollback.db");var store=new Store(path);store.Write(s=>{var fixture=Base();s.Products=fixture.Products;s.Dishes=fixture.Dishes;return 0;});
        Throws(()=>store.Write(s=>Inventory.Deliver(s,new("bad",[new("t",500,"g",now.AddDays(1)),new("missing",500,"g",now.AddDays(1))]),"bad",now)));
        Assert(store.Read(s=>s.Batches.Count)==0);store.Write(s=>{Delivery(s,500,now.AddHours(1));return 0;});new Store(path).Write(s=>Inventory.Expire(s,now.AddHours(1)));
        new Store(path).Write(s=>Inventory.Expire(s,now.AddHours(1)));new Store(path).Read(s=>{Assert(s.Movements.Count(m=>m.Kind=="expiry")==1);Invariants(s);return 0;});
    });
    Test("R08 R09 independent processes contend for final portion", () => {
        var path=Path.Combine(testDir,"processes.db");var store=new Store(path);store.Write(s=>{var fixture=Base();s.Products=fixture.Products;s.Dishes=fixture.Dishes;Delivery(s,500,now.AddDays(1));return 0;});
        var children=Enumerable.Range(0,4).Select(i=>{
            var start=new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput=true, RedirectStandardError=true };
            if(Path.GetFileNameWithoutExtension(Environment.ProcessPath!).Equals("dotnet",StringComparison.OrdinalIgnoreCase)) start.ArgumentList.Add(typeof(Inventory).Assembly.Location.Replace("Flagman.Api.dll","Flagman.Tests.dll"));
            start.ArgumentList.Add("--compete");start.ArgumentList.Add(path);start.ArgumentList.Add("process-"+i);
            return Process.Start(start)!;
        }).ToList();
        foreach(var child in children){Assert(child.WaitForExit(30000),"Child process timed out");Assert(child.ExitCode==0,child.StandardError.ReadToEnd());child.Dispose();}
        store.Read(s=>{Assert(s.Orders.Count(o=>o.Status=="accepted")==1&&s.Orders.Count(o=>o.Status=="rejected")==3);Invariants(s);return 0;});
    });
    Test("R25 small-restaurant load evidence (1000 batches)", () => {
        var path=Path.Combine(testDir,"load.db");var store=new Store(path);store.Write(s=>{var fixture=Base();s.Products=fixture.Products;s.Dishes=fixture.Dishes;for(var i=0;i<1000;i++)Delivery(s,500,now.AddDays(7),"d-"+i);return 0;});
        var watch=Stopwatch.StartNew();for(var i=0;i<5;i++)store.Read(s=>Insights.Snapshot(s,now));watch.Stop();Console.WriteLine($"METRIC snapshot 1000 batches average {watch.ElapsedMilliseconds/5}ms (target <2000ms)");Assert(watch.ElapsedMilliseconds/5<2000);
    });
} finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();Directory.Delete(testDir,true); }
Console.WriteLine($"{passed} critical domain / real database checks passed.");
