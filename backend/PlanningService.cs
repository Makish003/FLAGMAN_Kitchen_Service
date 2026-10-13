using System.Text.Json;

namespace Flagman;

public sealed class PlanningService
{
    readonly object gate=new();string? key;PlannerResult? cached;
    public PlannerResult Calculate(State state,DateTimeOffset now,PlanningInput input) {
        Inventory.Require(state.Dishes.Any(d=>!d.Archived),"Сначала добавьте активные блюда в меню.");
        var fingerprint=state.Revision+":"+JsonSerializer.Serialize(input,Store.Json);
        lock(gate){
            if(key==fingerprint&&cached is not null&&now>=cached.Start&&now<cached.ValidUntil)return cached;
            cached=SalesPlanner.Calculate(state,now,input);key=fingerprint;return cached;
        }
    }
    public static object PreviewOrder(State state,DateTimeOffset now,OrderInput input) {
        // This transient state is never saved, including rejected orders and movements.
        var revision=state.Revision;var order=Inventory.PlaceOrder(state,input,Inventory.Id(),now);
        return new {revision,now,order.Status,order.Shortages,
            consumption=state.Movements.Where(m=>m.OrderId==order.Id).Select(m=>new {m.BatchId,m.ProductId,quantity=-m.Quantity,productName=Inventory.Product(state,m.ProductId).Name,unit=Inventory.Product(state,m.ProductId).Unit,expiresAt=state.Batches.Find(b=>b.Id==m.BatchId)!.ExpiresAt})};
    }
    public static object PreviewDelivery(State state,DateTimeOffset now,DeliveryInput input) {
        var before=state.Dishes.Where(d=>!d.Archived).ToDictionary(d=>d.Id,d=>Inventory.Portions(state,d,now));
        var arrival=input.ReceivedAt??now;
        Inventory.Require(arrival<=now.AddHours(720),"Дата поступления для расчёта должна быть не дальше 30 дней от текущего времени учёта");
        var evaluatedAt=arrival>now?arrival:now;
        var beforeAtArrival=state.Dishes.Where(d=>!d.Archived).ToDictionary(d=>d.Id,d=>Inventory.Portions(state,d,evaluatedAt));
        var delivery=Inventory.Deliver(state,input with {CreatedAt=evaluatedAt,ReceivedAt=arrival},Inventory.Id(),evaluatedAt);
        return new {now,arrival,evaluatedAt,
            batches=state.Batches.Where(b=>b.DeliveryId==delivery.Id).Select(b=>new {b.ProductId,productName=Inventory.Product(state,b.ProductId).Name,unit=Inventory.Product(state,b.ProductId).Unit,quantity=b.InitialQuantity,b.ReceivedAt,b.ExpiresAt,usable=b.ExpiresAt>evaluatedAt}),
            changes=state.Dishes.Where(d=>!d.Archived).Select(d=>new {d.Id,d.Name,before=before[d.Id],beforeAtArrival=beforeAtArrival[d.Id],after=Inventory.Portions(state,d,evaluatedAt)})};
    }
}
