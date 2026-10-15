using Flagman;

public static class KitchenChecks
{
 public static int Run()
 {
  var now=DateTimeOffset.Parse("2026-10-15T10:00:00Z");
  var s=new State();var manager=new Actor("manager","manager");var cook=new Actor("cook","cook");var waiter=new Actor("waiter","waiter");
  var account=AccessService.SaveAccount(s,null,new("cook","Повар","cook","cook-password"),manager,now);
  WorkflowChecks.Check(AccessService.Login(s,"cook","cook-password")?.Role=="cook","Cook cannot log in");
  Inventory.AddProduct(s,new("p","Продукт","g"),now);
  Inventory.SaveDish(s,new("d","Блюдо","Тест",[new("p",500)]),now);
  Inventory.Deliver(s,new("receipt",[new("p",500,"g",now.AddHours(1))]),"receipt",now);
  var order=WorkflowService.SubmitOrder(s,new([new("d",1)]),waiter,"submit",now);
  WorkflowChecks.Check(s.Batches.Single().RemainingQuantity==500,"Pending order consumed stock");
  Error(()=>WorkflowService.ServeOrder(s,order.Id,new(1),waiter,"early",now),409);
  Error(()=>WorkflowService.DecideOrder(s,order.Id,new(1,"accept"),manager,"bypass",now),403);
  var ready=WorkflowService.DecideOrder(s,order.Id,new(1,"accept"),cook,"ready",now);
  WorkflowChecks.Check(ready.Status=="ready"&&ready.Version==2&&ready.DecisionActorId==cook.UserId,"Cook must mark ready");
  WorkflowChecks.Check(s.Batches.Single().RemainingQuantity==0&&s.Orders.Single().Status=="accepted","Ready must consume once");
  WorkflowService.DecideOrder(s,order.Id,new(1,"accept"),cook,"ready",now);
  WorkflowChecks.Check(s.Movements.Count(x=>x.Kind=="order")==1,"Retry consumed twice");
  Error(()=>WorkflowService.ServeOrder(s,order.Id,new(2),new("other","waiter"),"foreign",now),404);
  Error(()=>WorkflowService.ServeOrder(s,order.Id,new(2),cook,"cook-serve",now),403);
  Error(()=>WorkflowService.ServeOrder(s,order.Id,new(1),waiter,"stale",now),409);
  var served=WorkflowService.ServeOrder(s,order.Id,new(2),waiter,"serve",now.AddMinutes(1));
  WorkflowChecks.Check(served.Status=="served"&&served.Version==3&&served.ServedById==waiter.UserId&&served.ServedAt==now.AddMinutes(1),"Missing serving author/time");
  WorkflowService.ServeOrder(s,order.Id,new(2),waiter,"serve",now.AddMinutes(2));
  Error(()=>WorkflowService.ServeOrder(s,order.Id,new(2),waiter,"again",now),409);
  WorkflowChecks.Check(s.Movements.Count(x=>x.Kind=="order")==1,"Serving consumed stock");
  var path=Path.Combine(Path.GetTempPath(),"flagman-kitchen-"+Guid.NewGuid()+".db");var store=new Store(path);
  store.Write(data=>{data.Users=s.Users;data.OrderRequests=s.OrderRequests;return 0;});
  var persisted=new Store(path).Read(data=>data.OrderRequests.Single());
  WorkflowChecks.Check(System.Text.Json.JsonSerializer.Serialize(persisted,Store.Json)==System.Text.Json.JsonSerializer.Serialize(served,Store.Json),"Restart lost kitchen lifecycle fields");
  // Previously accepted documents remain historical, not newly ready for serving.
  s.OrderRequests[0]=served with{Status="accepted"};
  Error(()=>WorkflowService.ServeOrder(s,order.Id,new(3),waiter,"legacy",now),409);
  Inventory.Deliver(s,new("next",[new("p",500,"g",now.AddHours(1))]),"next",now);
  var managerOrder=WorkflowService.SubmitOrder(s,new([new("d",1)]),manager,"manager-order",now);
  WorkflowService.DecideOrder(s,managerOrder.Id,new(1,"accept"),cook,"manager-ready",now);
  Error(()=>WorkflowService.ServeOrder(s,managerOrder.Id,new(2),waiter,"foreign-manager",now),404);
  var managerServed=WorkflowService.ServeOrder(s,managerOrder.Id,new(2),manager,"manager-serve",now);
  WorkflowChecks.Check(managerServed.Status=="served","Manager cannot serve own authored order");
  Console.WriteLine("PASS Cook_account_login_ready_consumes_once");
  Console.WriteLine("PASS Serving_ownership_versions_retry_restart_legacy_history");return 2;
 }
 static void Error(Action action,int status){try{action();}catch(DomainException e){WorkflowChecks.Check(e.Status==status,"Wrong error status");return;}throw new Exception("Expected rejection "+status);}
}
