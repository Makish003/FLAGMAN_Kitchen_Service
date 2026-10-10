using Flagman;
using System.Text.Json;
using System.Diagnostics;

public static class HackathonChecks
{
    static readonly DateTimeOffset Now=DateTimeOffset.Parse("2026-10-10T09:00:00Z");
    static void Check(bool ok,string message="Hackathon assertion"){if(!ok)throw new Exception(message);}
    static State Fixture(decimal[] stock,decimal[][] recipes,string[]? units=null) {
        var s=new State();for(var p=0;p<stock.Length;p++){Inventory.AddProduct(s,new("p"+p,"Продукт "+p,units?[p]??"g"),Now);Inventory.Deliver(s,new("D"+p,[new("p"+p,stock[p],units?[p]??"g",Now.AddHours(4))]),"d"+p,Now);}
        for(var d=0;d<recipes.Length;d++)Inventory.SaveDish(s,new("d"+d,"Блюдо "+d,"Тест",recipes[d].Select((q,p)=>new Ingredient("p"+p,q)).Where(i=>i.Quantity>0).ToList()),Now);return s;
    }
    // Independent exhaustive count vectors. Own stock arithmetic and objective, no production planner helpers.
    static decimal Oracle(State s,PlanningInput input) {
        var dishes=s.Dishes.Where(d=>!d.Archived).OrderBy(d=>d.Id,StringComparer.Ordinal).ToArray();
        var counts=new int[dishes.Length];decimal best=0;
        void Evaluate(){
            if(counts.Sum()>input.KitchenPortionsPerSlot)return;
            var needs=s.Products.ToDictionary(p=>p.Id,p=>dishes.Select((d,i)=>counts[i]*d.Ingredients.Where(x=>x.ProductId==p.Id).Sum(x=>x.Quantity)).Sum());decimal score=0;
            foreach(var p in s.Products){var need=needs[p.Id];foreach(var b in s.Batches.Where(b=>b.ProductId==p.Id&&b.ExpiresAt>Now).OrderBy(b=>b.ExpiresAt).ThenBy(b=>b.ReceivedAt).ThenBy(b=>b.Id,StringComparer.Ordinal)){
                var used=Math.Min(need,b.RemainingQuantity);need-=used;if(b.ExpiresAt<=Now.AddHours((double)Math.Min(p.WarningHours,s.Settings.WarningHours)))score+=used/b.RemainingQuantity*(1+s.Settings.WarningHours/((decimal)(b.ExpiresAt-Now).TotalHours+0.25m));
            }if(need>0)return;}best=Math.Max(best,score);
        }
        void Enumerate(int d){if(d==dishes.Length){Evaluate();return;}for(var q=0;q<=input.ManualLimits!.GetValueOrDefault(dishes[d].Id);q++){counts[d]=q;Enumerate(d+1);}}
        Enumerate(0);return best;
    }
    static void Replay(State s,PlannerResult result){
        var stock=s.Batches.ToDictionary(b=>b.Id,b=>b.RemainingQuantity);
        foreach(var row in result.Plan.OrderBy(p=>p.PrepareAt)){
            var dish=s.Dishes.Single(d=>d.Id==row.DishId);Check(!dish.Archived);
            foreach(var i in dish.Ingredients){var need=i.Quantity*row.Portions;foreach(var b in s.Batches.Where(b=>b.ProductId==i.ProductId&&b.ExpiresAt>row.PrepareAt).OrderBy(b=>b.ExpiresAt).ThenBy(b=>b.ReceivedAt).ThenBy(b=>b.Id,StringComparer.Ordinal)){
                var used=Math.Min(need,stock[b.Id]);stock[b.Id]-=used;need-=used;
                Check(row.Reasons.Where(r=>r.BatchId==b.Id).Sum(r=>r.Quantity)==used,"Explanation disagrees with independent FEFO");if(need==0)break;
            }Check(need==0,"Infeasible plan");}
        }
        Check(stock.Values.All(q=>q>=0));
        foreach(var risk in result.Risks)Check(risk.RemainingRisk==stock[risk.BatchId]);
    }
    public static void Run(Action<string,Action> test,string evidenceDirectory) {
        var reports=new List<object>();
        test("H06–H11 independent optimizer oracle, all fixed and random scenarios",()=>{
            var fixtures=new[]{Fixture([1000,1000],[[100,10],[100,100]]),Fixture([100,100],[[60,60],[50,50]]),Fixture([100,10],[[60,1],[50,5]]),Fixture([12,8],[[3,2],[2,1]], ["pcs","ml"]),Fixture([5000,6000],[[500,600],[300,400]])};
            var random=new Random(42);var strict=false;
            for(var n=0;n<65;n++){
                var s=n<fixtures.Length?fixtures[n]:Fixture([random.Next(5,30),random.Next(5,30)],[ [random.Next(1,8),random.Next(1,8)],[random.Next(1,8),random.Next(1,8)],[random.Next(1,8),random.Next(1,8)]]);
                if(n==5)s.Dishes[0]=s.Dishes[0] with{Archived=true};
                if(n==6)s.Batches[0]=s.Batches[0] with{ExpiresAt=Now.AddHours(1)};
                var input=new PlanningInput(DemandSource:"manual",ManualLimits:s.Dishes.Where(d=>!d.Archived).ToDictionary(d=>d.Id,_=>n==7?0:12));
                var before=JsonSerializer.Serialize(s,Store.Json);var result=SalesPlanner.Calculate(s,Now,input);var oracle=Oracle(s,input);
                Check(result.ProvenOptimal,$"Small case {n} not exact");Check(Math.Abs(result.Score-oracle)<0.000000000000000000001m,$"Oracle mismatch {n}");Check(result.Score>=result.BaselineScore);Replay(s,result);
                Check(before==JsonSerializer.Serialize(s,Store.Json),"Planner mutated stock");strict|=result.Score>result.BaselineScore;
                if(n==0)Check(result.Plan.Single().DishId=="d1"&&result.Plan.Single().Portions==10,"Required A/B control");
                reports.Add(new{scenario=n,score=result.Score,baseline=result.BaselineScore,oracle,mode=result.Mode,result.CalculationMs,result.Nodes});
            }Check(strict,"No strict improvement");
            File.WriteAllText(Path.Combine(evidenceDirectory,"planner-comparison.json"),JsonSerializer.Serialize(reports,new JsonSerializerOptions(Store.Json){WriteIndented=true}));
        });
        test("H08 cooking-time expiry, demand caps, large stock and history rejection",()=>{
            var s=Fixture([1000],[[100],[100]]);s.Batches[0]=s.Batches[0] with{ExpiresAt=Now.AddMinutes(30)};
            var timed=SalesPlanner.Calculate(s,Now,new(PreparationMinutes:30,KitchenPortionsPerSlot:1));Check(timed.Plan.Count==0);Replay(s,timed);
            var limited=SalesPlanner.Calculate(s,Now,new(DemandSource:"manual",ManualLimits:new(){{"d0",2},{"d1",1}}));Check(limited.Plan.Sum(p=>p.Portions)==3);
            var large=Fixture([1000000],[[1]]);var result=SalesPlanner.Calculate(large,Now,new());Check(result.Plan.Single().Portions==10000);Check(!result.ProvenOptimal||result.Score>=result.BaselineScore);Replay(large,result);
            var failed=false;try{SalesPlanner.Calculate(s,Now,new(DemandSource:"history"));}catch(DomainException){failed=true;}Check(failed);
            Inventory.PlaceOrder(s,new([new("d0",10)]),"competing",Now);Check(SalesPlanner.Calculate(s,Now,new()).Plan.Count==0);
        });
        test("H08–H13 multiple FEFO batches, scheduled portions, money completeness and temporal cache",()=>{
            var s=Fixture([600],[[100]]);s.Batches[0]=s.Batches[0] with{ExpiresAt=Now.AddHours(1),UnitCost=0.3m,Currency="RUB"};
            Inventory.Deliver(s,new("later",[new("p0",400,"g",Now.AddHours(4),UnitCost:0.5m,Currency:"RUB")]),"later",Now);
            var input=new PlanningInput(DemandSource:"manual",ManualLimits:new(){{"d0",8}},PreparationMinutes:30,KitchenPortionsPerSlot:2);
            var result=SalesPlanner.Calculate(s,Now,input);Replay(s,result);Check(result.Plan.Where(p=>p.PrepareAt>=Now.AddHours(1)).SelectMany(p=>p.Reasons).All(r=>r.BatchId!=s.Batches[0].Id));
            var money=SalesPlanner.Calculate(s,Now,new(Objective:"money",Currency:"RUB"));Check(money.PricedBatches==2);Replay(s,money);
            var invalid=false;try{SalesPlanner.Calculate(s,Now,new(Objective:"money",Currency:"USD"));}catch(DomainException){invalid=true;}Check(invalid);
            var planner=new PlanningService();var cached=planner.Calculate(s,Now,new());Check(ReferenceEquals(cached,planner.Calculate(s,Now.AddSeconds(1),new())));Check(!ReferenceEquals(cached,planner.Calculate(s,Now.AddHours(4),new())));
            var small=new PlanningInput(DemandSource:"manual",ManualLimits:new(){{"d0",10}});var exact=SalesPlanner.Calculate(s,Now,small);Check(Math.Abs(exact.Score-Oracle(s,small))<0.000000000000000000001m,"Multi-batch objective disagrees with rational oracle (decimal tolerance 1e-21)");
        });
        test("H12–H13 historical prices, kg conversion, exact actual costs and currencies",()=>{
            var s=Fixture([1000],[[100]]);Check(s.Batches[0].UnitCost is null);
            Inventory.Deliver(s,new("priced",[new("p0",2,"kg",Now.AddHours(2),UnitCost:300,Currency:"RUB")]),"price",Now);Check(s.Batches[1].UnitCost==0.3m);
            Inventory.PlaceOrder(s,new([new("d0",5)]),"sale",Now);Inventory.Expire(s,Now.AddHours(2));
            var analytics=JsonSerializer.SerializeToElement(Insights.Analytics(s,Now,Now.AddHours(3)),Store.Json);var cost=analytics.GetProperty("costs")[0];Check(cost.GetProperty("consumed").GetDecimal()==150);Check(cost.GetProperty("wasted").GetDecimal()==450);
            var result=SalesPlanner.Calculate(s,Now,new());Check(result.PricedBatches==0);
        });
        test("H19–H23 closed night, shared demand, expiry before/inside arrival, no history, excess",()=>{
            var s=Fixture([1000],[[100],[100]]);s.Settings=s.Settings with{OpenHour=12,CloseHour=22,LeadTimeHours=2,PlanningHours=6,ForecastHours=12,ManualDailyDemand=new(){{"d0",10},{"d1",10}},SafetyFactor=0};
            var midnight=DateTimeOffset.Parse("2026-10-10T21:00:00Z");Check(ScenarioDemand.Expected(s,ScenarioDemand.Build(s,midnight,"normal"),"d0",midnight,midnight.AddHours(8))==0);
            s.Batches[0]=s.Batches[0] with{ExpiresAt=Now.AddHours(1)};var result=ScenarioDemand.Calculate(s,Now,new(PurchaseShelfLifeHours:1,PurchaseQuantities:new(){{"p0",3000}}));
            Check(result.Purchases.Single().UsableAtArrival==0);Check(result.Purchases.Single().LikelyExcess>0);Check(result.Forecasts.All(f=>f.Reason.Contains("истечение")));
            var noHistory=Fixture([10],[[100],[100]]);Check(!ScenarioDemand.Calculate(noHistory,Now,new()).Demand.HasHistory);
            Check(ScenarioDemand.Calculate(noHistory,Now,new()).Purchases.Single().ShelfLifeHours is null);
            var input=new OrderInput([new("d0",1)]);Inventory.PlaceOrder(noHistory,input,"rejected",Now);Inventory.PlaceOrder(noHistory,input,"rejected",Now);Check(noHistory.Orders.Count==1);
            var low=ScenarioDemand.Calculate(s,Now,new("low"));var high=ScenarioDemand.Calculate(s,Now,new("high"));Check(low.Purchases.Sum(p=>p.DemandAfterArrival)<high.Purchases.Sum(p=>p.DemandAfterArrival));
        });
        test("H09–H11 optimizer scale budgets and reproducible p95",()=>{
            var rows=new List<object>();foreach(var scale in new[]{(Dishes:20,Batches:100),(Dishes:100,Batches:1000)}) {
                var s=Fixture([10000,10000],Enumerable.Range(0,scale.Dishes).Select(i=>new decimal[]{100+i,80+i}).ToArray());
                var original=s.Batches.ToArray();s.Batches.Clear();for(var i=0;i<scale.Batches;i++){var b=original[i%2];s.Batches.Add(b with{Id="scale-"+i,RemainingQuantity=100,InitialQuantity=100});}
                var elapsed=new List<long>();for(var i=0;i<5;i++){var watch=Stopwatch.StartNew();var result=SalesPlanner.Calculate(s,Now,new());watch.Stop();Replay(s,result);Check(result.Score>=result.BaselineScore);elapsed.Add(watch.ElapsedMilliseconds);}
                var p95=elapsed.Order().Last();Console.WriteLine($"METRIC planner {scale.Dishes}/{scale.Batches} p95 {p95}ms");Check(p95<(scale.Dishes==20?1000:2100),"Planner latency budget");rows.Add(new{scale.Dishes,scale.Batches,p95Ms=p95,samples=elapsed});
            }File.WriteAllText(Path.Combine(evidenceDirectory,"planner-benchmark.json"),JsonSerializer.Serialize(rows,Store.Json));
        });
        test("H19–H23 chronological held-out synthetic historical backtest",()=>{
            var cases=new List<object>();decimal modelDemandError=0,simpleDemandError=0,modelStopError=0,simpleStopError=0;
            for(var window=0;window<14;window++){
                var cutoff=Now.AddDays(window);var s=Fixture([800],[[100]]);s.Batches[0]=s.Batches[0] with{ExpiresAt=cutoff.AddDays(3)};
                s.Settings=s.Settings with{OpenHour=12,CloseHour=22,MinimumHistoryDays=3,MinimumHistoryOrders=10,ForecastHours=24};
                // Seven days of immutable historical accepted orders; the future day is not added to training.
                for(var day=1;day<=7;day++)for(var eventNo=0;eventNo<4;eventNo++)s.Orders.Add(new($"training-{day}-{eventNo}",cutoff.AddDays(-day).AddHours(eventNo<2?1:6),"accepted",[new("d0",eventNo<2?1:3)],[]));
                var model=ScenarioDemand.Build(s,cutoff,"normal");Check(model.HasHistory);
                var modelDemand=ScenarioDemand.Expected(s,model,"d0",cutoff,cutoff.AddHours(4));
                var simpleDaily=s.Orders.Sum(o=>o.Items.Sum(i=>(decimal)i.Portions))/7;
                var simpleDemand=simpleDaily*4/24;
                // Actual held-out orders are replayed independently after the training cutoff.
                // Changed rush days are deliberately retained, including unsuccessful predictions.
                var future=window%5==0?new[]{(Hours:1,Portions:3),(Hours:2,Portions:3),(Hours:3,Portions:2)}:new[]{(Hours:1,Portions:1),(Hours:1,Portions:1),(Hours:6,Portions:3),(Hours:6,Portions:3)};
                var observedDemand=future.Where(o=>o.Hours<4).Sum(o=>(decimal)o.Portions);
                var modelStop=ScenarioDemand.Calculate(s,cutoff,new()).Forecasts.Single().StopTo;
                var replay=JsonSerializer.Deserialize<State>(JsonSerializer.Serialize(s,Store.Json),Store.Json)!;DateTimeOffset? observedStop=null;
                for(var i=0;i<future.Length;i++){var at=cutoff.AddHours(future[i].Hours);Inventory.PlaceOrder(replay,new([new("d0",future[i].Portions)]),"future-"+i,at);if(Inventory.Portions(replay,replay.Dishes[0],at)==0)observedStop??=at;}
                Check(observedStop.HasValue,"Synthetic holdout must contain a real stop event");
                var predictedStopHours=modelStop.HasValue?(decimal)(modelStop.Value-cutoff).TotalHours:24m;
                var simpleStopHours=(800m-100m)/100m/simpleDaily*24;
                var md=Math.Abs(modelDemand-observedDemand);var sd=Math.Abs(simpleDemand-observedDemand);var ms=Math.Abs(predictedStopHours-(decimal)(observedStop!.Value-cutoff).TotalHours);var ss=Math.Abs(simpleStopHours-(decimal)(observedStop.Value-cutoff).TotalHours);
                modelDemandError+=md;simpleDemandError+=sd;modelStopError+=ms;simpleStopError+=ss;
                cases.Add(new{window,trainingOrders=model.TrainingOrders,trainingEnd=cutoff,futureEnd=cutoff.AddDays(1),futureOrders=future.Select(o=>new{at=cutoff.AddHours(o.Hours),o.Portions}),observedStop,observedDemand,modelDemand,simpleDemand,modelDemandError=md,simpleDemandError=sd,modelStopErrorHours=ms,simpleStopErrorHours=ss,modelWorse=md>sd||ms>ss});
            }
            File.WriteAllText(Path.Combine(evidenceDirectory,"demand-backtest.json"),JsonSerializer.Serialize(new{synthetic=true,windows=14,trainingOrdersPerWindow=28,chronologicalSplit=true,modelDemandMae=modelDemandError/14,simpleDemandMae=simpleDemandError/14,modelStopMaeHours=modelStopError/14,simpleStopMaeHours=simpleStopError/14,cases},new JsonSerializerOptions(Store.Json){WriteIndented=true}));
        });
    }
}
