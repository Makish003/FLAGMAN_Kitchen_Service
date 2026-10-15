using Flagman;
using Microsoft.Data.Sqlite;
public static class WorkflowChecks
{
    public static int Run()
    {
        var now=DateTimeOffset.Parse("2026-10-14T10:00:00Z");
        var path=Path.Combine(Path.GetTempPath(),"flagman-workflow-"+Guid.NewGuid()+".db");
        var store=new Store(path);
        store.Write(s=>{ Inventory.AddProduct(s,new("tomato","Томаты","g"),now); Inventory.Deliver(s,new("old",[new("tomato",500.125m,"g",now.AddDays(1))]),"old",now); s.Users.Add(new("manager","manager","Менеджер","manager",true,"hash",1)); return 0; });
        using(var db=new SqliteConnection($"Data Source={path}")) { db.Open(); using var cmd=db.CreateCommand(); cmd.CommandText="DELETE FROM schema_migrations WHERE version>3; DROP TABLE users; DROP TABLE credentials; DROP TABLE procurementRequests; DROP TABLE deliveryRequests; DROP TABLE orderRequests; DROP TABLE offerOverrides;"; cmd.ExecuteNonQuery(); }
        store=new Store(path); var original=store.Read(s=>s.Batches.Single());
        Check(original.RemainingQuantity==500.125m,"Migration preserves decimals");
        Check(store.Read(s=>s.Users.Count+s.OrderRequests.Count+s.DeliveryRequests.Count+s.ProcurementRequests.Count)==0,"New collections empty");
        store.Write(s=>{s.Users.Add(new("manager","manager","Менеджер","manager",true,"hash",1));return 0;});
        Check(new Store(path).Read(s=>s.Users.Single().Id)=="manager","Account round trip");
        Check(new Store(path).Read(s=>s.Batches.Single())==original,"Restart preserves batch"); store.VerifyIntegrity();
        Console.WriteLine("PASS Migration_preserves_legacy_inventory"); var a=new Actor("manager","manager");var supplier=new Actor("supplier","supplier");
        store.Write(s=>{s.Users.Add(new("supplier","supplier","Поставщик","supplier",true,"hash"));Inventory.AddProduct(s,new("cream","Сливки","ml"),now);Inventory.SaveDish(s,new("dish","Блюдо","Тест",[new("tomato",500)]),now);return 0;});
        var request=store.Write(s=>WorkflowService.CreateProcurement(s,new("supplier",[new("t","tomato",10,"kg"),new("c","cream",5,"l")]),a,"proc",now));
        var response=new ProcurementResponseInput(1,[new("t",8,now.AddDays(2),Reason:"Меньше заказанного"),new("c",0,Reason:"Нет")]);
        var result=store.Write(s=>WorkflowService.RespondProcurement(s,request.Id,response,supplier,"response",now));
        Check(result.ProcurementRequest.Items[0].Quantity==10&&result.ProcurementRequest.Status=="partially_accepted","Original quantities");
        Check(store.Read(s=>s.Batches.Count)==1,"Response has no stock effect");
        var accepted=store.Write(s=>WorkflowService.AcceptDelivery(s,result.DeliveryRequestId!,new(1,[new(store.Read(x=>x.DeliveryRequests.Single().Items.Single().Id),7,Reason:"Брак")]),a,"accept",now));
        Check(accepted.Status=="partially_accepted"&&store.Read(s=>s.Batches.Sum(b=>b.InitialQuantity))==7500.125m,"Accept 7 of 8 kg");
        var replay=new Store(path).Write(s=>WorkflowService.RespondProcurement(s,request.Id,response,supplier,"response",now));Check(replay.DeliveryRequestId==result.DeliveryRequestId,"Response retry restart");
        var order=store.Write(s=>WorkflowService.SubmitOrder(s,new([new("dish",1)]),new("waiter","waiter"),"submit",now));var count=store.Read(s=>s.Movements.Count);
        Check(store.Read(s=>s.Orders.Count)==0,"Pending does not consume");
        var decided=store.Write(s=>WorkflowService.DecideOrder(s,order.Id,new(1,"accept"),a,"decision",now));Check(decided.Status=="accepted"&&store.Read(s=>s.Movements.Count)>count,"Accept consumes");
        new Store(path).Write(s=>WorkflowService.DecideOrder(s,order.Id,new(1,"accept"),a,"decision",now));store.VerifyIntegrity();
        Console.WriteLine("PASS Procurement_10kg_5l_response_8kg_0_accept_7kg_restart");Console.WriteLine("PASS Pending_order_does_not_consume_accept_once");var expired=store.Read(s=>s.Batches.First());var at=expired.ExpiresAt;store.Write(s=>Inventory.Expire(s,at));Check(store.Read(s=>s.Batches.First().RemainingQuantity)==expired.RemainingQuantity,"Expiry keeps physical stock");
        var written=store.Write(s=>Inventory.WriteOffExpired(s,expired.Id,a,"writeoff",at));Check(store.Read(s=>Inventory.BatchStatus(s,s.Batches.First(),at))=="written_off","Write off status");
        Check(new Store(path).Write(s=>Inventory.WriteOffExpired(s,expired.Id,a,"writeoff",at)).MovementId==written.MovementId,"Writeoff retry");
        store.Write(s=>{OfferPublication.Set(s,"dish",new("show",true,"Сегодня",0),a,now);return 0;});Check(new Store(path).Read(s=>OfferPublication.Build(s,now).Single().Emphasized),"Offer survives restart");store.VerifyIntegrity();Console.WriteLine("PASS Expiry_keeps_physical_stock_manual_writeoff_retry");Console.WriteLine("PASS Show_dish_without_auto_rank_override_restart");return 5;
    }
    public static void Check(bool value,string message) {if(!value)throw new Exception(message);}
}
