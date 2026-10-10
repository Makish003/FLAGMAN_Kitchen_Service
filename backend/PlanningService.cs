using System.Text.Json;

namespace Flagman;

public sealed class PlanningService
{
    readonly object gate=new();string? key;PlannerResult? cached;
    public PlannerResult Calculate(State state,DateTimeOffset now,PlanningInput input) {
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
        Inventory.Require(arrival>=now.AddMinutes(-5)&&arrival<=now.AddHours(720),"Предпросмотр: поступление сейчас или в следующие 720 часов");
        var beforeAtArrival=state.Dishes.Where(d=>!d.Archived).ToDictionary(d=>d.Id,d=>Inventory.Portions(state,d,arrival));
        Inventory.Deliver(state,input with {CreatedAt=arrival,ReceivedAt=arrival},Inventory.Id(),arrival);
        return new {now,arrival,changes=state.Dishes.Where(d=>!d.Archived).Select(d=>new {d.Id,d.Name,before=before[d.Id],beforeAtArrival=beforeAtArrival[d.Id],after=Inventory.Portions(state,d,arrival)})};
    }
}
