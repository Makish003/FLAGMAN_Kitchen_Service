using System.Diagnostics;
using System.Text.Json;

namespace Flagman;

public record PlanningInput(int HorizonHours = 12, DateTimeOffset? ShiftEnd = null,
    string DemandSource = "stock", Dictionary<string, int>? ManualLimits = null,
    int PreparationMinutes = 0, int KitchenPortionsPerSlot = 10000,
    string Scenario = "normal", string Objective = "risk", string? Currency = null);
public record PlannedDish(string DishId, string DishName, int Portions, DateTimeOffset PrepareAt,
    List<RecommendationReason> Reasons, string LimitingIngredient);
public record BatchRisk(string BatchId, string ProductId, string ProductName, string Unit, DateTimeOffset ExpiresAt,
    decimal InitialRisk, decimal PlannedUse, decimal RemainingRisk, decimal UsedFraction,
    decimal? InitialCost, decimal? RemainingCost, string? Currency);
public record PlannerResult(long Revision, DateTimeOffset Start, DateTimeOffset End, DateTimeOffset ValidUntil,
    PlanningInput Parameters, string DemandBasis, string Mode, bool ProvenOptimal, string StopReason,
    long CalculationMs, long BaselineCalculationMs, long Nodes, decimal Score, decimal BaselineScore, List<PlannedDish> Plan,
    List<PlannedDish> Baseline, List<BatchRisk> Risks, string Limitations, int PricedBatches, int RiskBatches);

/// <summary>Pure, bounded integer search. Frozen batch fractions prevent mixing physical units.</summary>
public static class SalesPlanner
{
    sealed record Choice(int Dish, int Slot, int Count);
    public static PlannerResult Calculate(State s, DateTimeOffset now, PlanningInput input, int budgetMs = 1500)
    {
        Inventory.Require(input.HorizonHours is 6 or 12 or 24 || input.ShiftEnd.HasValue,"Горизонт: 6, 12, 24 ч или конец смены");
        var end=input.ShiftEnd ?? now.AddHours(input.HorizonHours);
        Inventory.Require(end>now && end<=now.AddHours(24),"Конец смены должен быть в следующих 24 часах");
        Inventory.Require(input.PreparationMinutes is >=0 and <=120 && input.KitchenPortionsPerSlot is >0 and <=10000,"Некорректная ёмкость кухни");
        Inventory.Require(input.DemandSource is "stock" or "manual" or "history","Источник спроса неизвестен");
        Inventory.Require(input.Objective is "risk" or "money","Целевая функция неизвестна");
        Inventory.Require(input.Scenario is "low" or "normal" or "high","Сценарий неизвестен");
        var watch=Stopwatch.StartNew();
        if(s.Dishes.Count<=20&&s.Batches.Count<=100)budgetMs=Math.Min(budgetMs,650);
        var dishes=s.Dishes.Where(d=>!d.Archived && d.Ingredients.Count>0).OrderBy(d=>d.Id,StringComparer.Ordinal).ToArray();
        var batches=Inventory.FreeBatches(s).Where(b=>b.RemainingQuantity>0 && b.ExpiresAt>now).OrderBy(b=>b.ExpiresAt).ThenBy(b=>b.ReceivedAt).ThenBy(b=>b.Id,StringComparer.Ordinal).ToArray();
        var products=s.Products.ToDictionary(p=>p.Id);
        var risk=batches.Select(b=>b.ExpiresAt<=now.AddHours((double)Math.Min(products[b.ProductId].WarningHours,s.Settings.WarningHours))).ToArray();
        if(input.Objective=="money") {
            Inventory.Require(!string.IsNullOrEmpty(input.Currency),"Выберите валюту");
            Inventory.Require(batches.Where((b,i)=>risk[i]).All(b=>b.UnitCost.HasValue&&b.Currency==input.Currency),"Денежный режим требует цены каждой рисковой партии в выбранной валюте");
        }
        var weight=batches.Select((b,i)=>!risk[i]?0m:
            (input.Objective=="money" ? b.UnitCost!.Value : 1m/b.RemainingQuantity)*
            (1+s.Settings.WarningHours/((decimal)(b.ExpiresAt-now).TotalHours+0.25m))).ToArray();
        var batchIndices=dishes.Select(d=>d.Ingredients.Select(i=>Array.FindAll(Enumerable.Range(0,batches.Length).ToArray(),j=>batches[j].ProductId==i.ProductId)).ToArray()).ToArray();
        var demand=ScenarioDemand.Build(s,now,input.Scenario,input.DemandSource=="manual"?input.ManualLimits:null);
        if(input.DemandSource=="history") Inventory.Require(demand.HasHistory,"Недостаточно истории: выберите ручные лимиты или только склад");
        if(input.DemandSource=="manual") Inventory.Require(input.ManualLimits is not null && input.ManualLimits.All(x=>x.Value is >=0 and <=10000 && dishes.Any(d=>d.Id==x.Key)),"Ручные лимиты: 0–10000, только активные блюда");
        var limits=dishes.Select(d=>input.DemandSource switch {
            "manual"=>input.ManualLimits!.GetValueOrDefault(d.Id),
            "history"=>(int)Math.Min(10000,decimal.Ceiling(ScenarioDemand.Expected(s,demand,d.Id,now,end))),
            _=>Math.Min(10000,Inventory.Portions(s,d,now))}).ToArray();
        // A slot represents the completion time; zero prep is an explicit immediate-stock scenario.
        var slots=input.PreparationMinutes==0 ? new[]{now} : Enumerable.Range(1,(int)((end-now).TotalMinutes/input.PreparationMinutes)).Select(i=>now.AddMinutes(i*input.PreparationMinutes)).Where(t=>ScenarioDemand.IsOpen(s.Settings,t)).ToArray();
        var remaining=batches.Select(b=>b.RemainingQuantity).ToArray();
        int Max(int dish,int slot,int[] left,int capacity) {
            var cap=Math.Min(left[dish],capacity);
            for(var k=0;k<dishes[dish].Ingredients.Count;k++) {
                var available=batchIndices[dish][k].Where(j=>batches[j].ExpiresAt>slots[slot]).Sum(j=>remaining[j]);
                cap=(int)Math.Min(cap,decimal.Floor(available/dishes[dish].Ingredients[k].Quantity));
            }
            return cap;
        }
        decimal Apply(int dish,int slot,int count,List<(int Index,decimal Amount)> changes) {
            decimal gain=0;
            for(var k=0;k<dishes[dish].Ingredients.Count;k++) {
                var need=dishes[dish].Ingredients[k].Quantity*count;
                foreach(var j in batchIndices[dish][k]) {
                    if(batches[j].ExpiresAt<=slots[slot])continue;
                    var used=Math.Min(remaining[j],need); if(used==0)continue;
                    remaining[j]-=used; need-=used;changes.Add((j,used));gain+=used*weight[j];if(need==0)break;
                }
                if(need!=0)throw new InvalidOperationException("Planner FEFO invariant");
            }
            return gain;
        }
        void Undo(List<(int Index,decimal Amount)> changes){foreach(var c in changes)remaining[c.Index]+=c.Amount;}
        // Preserve greedy dish-first baseline, with the same feasible limits and frozen objective.
        var baseline=new List<Choice>();decimal baselineScore=0;var left=(int[])limits.Clone();
        for(var slot=0;slot<slots.Length;slot++) {
            var capacity=input.KitchenPortionsPerSlot;
            var candidates=Enumerable.Range(0,dishes.Length).ToList();
            while(candidates.Count>0&&capacity>0) {
                int best=-1;decimal bestGain=0;
                foreach(var d in candidates)if(Max(d,slot,left,capacity)>0){var changes=new List<(int,decimal)>();var gain=Apply(d,slot,1,changes);Undo(changes);if(gain>bestGain){best=d;bestGain=gain;}}
                if(best<0)break;candidates.Remove(best);
                var count=Max(best,slot,left,capacity); var change=new List<(int,decimal)>();baselineScore+=Apply(best,slot,count,change);
                left[best]-=count;capacity-=count;baseline.Add(new(best,slot,count));
            }
        }
        var baselineMs=watch.ElapsedMilliseconds;var bestPlan=new List<Choice>(baseline);var bestScore=baselineScore;
        remaining=batches.Select(b=>b.RemainingQuantity).ToArray();left=(int[])limits.Clone();
        long nodes=0;bool exhausted=false;var current=new List<Choice>();
        var dimensions=dishes.Length*slots.Length;
        // Search recursion is bounded for stack safety. No upper bound / optimality gap is claimed on cutoff.
        void Search(int position,int capacity,decimal score,int portions) {
            nodes++; if((nodes&127)==0 && (watch.ElapsedMilliseconds>=budgetMs || nodes>=500000)){exhausted=true;return;}
            if(score>bestScore || score==bestScore && portions<bestPlan.Sum(c=>c.Count)){bestScore=score;bestPlan=new(current);}
            if(position>=dimensions||exhausted)return;
            var slot=position/dishes.Length;var d=position%dishes.Length;
            var cap=Max(d,slot,left,capacity);
            for(var count=cap;count>=0;count--) {
                var changes=new List<(int,decimal)>();var gain=Apply(d,slot,count,changes);left[d]-=count;
                if(count>0)current.Add(new(d,slot,count));
                Search(position+1,(d+1)==dishes.Length?input.KitchenPortionsPerSlot:capacity-count,score+gain,portions+count);
                if(count>0)current.RemoveAt(current.Count-1);left[d]+=count;Undo(changes);if(exhausted)break;
            }
        }
        if(dimensions is >0 and <=64)Search(0,input.KitchenPortionsPerSlot,0,0);
        else if(dimensions>64){
            exhausted=true;
            // Bounded alternative dish orders for large spaces. Each is replayed from initial stock,
            // uses the same kitchen/demand/FEFO constraints, and may only replace a better incumbent.
            for(var first=0;first<dishes.Length&&watch.ElapsedMilliseconds<budgetMs;first++){
                remaining=batches.Select(b=>b.RemainingQuantity).ToArray();var allowance=(int[])limits.Clone();
                var alternative=new List<Choice>();decimal score=0;
                for(var slot=0;slot<slots.Length;slot++){
                    var capacity=input.KitchenPortionsPerSlot;
                    foreach(var d in Enumerable.Range(0,dishes.Length).OrderBy(d=>d==first?0:1).ThenBy(d=>d)){
                        var count=Max(d,slot,allowance,capacity);if(count==0)continue;
                        var changes=new List<(int,decimal)>();score+=Apply(d,slot,count,changes);capacity-=count;allowance[d]-=count;alternative.Add(new(d,slot,count));nodes++;
                    }
                }
                if(score>bestScore||score==bestScore&&alternative.Sum(c=>c.Count)<bestPlan.Sum(c=>c.Count)){bestScore=score;bestPlan=alternative;}
            }
        }
        List<PlannedDish> Explain(List<Choice> plan) {
            remaining=batches.Select(b=>b.RemainingQuantity).ToArray();var result=new List<PlannedDish>();
            foreach(var c in plan.OrderBy(c=>c.Slot).ThenBy(c=>c.Dish)) {
                var changes=new List<(int Index,decimal Amount)>();Apply(c.Dish,c.Slot,c.Count,changes);
                var reasons=changes.Select(x=>{var b=batches[x.Index];var p=products[b.ProductId];return new RecommendationReason(b.Id,p.Name,x.Amount,p.Unit,b.ExpiresAt,decimal.Round((decimal)(b.ExpiresAt-slots[c.Slot]).TotalHours,2));}).ToList();
                var limiting=dishes[c.Dish].Ingredients.OrderBy(i=>batches.Where(b=>b.ProductId==i.ProductId&&b.ExpiresAt>slots[c.Slot]).Sum(b=>b.RemainingQuantity)/i.Quantity).First();
                result.Add(new(dishes[c.Dish].Id,dishes[c.Dish].Name,c.Count,slots[c.Slot],reasons,products[limiting.ProductId].Name));
            }
            return result;
        }
        var baselineRows=Explain(baseline);var rows=Explain(bestPlan);
        var risks=batches.Select((b,i)=>new{b,i}).Where(x=>risk[x.i]).Select(x=>{
            var b=x.b;var used=b.RemainingQuantity-remaining[x.i];return new BatchRisk(b.Id,b.ProductId,products[b.ProductId].Name,products[b.ProductId].Unit,b.ExpiresAt,
                b.RemainingQuantity,used,remaining[x.i],used/b.RemainingQuantity,b.UnitCost*b.RemainingQuantity,b.UnitCost*remaining[x.i],b.Currency);
        }).ToList();
        watch.Stop();
        var boundaries=batches.Select(b=>b.ExpiresAt).Concat(batches.Select(b=>b.ExpiresAt.AddHours(-(double)Math.Min(products[b.ProductId].WarningHours,s.Settings.WarningHours))))
            .Concat(s.Orders.Select(o=>o.CreatedAt.AddDays(s.Settings.DemandWindowDays))).Where(t=>t>now).Append(now.AddSeconds(30));
        return new(s.Revision,now,end,boundaries.Min(),input,
            input.DemandSource=="stock"?"Только ограничения склада; продаваемость не оценена":input.DemandSource=="manual"?"Явные ручные лимиты":demand.Basis,
            exhausted?"bounded-search":"exact",!exhausted,exhausted?(dimensions>64?"Большая задача: ограниченный поиск порядков + базовый fallback":"Бюджет времени / 500000 узлов"):"Полное пространство перебрано",
            watch.ElapsedMilliseconds,baselineMs,nodes,bestScore,baselineScore,rows,baselineRows,risks,
            "Сценарная оценка предотвращения риска, не фактическая экономия. План не резервирует склад. Лимит кухни на слот задан пользователем. Технический предел 10000 порций каждого блюда соответствует контракту заказа; склад сверх предела не включён. Нулевое время приготовления означает расход сейчас. Верхняя граница и разрыв с оптимумом не заявлены.",risks.Count(r=>r.InitialCost.HasValue),risks.Count);
    }
}
