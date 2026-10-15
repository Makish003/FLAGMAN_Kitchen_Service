namespace Flagman;

public record DemandModel(Dictionary<string,decimal> Daily, Dictionary<string,decimal> HourWeights,
    bool HasHistory, string Basis, string Scenario, int TrainingOrders, int TrainingDays);
public record ScenarioInput(string Scenario="normal", Dictionary<string,decimal>? ManualDaily=null,
    decimal? PurchaseShelfLifeHours=null, Dictionary<string,decimal>? PurchaseQuantities=null,
    int? LeadTimeHours=null, List<FutureSupply>? FutureSupplies=null);
public record FutureSupply(string ProductId,decimal Quantity,DateTimeOffset Arrival,DateTimeOffset ExpiresAt);
public record ScenarioPurchase(string ProductId,string Name,string Unit,decimal Quantity,
    decimal DemandBeforeArrival,decimal UsableAtArrival,decimal DemandAfterArrival,DateTimeOffset Arrival,
    decimal? LikelyExcess,decimal? ShelfLifeHours,string Basis);
public record ScenarioForecast(string DishId,string DishName,DateTimeOffset? StopFrom,DateTimeOffset? StopTo,string Reason);
public record ScenarioResult(DemandModel Demand,List<ScenarioForecast> Forecasts,List<ScenarioPurchase> Purchases,string Limitations,long Revision=0);

public static class ScenarioDemand
{
    public static bool IsOpen(Settings settings,DateTimeOffset at) {
        var local=TimeZoneInfo.ConvertTime(at,TimeZoneInfo.FindSystemTimeZoneById(settings.Timezone));
        return (settings.OpenDays??[0,1,2,3,4,5,6]).Contains((int)local.DayOfWeek) && local.Hour>=settings.OpenHour && local.Hour<settings.CloseHour;
    }
    static string HourKey(Settings settings,DateTimeOffset at) {
        var local=TimeZoneInfo.ConvertTime(at,TimeZoneInfo.FindSystemTimeZoneById(settings.Timezone));return $"{(int)local.DayOfWeek}:{local.Hour}";
    }
    public static DemandModel Build(State s,DateTimeOffset now,string scenario,Dictionary<string,int>? manual=null,Dictionary<string,decimal>? manualDaily=null) {
        Inventory.Require(scenario is "low" or "normal" or "high","Неизвестный сценарий");
        var orders=s.Orders.Where(o=>o.CreatedAt>=now.AddDays(-s.Settings.DemandWindowDays)&&o.CreatedAt<now && (o.Status=="accepted" || s.Settings.IncludeRejectedDemand&&o.Status=="rejected")).GroupBy(o=>o.Id).Select(g=>g.First()).ToArray();
        var days=orders.Select(o=>TimeZoneInfo.ConvertTime(o.CreatedAt,TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone)).Date).Distinct().Count();
        var enough=days>=s.Settings.MinimumHistoryDays && orders.Length>=s.Settings.MinimumHistoryOrders;
        var supplied=manualDaily??s.Settings.ManualDailyDemand;
        if(supplied is not null)Inventory.Require(supplied.All(x=>x.Value is >=0 and <=10000 && s.Dishes.Any(d=>!d.Archived&&d.Id==x.Key)),"Ручной спрос относится к активным блюдам и должен быть 0–10000");
        var factor=scenario=="low"?0.6m:scenario=="high"?1.4m:1m;
        var daily=s.Dishes.Where(d=>!d.Archived).ToDictionary(d=>d.Id,d=>factor*(supplied?.GetValueOrDefault(d.Id)??(enough?orders.SelectMany(o=>o.Items).Where(i=>i.DishId==d.Id).Sum(i=>(decimal)i.Portions)/s.Settings.DemandWindowDays:0)));
        // Learned weekday/hour profile only after sufficient data; otherwise calendar-uniform fallback.
        var hourly=new Dictionary<string,decimal>();
        if(enough && supplied is null) {
            var groups=orders.Where(o=>IsOpen(s.Settings,o.CreatedAt)).GroupBy(o=>HourKey(s.Settings,o.CreatedAt)).ToDictionary(g=>g.Key,g=>g.Sum(o=>o.Items.Sum(i=>(decimal)i.Portions)));
            var average=groups.Values.DefaultIfEmpty(0).Average();
            for(var day=0;day<7;day++)for(var hour=s.Settings.OpenHour;hour<s.Settings.CloseHour;hour++)hourly[$"{day}:{hour}"]=average>0?(groups.GetValueOrDefault($"{day}:{hour}")+average)/(2*average):1;
            // Normalize over the week, preserving weekday demand differences.
            var workdays=s.Settings.OpenDays??[0,1,2,3,4,5,6];
            var total=hourly.Where(x=>workdays.Contains(int.Parse(x.Key.Split(':')[0]))).Sum(x=>x.Value);
            foreach(var key in hourly.Keys.ToArray())hourly[key]*=workdays.Count*(s.Settings.CloseHour-s.Settings.OpenHour)/total;
        }
        return new(daily,hourly,enough,supplied is not null?"Ручной сценарий всего активного меню":enough?"История; сглаженный профиль дня недели/часа"+(s.Settings.IncludeRejectedDemand?"; отказы включены как гипотеза":"; только принятые продажи"):"Недостаточно истории: расход не прогнозируется, учитываются сроки",scenario,orders.Length,days);
    }
    public static decimal Rate(State s,DemandModel model,string dishId,DateTimeOffset at)
        =>IsOpen(s.Settings,at)?model.Daily.GetValueOrDefault(dishId)/(s.Settings.CloseHour-s.Settings.OpenHour)*model.HourWeights.GetValueOrDefault(HourKey(s.Settings,at),1):0;
    public static decimal Expected(State s,DemandModel model,string dish,DateTimeOffset start,DateTimeOffset end) {
        decimal total=0;for(var at=start;at<end;){var next=at.AddMinutes(15);if(next>end)next=end;total+=Rate(s,model,dish,at)*(decimal)(next-at).TotalHours;at=next;}return total;
    }
    public static ScenarioResult Calculate(State source,DateTimeOffset now,ScenarioInput input) {
        Inventory.Require(input.PurchaseShelfLifeHours is null or >0 and <=720,"Сценарий срока закупки: до 720 часов");
        var lead=input.LeadTimeHours??source.Settings.LeadTimeHours;Inventory.Require(lead is >=0 and <=720,"Доставка: 0–720 часов");
        Inventory.Require(input.PurchaseQuantities is null || input.PurchaseQuantities.All(x=>x.Value is >=0 and <=1000000000 && source.Products.Any(p=>p.Id==x.Key&&!p.Archived)),"Некорректные количества закупки");
        Inventory.Require(input.FutureSupplies is null || input.FutureSupplies.Count<=100 && input.FutureSupplies.All(x=>x.Arrival>=now && x.ExpiresAt>x.Arrival && x.Quantity>0 && source.Products.Any(p=>p.Id==x.ProductId)),"Будущие поставки требуют явных времени, срока и продукта");
        var model=Build(source,now,input.Scenario,manualDaily:input.ManualDaily);
        var s=System.Text.Json.JsonSerializer.Deserialize<State>(System.Text.Json.JsonSerializer.Serialize(source,Store.Json),Store.Json)!;
        var arrival=now.AddHours(lead);var finish=arrival.AddHours(s.Settings.PlanningHours);var forecastEnd=now.AddHours(s.Settings.ForecastHours);
        var end=finish>forecastEnd?finish:forecastEnd;
        var before=s.Products.ToDictionary(p=>p.Id,_=>0m);var after=s.Products.ToDictionary(p=>p.Id,_=>0m);var missing=s.Products.ToDictionary(p=>p.Id,_=>0m);
        var atArrival=new Dictionary<string,decimal>();var arrivalBatches=new List<Batch>();var forecasts=new Dictionary<string,ScenarioForecast>();var supplies=(input.FutureSupplies??[]).OrderBy(x=>x.Arrival).ToList();
        void Capture(DateTimeOffset at,DateTimeOffset previous) {
            if(at>forecastEnd)return;
            foreach(var d in s.Dishes.Where(d=>!d.Archived&&!forecasts.ContainsKey(d.Id)))if(Inventory.Portions(s,d,at)==0){
                var absent=d.Ingredients.First(i=>Inventory.Available(s,i.ProductId,at)<i.Quantity);
                var expiry=s.Batches.Any(b=>b.ProductId==absent.ProductId&&b.ExpiresAt>previous&&b.ExpiresAt<=at);
                forecasts[d.Id]=new(d.Id,d.Name,previous,at,$"{Inventory.Product(s,absent.ProductId).Name}: "+(expiry?"истечение партии":"расход / исходный дефицит"));
            }
        }
        Capture(now,now);
        for(var at=now;at<end;){
            foreach(var supply in supplies.Where(x=>x.Arrival<=at).ToArray()){s.Batches.Add(new("future-"+s.Batches.Count,"scenario",supply.ProductId,supply.Quantity,supply.Quantity,supply.Arrival,supply.ExpiresAt,null,null,"scenario"));supplies.Remove(supply);}
            if(at==arrival){arrivalBatches=Inventory.FreeBatches(s);foreach(var p in s.Products)atArrival[p.Id]=Inventory.Available(s,p.Id,at);}
            var next=at.AddMinutes(15);if(next>end)next=end;if(at<arrival&&next>arrival)next=arrival;if(at<finish&&next>finish)next=finish;if(at<forecastEnd&&next>forecastEnd)next=forecastEnd;
            // Split at local hour changes, expiration and explicit supply events.
            var zone=TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone);var local=TimeZoneInfo.ConvertTime(at,zone);var toHour=at.AddMinutes(60-local.Minute).AddSeconds(-local.Second).AddTicks(-(local.Ticks%TimeSpan.TicksPerSecond));if(toHour>at&&toHour<next)next=toHour;
            foreach(var time in s.Batches.Where(b=>b.RemainingQuantity>0&&b.ExpiresAt>at).Select(b=>b.ExpiresAt).Concat(supplies.Select(x=>x.Arrival)))if(time>at&&time<next)next=time;
            foreach(var p in s.Products){
                var amount=s.Dishes.Where(d=>!d.Archived).Sum(d=>Rate(s,model,d.Id,at)*d.Ingredients.Where(i=>i.ProductId==p.Id).Sum(i=>i.Quantity))*(decimal)(next-at).TotalHours;
                if(at<arrival)before[p.Id]+=amount;else if(at<finish)after[p.Id]+=amount;
                var used=Math.Min(amount,Inventory.Available(s,p.Id,at));if(used>0)Inventory.Consume(s,p.Id,used,at);
                if(at>=arrival&&at<finish)missing[p.Id]+=amount-used;
            }
            Capture(next,at);at=next;
        }
        var purchases=new List<ScenarioPurchase>();
        foreach(var p in s.Products.Where(p=>!p.Archived)) {
            var quantity=missing[p.Id]+after[p.Id]*s.Settings.SafetyFactor;
            if(!model.HasHistory&&input.ManualDaily is null&&s.Settings.ManualDailyDemand is null)quantity=Math.Max(0,s.Dishes.Where(d=>!d.Archived).SelectMany(d=>d.Ingredients).Where(i=>i.ProductId==p.Id).Sum(i=>i.Quantity)-atArrival.GetValueOrDefault(p.Id));
            // Continuous time conversions can leave sub-nanounit residue at an exact milligram boundary.
            quantity=decimal.Ceiling(decimal.Round(quantity,9)*1000)/1000;
            var selected=input.PurchaseQuantities?.GetValueOrDefault(p.Id,quantity)??quantity;
            decimal? excess=null;
            if(input.PurchaseShelfLifeHours is {} shelf && (model.HasHistory||input.ManualDaily is not null||s.Settings.ManualDailyDemand is not null)){
                var expiry=arrival.AddHours((double)shelf);
                var projection=new State{Batches=arrivalBatches.Where(b=>b.ProductId==p.Id).ToList()};
                var purchase=new Batch("scenario-purchase","scenario",p.Id,selected,selected,arrival,expiry,null,shelf,"scenario");projection.Batches.Add(purchase);
                var future=(input.FutureSupplies??[]).Where(x=>x.ProductId==p.Id&&x.Arrival>arrival&&x.Arrival<expiry).ToList();
                for(var at=arrival;at<expiry;){
                    foreach(var supply in future.Where(x=>x.Arrival<=at).ToArray()){projection.Batches.Add(new("excess-"+projection.Batches.Count,"scenario",p.Id,supply.Quantity,supply.Quantity,supply.Arrival,supply.ExpiresAt,null,null,"scenario"));future.Remove(supply);}
                    var next=at.AddMinutes(15);if(next>expiry)next=expiry;
                    foreach(var time in projection.Batches.Where(b=>b.ExpiresAt>at).Select(b=>b.ExpiresAt).Concat(future.Select(x=>x.Arrival)))if(time>at&&time<next)next=time;
                    var consumption=source.Dishes.Where(d=>!d.Archived).Sum(d=>Expected(source,model,d.Id,at,next)*d.Ingredients.Where(i=>i.ProductId==p.Id).Sum(i=>i.Quantity));
                    var use=Math.Min(consumption,Inventory.Available(projection,p.Id,at));if(use>0)Inventory.Consume(projection,p.Id,use,at);at=next;
                }
                excess=projection.Batches.Single(b=>b.Id==purchase.Id).RemainingQuantity;
            }
            if(quantity>0||selected>0)purchases.Add(new(p.Id,p.Name,p.Unit,selected,before[p.Id],atArrival.GetValueOrDefault(p.Id),after[p.Id],arrival,excess,input.PurchaseShelfLifeHours,model.Basis));
        }
        return new(model,s.Dishes.Where(d=>!d.Archived).Select(d=>forecasts.GetValueOrDefault(d.Id)??new(d.Id,d.Name,null,null,"В горизонте недоступность не обнаружена")).ToList(),purchases,
            "Сценарии 60%/100%/140%, не доверительные интервалы. Стоп-лист указан интервалом шага до 15 минут. Закрытые часы без расхода. Учитывается потребность всего активного меню, в том числе неудовлетворённая. Без истории/ручного спроса закупка лишь восстанавливает по одной порции меню. Избыток моделируется по FEFO до заданного срока (до 720 ч); без срока или спроса не определён.",source.Revision);
    }
}
