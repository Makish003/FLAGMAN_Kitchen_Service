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
Test("H03 archived recipe cannot allocate virtual stock", () => {
    var s = Base(); Delivery(s,1000,now.AddHours(8));
    s.Dishes[0] = s.Dishes[0] with { Archived=true };
    var plan=Insights.Recommendations(s,now);
    Assert(plan.Ranking.All(x=>x.DishId!="a"));
    Assert(plan.Plan.All(x=>x.DishId!="a"),"Archived dish took virtual stock");
    Assert(plan.Plan.Single().DishId=="b" && plan.Plan.Single().Portions==2);
    Assert(s.Batches[0].RemainingQuantity==1000); Invariants(s);
});
Test("Planning service rejects empty and fully archived menus", () => {
    var service=new PlanningService();
    Throws(()=>service.Calculate(new State(),now,new PlanningInput()));
    var s=Base();
    var plan=service.Calculate(s,now,new PlanningInput());
    Assert(plan.Plan.Count==0);
    s.Dishes=s.Dishes.Select(d=>d with {Archived=true}).ToList();
    Throws(()=>service.Calculate(s,now,new PlanningInput()));
});
Test("H05 expiry between offer and confirmation rejects without partial consumption", () => {
    var s=Base();Delivery(s,500,now.AddMinutes(1));
    Assert(Insights.Recommendations(s,now).Plan.Count>0);
    var order=Inventory.PlaceOrder(s,new([new("a",1)]),"expired-offer",now.AddMinutes(1));
    Assert(order.Status=="rejected"&&s.Movements.Count==1);Invariants(s);
});
Test("R01–R05 R10 FEFO 2kg + 3kg / 2.5kg", () => {
    var s = Base(); Delivery(s, 2000, now.AddDays(1)); Delivery(s, 3000, now.AddDays(7), "d2");
    var o = Inventory.PlaceOrder(s, new([new("a", 5)]), "o1", now); Assert(o.Status == "accepted");
    Assert(s.Batches[0].RemainingQuantity == 0 && s.Batches[1].RemainingQuantity == 2500); Invariants(s);
});
Test("Unit conversion preserves fractional base quantities and validates normalized limits", () => {
    Assert(Inventory.ConvertQuantity(1.7005m,"kg","g")==1700.5m);
    Assert(Inventory.ConvertQuantity(1.234567m,"l","ml")==1234.567m);
    Assert(Inventory.ConvertQuantity(0.000001m,"kg","g")==0.001m);
    Throws(()=>Inventory.ConvertQuantity(1.2345678m,"kg","g"));
    Throws(()=>Inventory.ConvertQuantity(1000001m,"kg","g"));
    Throws(()=>Inventory.ConvertQuantity(1m,"l","g"));
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
Test("A1-A3 complete restaurant-calendar daily analytics", () => {
    var s = Base();
    var from = DateTimeOffset.Parse("2026-01-01T00:00:00+03:00");
    var to = DateTimeOffset.Parse("2026-05-01T23:59:59.9999999+03:00");
    s.Orders.Add(new("first", from, "accepted", [], []));
    s.Orders.Add(new("last", DateTimeOffset.Parse("2026-04-30T22:00:00Z"), "accepted", [], []));
    s.Orders.Add(new("rejected", to, "rejected", [], []));
    s.Orders.Add(new("outside", to.AddTicks(1), "accepted", [], []));
    var a = JsonSerializer.SerializeToElement(Insights.Analytics(s, from, to), Store.Json);
    var daily = a.GetProperty("daily").EnumerateArray().ToList();
    Assert(daily.Count == 121 && daily[0].GetProperty("day").GetString() == "2026-01-01" && daily[^1].GetProperty("day").GetString() == "2026-05-01");
    Assert(daily.Sum(d => d.GetProperty("accepted").GetInt32()) == a.GetProperty("ordersAccepted").GetInt32());
    Assert(daily.Sum(d => d.GetProperty("rejected").GetInt32()) == a.GetProperty("ordersRejected").GetInt32());
    var one = JsonSerializer.SerializeToElement(Insights.Analytics(s, DateTimeOffset.Parse("2026-05-01T00:00:00+03:00"), to), Store.Json);
    Assert(one.GetProperty("daily").GetArrayLength() == 1 && one.GetProperty("ordersAccepted").GetInt32() == 1);
    var utc = JsonSerializer.SerializeToElement(Insights.Analytics(s, from.ToUniversalTime(), to.ToUniversalTime()), Store.Json);
    Assert(utc.GetProperty("daily").GetRawText() == a.GetProperty("daily").GetRawText(), "Input offsets must not change restaurant dates");
    var empty = JsonSerializer.SerializeToElement(Insights.Analytics(s, from.AddDays(1), from.AddDays(1).AddHours(23)), Store.Json);
    Assert(empty.GetProperty("daily").GetArrayLength() == 1 && empty.GetProperty("ordersAccepted").GetInt32() == 0);
});
Test("Dashboard analytics starts at the first restaurant calendar day", () => {
    var s=Base();s.Settings=s.Settings with {DemandWindowDays=3,Timezone="Europe/Moscow"};
    var clock=DateTimeOffset.Parse("2026-10-13T01:00:00Z");
    s.Orders.Add(new("early",DateTimeOffset.Parse("2026-10-10T21:00:00Z"),"accepted",[],[]));
    s.Orders.Add(new("before",DateTimeOffset.Parse("2026-10-10T20:59:59Z"),"accepted",[],[]));
    var a=JsonSerializer.SerializeToElement(Insights.Snapshot(s,clock),Store.Json).GetProperty("analytics");
    Assert(a.GetProperty("daily").GetArrayLength()==3);
    Assert(a.GetProperty("daily")[0].GetProperty("day").GetString()=="2026-10-11");
    Assert(a.GetProperty("from").GetDateTimeOffset()==DateTimeOffset.Parse("2026-10-10T21:00:00Z"));
    Assert(a.GetProperty("ordersAccepted").GetInt32()==1);
});
Test("A5 full warning aggregates and preview survive expired sample crowding", () => {
    var s = Base();
    for (var i = 0; i < 501; i++) {
        s.Batches.Add(new("expired-"+i,"d","t",1,1,now.AddDays(-2),now.AddHours(-1),null,null,"explicit"));
        s.Batches.Add(new("warning-"+i,"d","t",1,1,now,now.AddHours(1),null,null,"explicit"));
    }
    var a = JsonSerializer.SerializeToElement(Insights.Snapshot(s,now),Store.Json);
    Assert(a.GetProperty("batches").GetArrayLength() == 500);
    Assert(a.GetProperty("totals").GetProperty("activeBatches").GetInt32() == 1002);
    Assert(a.GetProperty("totals").GetProperty("warningBatches").GetInt32() == 501);
    Assert(a.GetProperty("expiringBatches").GetArrayLength() == 5);
    Assert(a.GetProperty("expiringBatches").EnumerateArray().All(b=>b.GetProperty("id").GetString()!.StartsWith("warning-")));
});
Test("Analytics price coverage separates receipts, consumption and losses", () => {
    var s = Base();
    Inventory.Deliver(s,new("priced",[new("t",1000,"g",now.AddHours(1),UnitCost:2,Currency:"RUB")]),"priced",now);
    Delivery(s,1000,now.AddHours(2),"unknown");
    Inventory.PlaceOrder(s,new([new("a",3)]),"mixed",now);
    Inventory.Expire(s,now.AddHours(2));
    var a = JsonSerializer.SerializeToElement(Insights.Analytics(s,now,now.AddHours(2)),Store.Json);
    var coverage = a.GetProperty("priceCoverage").EnumerateArray().ToList();
    Assert(coverage[0].GetProperty("total").GetInt32()==2 && coverage[0].GetProperty("priced").GetInt32()==1);
    Assert(coverage[1].GetProperty("total").GetInt32()==1 && coverage[1].GetProperty("priced").GetInt32()==0);
    Assert(a.GetProperty("costs")[0].GetProperty("consumed").GetDecimal()==2000);
});
Test("Selected calendar days exclude gaps and rank unique rejected orders and priced losses", () => {
    var s=Base();
    var first=DateTimeOffset.Parse("2026-10-01T00:00:00+03:00");
    var shortage=new Shortage("t","Томаты","g",500,0,500,["a"]);
    for(var i=0;i<4;i++) {
        // A UTC timestamp on the preceding date still belongs to the restaurant day.
        var at=first.AddDays(i).AddMinutes(30);
        s.Orders.Add(new("rejected-"+i,at,"rejected",[new("a",2)],[shortage,shortage]));
        s.Shortages.Add(new("shortage-"+i,"rejected-"+i,at,shortage));
        Inventory.Deliver(s,new("priced-"+i,[new("t",10,"g",at.AddHours(1),UnitCost:2,Currency:i==3?"USD":"RUB")]),"priced-"+i,at);
        Inventory.Expire(s,at.AddHours(1));
    }
    Inventory.Deliver(s,new("unknown",[new("t",10,"g",first.AddDays(3).AddHours(3))]),"unknown",first.AddDays(3));
    Inventory.Expire(s,first.AddDays(3).AddHours(3));
    var chosen=new HashSet<DateOnly>{new(2026,10,1),new(2026,10,2),new(2026,10,4)};
    var a=JsonSerializer.SerializeToElement(Insights.Analytics(s,first,first.AddDays(4).AddTicks(-1),chosen),Store.Json);
    Assert(a.GetProperty("ordersRejected").GetInt32()==3);
    Assert(a.GetProperty("dishes")[0].GetProperty("rejectedOrders").GetInt32()==3,"Multiple shortage causes doubled the dish count");
    Assert(a.GetProperty("dishes")[0].GetProperty("rejectedPortions").GetInt32()==6);
    Assert(a.GetProperty("dishes")[0].GetProperty("reasons").GetArrayLength()==1);
    Assert(a.GetProperty("daily")[2].GetProperty("rejected").GetInt32()==0);
    Assert(a.GetProperty("lossBatches").GetInt32()==4);
    var waste=a.GetProperty("wasteProducts").EnumerateArray().ToList();
    Assert(waste.Single(p=>p.GetProperty("currency").GetString()=="RUB").GetProperty("cost").GetDecimal()==40);
    Assert(waste.Single(p=>p.GetProperty("currency").GetString()=="USD").GetProperty("cost").GetDecimal()==20);
    var coverage=a.GetProperty("priceCoverage")[1];Assert(coverage.GetProperty("priced").GetInt32()==3 && coverage.GetProperty("total").GetInt32()==4);
    var empty=JsonSerializer.SerializeToElement(Insights.Analytics(s,first,first.AddDays(4),[]),Store.Json);
    Assert(empty.GetProperty("ordersRejected").GetInt32()==0 && empty.GetProperty("wasteProducts").GetArrayLength()==0);
});
Test("R20 manual continuous demand and expiry without history", () => {
    var s=Base();s.Settings=s.Settings with {DemandWindowDays=1};Delivery(s,2500,now.AddDays(10));Inventory.PlaceOrder(s,new([new("a",1)]),"o",now);
    var forecast=Insights.Forecasts(s,now).Find(x=>x.DishId=="a")!;Assert(Math.Abs((forecast.StopAt!.Value-now).TotalHours-72)<0.01,"Expected 72h until one-portion threshold");
    var empty=Base();Delivery(empty,500,now.AddHours(4));var f=Insights.Forecasts(empty,now).First();Assert(!f.HasHistory&&f.StopAt==now.AddHours(4));
    var insufficient=Base();var unknown=Insights.Forecasts(insufficient,now).First();Assert(!unknown.HasHistory);
});
Test("Demo prices cover seed, generator, consumption and expiry", () => {
    var s = new State(); Demo.Seed(s, now);
    Assert(s.Batches.All(b => b.UnitCost > 0 && b.Currency == "RUB"));
    Assert(s.Batches.First(b => b.ProductId == "tomato").UnitCost == 0.25m, "kg price must be stored per g");
    Assert(s.Batches.First(b => b.ProductId == "cream").UnitCost == 0.4m, "l price must be stored per ml");
    Assert(s.Batches.First(b => b.ProductId == "egg").UnitCost == 12m);
    for (var i = 0; i < 30; i++) Demo.Generate(s, 42, i, now);
    Assert(s.Batches.All(b => b.UnitCost > 0 && b.Currency == "RUB"));
    Inventory.Expire(s, now.AddDays(31));
    var a = JsonSerializer.SerializeToElement(Insights.Analytics(s, now, now.AddDays(31)), Store.Json);
    foreach (var coverage in a.GetProperty("priceCoverage").EnumerateArray())
        Assert(coverage.GetProperty("total").GetInt32() > 0 && coverage.GetProperty("priced").GetInt32() == coverage.GetProperty("total").GetInt32());
    var rub = a.GetProperty("costs")[0];
    Assert(rub.GetProperty("consumed").GetDecimal() > 0 && rub.GetProperty("wasted").GetDecimal() > 0);
    Invariants(s);
});
Test("Complete demo supports historical demand, scenarios, excess, forecasts and monetary sales planning", () => {
    var s = new State(); Demo.Seed(s, now);
    var model = ScenarioDemand.Build(s, now, "normal");
    Assert(model.HasHistory && model.TrainingDays >= 6 && model.TrainingOrders >= 24);
    Assert(new[]{"caprese","pasta","salmon","caesar","omelet"}.All(id => model.Daily[id] > 0));
    foreach (var scenario in new[]{"low","normal","high"}) {
        var result = ScenarioDemand.Calculate(s, now, new(Scenario:scenario, PurchaseShelfLifeHours:48));
        Assert(result.Purchases.Count > 0 && result.Purchases.All(p => p.LikelyExcess.HasValue));
        Assert(result.Forecasts.Any(f => f.StopFrom.HasValue));
    }
    var surplus = ScenarioDemand.Calculate(s, now, new(PurchaseShelfLifeHours:12, PurchaseQuantities:new(){["tomato"]=50000}));
    Assert(surplus.Purchases.Single(p => p.ProductId == "tomato").LikelyExcess > 0);
    var service = new PlanningService();
    foreach (var demand in new[]{"stock","history","manual"}) {
        var plan = service.Calculate(s, now, new(DemandSource:demand, Objective:"money", Currency:"RUB", ManualLimits:s.Dishes.ToDictionary(d=>d.Id,_=>10)));
        Assert(plan.Plan.Count > 0 && plan.PricedBatches == plan.RiskBatches);
    }
    var analytics = JsonSerializer.SerializeToElement(Insights.Analytics(s, now.AddDays(-7), now), Store.Json);
    Assert(analytics.GetProperty("ordersAccepted").GetInt32() >= 24 && analytics.GetProperty("ordersRejected").GetInt32() > 0);
    Assert(analytics.GetProperty("wasteProducts").GetArrayLength() > 0);
    var rub = analytics.GetProperty("costs")[0];
    Assert(rub.GetProperty("consumed").GetDecimal() > 0 && rub.GetProperty("wasted").GetDecimal() > 0);
    Assert(Demo.Enrich(s,now)==0);
    Invariants(s);
});
Test("Legacy demo enrichment is additive, idempotent and preserves current inventory", () => {
    var s = new State(); Demo.Seed(s, now);
    s.Deliveries.RemoveAll(d => d.CreatedAt < now); s.Batches.RemoveAll(b => b.ReceivedAt < now);
    s.Orders.RemoveAll(o => o.CreatedAt < now); s.Movements.RemoveAll(m => m.At < now); s.Shortages.RemoveAll(x => x.At < now);
    s.Requests.RemoveAll(r => r.Id.Contains("demo-history-v1-"));
    var stock = JsonSerializer.Serialize(s.Batches, Store.Json);
    Assert(Demo.NeedsEnrichment(s));
    Assert(Demo.Enrich(s,now) > 0);
    Assert(JsonSerializer.Serialize(s.Batches.Where(b=>b.ReceivedAt==now), Store.Json) == stock);
    Assert(ScenarioDemand.Build(s,now,"normal").HasHistory);
    var saved = JsonSerializer.Serialize(s, Store.Json);
    Demo.Seed(s,now); Assert(JsonSerializer.Serialize(s,Store.Json)==saved);
    Invariants(s);
});
Test("Existing demo prices are filled without changing manual deliveries or known prices", () => {
    var s = new State(); Demo.Seed(s, now); Demo.Generate(s, 42, 0, now);
    s.Batches = s.Batches.Select((b, i) => i == 0 ? b with { UnitCost = 7m, Currency = "USD" } : b with { UnitCost = null, Currency = null }).ToList();
    Inventory.Deliver(s, new("ГЕН-42-99", [new("tomato", 100, "g", now.AddDays(1))]), "manual", now);
    var expected = s.Batches.Count - 2;
    Assert(Demo.FillMissingPrices(s) == expected);
    Assert(s.Batches[0].UnitCost == 7m && s.Batches[0].Currency == "USD");
    Assert(s.Batches[^1].UnitCost is null);
    Assert(s.Batches.Skip(1).SkipLast(1).All(b => b.UnitCost > 0 && b.Currency == "RUB"));
    Assert(Demo.FillMissingPrices(s) == 0);
    Invariants(s);
});
Test("R22 deterministic generator sequence", () => {
    State Seed(){var s=new State();Demo.Seed(s,now);return s;}
    var a=Seed();var b=Seed();for(var i=0;i<15;i++){Demo.Generate(a,42,i,now);Demo.Generate(b,42,i,now);}
    Assert(JsonSerializer.Serialize(a.Orders.Select(o=>new{o.Status,o.Items}),Store.Json)==JsonSerializer.Serialize(b.Orders.Select(o=>new{o.Status,o.Items}),Store.Json));
    Assert(a.Deliveries.Select(x=>x.Number).SequenceEqual(b.Deliveries.Select(x=>x.Number)));Invariants(a);
    var movementCount=a.Movements.Count;for(var i=0;i<15;i++)Demo.Generate(a,42,i,now.AddHours(1));Assert(a.Movements.Count==movementCount,"Restart seed must not duplicate events");
});
var testDir=Path.Combine(Path.GetTempPath(),"flagman-tests-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(testDir);
Test("Idle monitor does not invalidate calculations on startup or minute heartbeat", () => {
    var store=new Store(Path.Combine(testDir,"idle-monitor.db"));
    var worker=new Flagman.Monitor(store,new Generator(store),Microsoft.Extensions.Logging.Abstractions.NullLogger<Flagman.Monitor>.Instance);
    var revision=store.Metadata().Revision;
    worker.StartAsync(CancellationToken.None).GetAwaiter().GetResult();
    try {
        Task.Delay(2200).GetAwaiter().GetResult();
        Assert(store.Metadata().Revision==revision,"Idle monitor startup changed warehouse revision");
        Task.Delay(61000).GetAwaiter().GetResult();
        Assert(store.Metadata().Revision==revision,"Minute heartbeat changed warehouse revision");
    } finally { worker.StopAsync(CancellationToken.None).GetAwaiter().GetResult();worker.Dispose(); }
});
Test("Last delivery price includes consumed history outside dashboard sample", () => {
    var store=new Store(Path.Combine(testDir,"last-delivery-price.db"));
    var receipt=DateTimeOffset.UtcNow.AddDays(-100);
    store.Write(s=>{
        Inventory.AddProduct(s,new("t","Томаты","g"),receipt);
        for(var i=0;i<501;i++)s.Batches.Add(new("old-"+i,"old-delivery","t",100,0,receipt.AddDays(-10),receipt.AddDays(-9),null,null,"explicit",0.2m,"RUB"));
        s.Batches.Add(new("last","last-delivery","t",100,0,receipt,receipt.AddDays(1),null,null,"explicit",0.4m,"USD"));
        return 0;
    });
    var snapshot=JsonSerializer.SerializeToElement(store.Dashboard(),Store.Json);
    Assert(snapshot.GetProperty("batches").GetArrayLength()==500);
    var product=snapshot.GetProperty("products")[0];
    Assert(product.GetProperty("lastUnitCost").GetDecimal()==0.4m);
    Assert(product.GetProperty("lastCurrency").GetString()=="USD");
    store.Write(s=>{s.Batches.Add(new("unknown","unknown-delivery","t",100,0,receipt.AddDays(2),receipt.AddDays(3),null,null,"explicit"));return 0;});
    product=JsonSerializer.SerializeToElement(store.Dashboard(),Store.Json).GetProperty("products")[0];
    Assert(product.GetProperty("lastUnitCost").ValueKind==JsonValueKind.Null,"Unknown latest price must not reuse an older price");
});
Test("Generator resumes persisted seed and commits visible entities with durable log", () => {
    var store=new Store(Path.Combine(testDir,"generator.db"));
    store.Write(s=>{Inventory.AddProduct(s,new("t","Томаты","g"),now);Inventory.SaveDish(s,new("a","Блюдо","Тест",[new("t",10000)]),now);Demo.Generate(s,42,0,s.Now(DateTimeOffset.UtcNow));return 0;});
    var generator=new Generator(store);generator.Start(new(42,1));generator.Tick();generator.Stop();
    var state=store.Read(s=>s);Assert(state.Deliveries.Count==1 && state.Orders.Count==1,"Restart must create next order instead of replaying delivery");
    var log=JsonSerializer.SerializeToElement(store.History("generatorEvents",1,20,null,null),Store.Json);
    var entry=log.GetProperty("items")[0];Assert(entry.GetProperty("step").GetInt32()==1 && entry.GetProperty("status").GetString()=="rejected");
    Assert(entry.GetProperty("entityId").GetString()==state.Orders[0].Id && entry.GetProperty("summary").GetString()!.Contains("не хватает"));
    generator=new Generator(new Store(Path.Combine(testDir,"generator.db")));generator.Start(new(42,1));generator.Tick();generator.Stop();
    Assert(store.Read(s=>s.Orders.Count)==2,"New generator instance must continue persisted progress");
    generator.Start(new(42,1));generator.Tick();generator.Stop();
    Assert(store.Read(s=>s.Deliveries.Count)==2,"Step 3 must persist a new delivery");
    Assert(JsonSerializer.SerializeToElement(store.History("generatorEvents",1,20,null,null),Store.Json).GetProperty("total").GetInt32()==3);
    var empty=new Store(Path.Combine(testDir,"generator-empty.db"));var failed=new Generator(empty);failed.Start(new(1,1));failed.Tick();
    Assert(JsonSerializer.SerializeToElement(failed.Status,Store.Json).GetProperty("error").GetString()!.Contains("Сначала"));
    Assert(JsonSerializer.SerializeToElement(empty.History("generatorEvents",1,20,null,null),Store.Json).GetProperty("items")[0].GetProperty("status").GetString()=="error");
});
Test("Delivery preview accepts past receipts and exposes changed expiry without saving",()=>{
    var store=new Store(Path.Combine(testDir,"delivery-preview.db"));store.Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;return 0;});
    var persisted=JsonSerializer.Serialize(store.Read(s=>s),Store.Json);
    var arrival=now.AddHours(-8);
    JsonElement Preview(string date)=>JsonSerializer.SerializeToElement(PlanningService.PreviewDelivery(store.PlanningState(),now,new("preview",[new("t",1000,"g",ExpiryDate:date)],arrival)),Store.Json);
    var first=Preview("2026-10-31");var second=Preview("2026-11-01");
    Assert(first.GetProperty("arrival").GetDateTimeOffset()==arrival);
    Assert(first.GetProperty("evaluatedAt").GetDateTimeOffset()==now);
    Assert(first.GetProperty("batches")[0].GetProperty("expiresAt").GetDateTimeOffset()==DateTimeOffset.Parse("2026-10-31T21:00:00Z"));
    Assert(second.GetProperty("batches")[0].GetProperty("expiresAt").GetDateTimeOffset()==DateTimeOffset.Parse("2026-11-01T21:00:00Z"));
    Assert(first.GetProperty("changes")[0].GetProperty("after").GetInt32()==2);
    Assert(JsonSerializer.Serialize(store.Read(s=>s),Store.Json)==persisted,"Preview must not write inventory");
    var expired=JsonSerializer.SerializeToElement(PlanningService.PreviewDelivery(store.PlanningState(),now,new("expired",[new("t",500,"g",arrival.AddHours(1))],arrival)),Store.Json);
    Assert(!expired.GetProperty("batches")[0].GetProperty("usable").GetBoolean());
    Assert(expired.GetProperty("changes")[0].GetProperty("after").GetInt32()==0);
    var future=now.AddDays(1);var planned=JsonSerializer.SerializeToElement(PlanningService.PreviewDelivery(store.PlanningState(),now,new("planned",[new("t",500,"g",ShelfLifeHours:48)],future)),Store.Json);
    Assert(planned.GetProperty("evaluatedAt").GetDateTimeOffset()==future);
    Throws(()=>PlanningService.PreviewDelivery(store.PlanningState(),now,new("too-far",[new("t",500,"g",ShelfLifeHours:48)],now.AddDays(31))));
});
Test("Demo clock offset is explicit and preserves inventory timestamps",()=>{
    var s=Base();s.DemoOffsetHours=8;
    var simulated=s.Now(now);Inventory.Deliver(s,new("demo-clock",[new("t",500,"g",simulated.AddDays(1))]),"demo-clock",simulated);
    var snapshot=JsonSerializer.SerializeToElement(Insights.Snapshot(s,simulated),Store.Json);
    Assert(snapshot.GetProperty("demoOffsetHours").GetDecimal()==8);
    Assert(snapshot.GetProperty("now").GetDateTimeOffset()==now.AddHours(8));
    Assert(snapshot.GetProperty("deliveries")[0].GetProperty("createdAt").GetDateTimeOffset()==simulated);
});
var hackathonEvidence=Environment.GetEnvironmentVariable("FLAGMAN_EVIDENCE")??Path.GetFullPath("test-results/hackathon-domain");Directory.CreateDirectory(hackathonEvidence);
HackathonChecks.Run(Test,hackathonEvidence);
var testSucceeded=false;
try {
    Test("A2-A3 store calendar boundaries follow DST and retain instant API",()=>{
        var store=new Store(Path.Combine(testDir,"calendar-analytics.db"));
        store.Write(s=>{s.Settings=s.Settings with {Timezone="America/New_York"};s.Orders.Add(new("in",DateTimeOffset.Parse("2026-03-09T03:59:59Z"),"accepted",[],[]));s.Orders.Add(new("out",DateTimeOffset.Parse("2026-03-09T04:00:00Z"),"accepted",[],[]));return 0;});
        var a=JsonSerializer.SerializeToElement(store.Analytics(null,null,new(2026,3,8),new(2026,3,8)),Store.Json);
        Assert(a.GetProperty("from").GetDateTimeOffset()==DateTimeOffset.Parse("2026-03-08T05:00:00Z"));
        Assert(a.GetProperty("to").GetDateTimeOffset()==DateTimeOffset.Parse("2026-03-09T04:00:00Z").AddTicks(-1));
        Assert(a.GetProperty("daily").GetArrayLength()==1 && a.GetProperty("ordersAccepted").GetInt32()==1);
        var direct=JsonSerializer.SerializeToElement(store.Analytics(a.GetProperty("from").GetDateTimeOffset(),a.GetProperty("to").GetDateTimeOffset()),Store.Json);
        Assert(direct.GetProperty("daily").GetRawText()==a.GetProperty("daily").GetRawText());
        var fall=JsonSerializer.SerializeToElement(store.Analytics(null,null,new(2026,11,1),new(2026,11,1)),Store.Json);
        Assert((fall.GetProperty("to").GetDateTimeOffset().AddTicks(1)-fall.GetProperty("from").GetDateTimeOffset()).TotalHours==25);
        Throws(()=>store.Analytics(null,null,new(2026,3,9),new(2026,3,8)));
        Throws(()=>store.Analytics(null,null,new(2026,3,8),null));
        Throws(()=>store.Analytics(now,null,new(2026,3,8),new(2026,3,8)));
        var selected=JsonSerializer.SerializeToElement(store.Analytics(null,null,new(2026,3,8),new(2026,3,9),"2026-03-08"),Store.Json);
        Assert(selected.GetProperty("ordersAccepted").GetInt32()==1);
        Throws(()=>store.Analytics(null,null,new(2026,3,8),new(2026,3,9),"2026-03-10"));
        Throws(()=>store.Analytics(null,null,new(2026,3,8),new(2026,3,9),"bad-date"));
    });
    Test("A5 persisted warning pagination agrees with full dashboard totals",()=>{
        var store=new Store(Path.Combine(testDir,"warning-pagination.db"));var real=DateTimeOffset.UtcNow;
        store.Write(s=>{s.Products=Base().Products;for(var i=0;i<501;i++)Inventory.Deliver(s,new("warning-"+i,[new("t",1,"g",real.AddHours(2))]),"warning-"+i,real);return 0;});
        var a=JsonSerializer.SerializeToElement(store.Dashboard(),Store.Json);
        Assert(a.GetProperty("totals").GetProperty("activeBatches").GetInt32()==501 && a.GetProperty("totals").GetProperty("warningBatches").GetInt32()==501);
        var last=JsonSerializer.SerializeToElement(store.History("batches",26,20,null,"warning","oldest"),Store.Json);
        Assert(last.GetProperty("total").GetInt32()==501 && last.GetProperty("items").GetArrayLength()==1);
    });
    Test("H13 dashboard prices resolve expired batches beyond UI page limit",()=>{
        var store=new Store(Path.Combine(testDir,"historical-prices.db"));var real=DateTimeOffset.UtcNow;
        store.Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;for(var i=0;i<600;i++)Inventory.Deliver(s,new("priced-history-"+i,[new("t",100,"g",real.AddHours(1),UnitCost:1,Currency:"RUB")]),"priced-"+i,real);Inventory.Expire(s,real.AddHours(1));s.DemoOffsetHours=2;return 0;});
        var dashboard=JsonSerializer.SerializeToElement(store.Dashboard(),Store.Json);Assert(dashboard.GetProperty("batches").GetArrayLength()==500);Assert(dashboard.GetProperty("analytics").GetProperty("costs")[0].GetProperty("wasted").GetDecimal()==60000);store.VerifyIntegrity();
    });
    Test("H12 v2 to v3 backup, unknown old prices and restored journals",()=>{
        var path=Path.Combine(testDir,"prices-v2.db");new Store(path).Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;Delivery(s,1000,now.AddDays(1));return 0;});
        using(var db=new Microsoft.Data.Sqlite.SqliteConnection("Data Source="+path)){db.Open();using var cmd=db.CreateCommand();cmd.CommandText="DELETE FROM schema_migrations WHERE version=3; UPDATE batches SET payload=json_remove(payload,'$.unitCost','$.currency');";cmd.ExecuteNonQuery();}
        var migrated=new Store(path);CheckPrices(migrated);var copy=Directory.GetFiles(testDir,"prices-v2.db.pre-v3-*.db").Single();CheckPrices(new Store(copy));
        void CheckPrices(Store store){store.VerifyIntegrity();store.Read(s=>{Assert(s.Batches.Single().UnitCost is null && s.Batches.Single().RemainingQuantity==1000 && s.Movements.Count==1);return 0;});}
    });
    Test("P13 v1 backup migration and unsupported schema refusal",()=>{
        var path=Path.Combine(testDir,"migration.db");new Store(path).Write(s=>{var f=Base();s.Products=f.Products;s.Dishes=f.Dishes;Delivery(s,500,now.AddDays(1));return 0;});
        using(var db=new Microsoft.Data.Sqlite.SqliteConnection("Data Source="+path)){db.Open();using var cmd=db.CreateCommand();cmd.CommandText="DELETE FROM schema_migrations WHERE version>=2; DROP TABLE audit;";cmd.ExecuteNonQuery();}
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
    Test("Offline reset clears all data and restores the factory demo", () => {
        var path = Path.Combine(testDir, "reset.db"); var store = new Store(path);
        store.Reset(true, now);
        store.Write(s => {
            s.DemoOffsetHours = 72; s.Settings = new Settings(Timezone: "UTC");
            Inventory.AddProduct(s, new("custom", "Custom", "g"), now);
            s.GeneratorEvents.Add(new("custom-event", now, 42, 1, "order", null, "error", "test")); return 0;
        });
        var before = store.Read(s => JsonSerializer.Serialize(s, Store.Json));
        try { store.Reset(true, DateTimeOffset.MaxValue); throw new Exception("Expected seed failure"); }
        catch (ArgumentOutOfRangeException) { }
        Assert(store.Read(s => JsonSerializer.Serialize(s, Store.Json)) == before, "Failed reset must roll back");
        var backup = Path.Combine(testDir, "reset-backup.db"); store.Backup(backup);
        store.Reset(false, now);
        Assert(new Store(path).Read(s => JsonSerializer.Serialize(s, Store.Json)) == JsonSerializer.Serialize(new State(), Store.Json), "Empty reset left data or settings");
        Assert(new Store(backup).Read(s => s.Products.Any(p => p.Id == "custom") && s.DemoOffsetHours == 72), "Backup changed");
        store.Reset(true, now);
        var expected = new State(); Demo.Seed(expected, now);
        store.Read(s => {
            Assert(s.Products.SequenceEqual(expected.Products));
            Assert(s.Dishes.Select(d => d.Id).SequenceEqual(expected.Dishes.Select(d => d.Id)));
            Assert(s.Deliveries.Count == expected.Deliveries.Count && s.Batches.Count == expected.Batches.Count && s.Orders.Count == expected.Orders.Count);
            Assert(s.DemoOffsetHours == 0 && s.Settings == new Settings() && s.GeneratorEvents.Count == 0);
            Assert(s.Batches.Where(b=>b.RemainingQuantity>0).Min(b => b.ExpiresAt) == now.AddHours(8)); Invariants(s); return 0;
        });
        store.Reset(true, now); Assert(store.Read(s => s.Products.Count) == expected.Products.Count, "Repeated reset duplicated demo");
        store.VerifyIntegrity();
    });
    testSucceeded=true;
} finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();if(testSucceeded)Directory.Delete(testDir,true);else Console.WriteLine("Failed domain databases retained: "+testDir); }
Console.WriteLine($"{passed} critical domain / real database checks passed.");
