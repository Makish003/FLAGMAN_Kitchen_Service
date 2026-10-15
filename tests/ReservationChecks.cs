using Flagman;

public static class ReservationChecks
{
 static readonly DateTimeOffset Now=DateTimeOffset.Parse("2026-10-15T10:00:00Z");
 static readonly Actor Waiter=new("w","waiter"),Cook=new("c","cook");
 static State Fixture(decimal quantity=500){var s=new State();Inventory.AddProduct(s,new("p","Продукт","g"),Now);Inventory.SaveDish(s,new("d","Блюдо","Тест",[new("p",500)]),Now);Inventory.SaveDish(s,new("other","Другое блюдо","Тест",[new("p",300)]),Now);Inventory.Deliver(s,new("receipt",[new("p",quantity,"g",Now.AddHours(1))]),"receipt",Now);return s;}
 static void Error(Action a,int status){try{a();}catch(DomainException e){WorkflowChecks.Check(e.Status==status,"Wrong rejection status");return;}throw new Exception("Expected rejection "+status);}
 public static int Run(){
  var s=Fixture();var o=WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"submit",Now);
  WorkflowChecks.Check(Inventory.Available(s,"p",Now)==0&&Inventory.Portions(s,s.Dishes[1],Now)==0,"Pending kitchen order must reserve shared ingredients");
  WorkflowChecks.Check(s.Batches.Single().RemainingQuantity==500&&s.Movements.Count==1&&s.Orders.Count==0,"Reservation must not consume physical stock or count as sale");
  WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"submit",Now);
  Error(()=>WorkflowService.SubmitOrder(s,new([new("d",1)]),new("w2","waiter"),"second",Now),409);
  WorkflowService.DecideOrder(s,o.Id,new(1,"reject","Не готовим","other"),Cook,"reject",Now);
  WorkflowChecks.Check(Inventory.Available(s,"p",Now)==500&&s.Batches.Single().RemainingQuantity==500,"Reject must release reservation");
  o=WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"new",Now);
  var ready=WorkflowService.DecideOrder(s,o.Id,new(1,"accept"),Cook,"ready",Now);
  WorkflowChecks.Check(ready.Status=="ready"&&s.Batches.Single().RemainingQuantity==0,"Cook must consume own reservation");
  s=Fixture(700);Error(()=>WorkflowService.SubmitOrder(s,new([new("d",1),new("other",1)]),Waiter,"combined",Now),409);
  WorkflowChecks.Check(Inventory.Available(s,"p",Now)==700&&s.OrderRequests.Count==0,"Combined shortage left partial reservation");
  s=Fixture();o=WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"expire",Now);
  WorkflowChecks.Check(WorkflowService.DecideOrder(s,o.Id,new(1,"accept"),Cook,"expired",Now.AddHours(1)).Status=="rejected"&&s.Batches.Single().RemainingQuantity==500,"Expired reserved stock must not be consumed");
  var path=Path.Combine(Path.GetTempPath(),"flagman-reserve-"+Guid.NewGuid()+".db");var store=new Store(path);
  store.Write(data=>{var f=Fixture();data.Products=f.Products;data.Dishes=f.Dishes;data.Batches=f.Batches;data.Movements=f.Movements;return 0;});
  var attempts=Enumerable.Range(0,2).Select(i=>Task.Run(()=>{try{new Store(path).Write(data=>WorkflowService.SubmitOrder(data,new([new("d",1)]),new("w"+i,"waiter"),"race"+i,Now));return 201;}catch(DomainException e){return e.Status;}})).ToArray();Task.WaitAll(attempts);
  WorkflowChecks.Check(attempts.Select(t=>t.Result).Order().SequenceEqual(new[]{201,409}),"Concurrent submissions overbooked last portion");
  WorkflowChecks.Check(new Store(path).Read(data=>Inventory.Available(data,"p",Now))==0,"Restart lost reservation");
  var planning=store.PlanningState();WorkflowChecks.Check(Inventory.Portions(planning,planning.Dishes[0],Now)==0,"Planning state ignored reservation");
  WorkflowChecks.Check(SalesPlanner.Calculate(planning,Now,new()).Plan.Count==0,"Sales plan reused reserved ingredients");
  s=Fixture(1000);o=WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"first",Now);
  Inventory.PlaceOrder(s,new([new("d",1)]),"direct",Now);
  WorkflowChecks.Check(s.Batches.Single().RemainingQuantity==500&&Inventory.Available(s,"p",Now)==0,"Direct consumption damaged another order's physical reservation");
  WorkflowChecks.Check(WorkflowService.DecideOrder(s,o.Id,new(1,"accept"),Cook,"last",Now).Status=="ready"&&s.Batches.Single().RemainingQuantity==0,"Protected reservation was lost");
  s=Fixture();o=WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"legacy",Now);
  s.OrderRequests[0]=o with{Reservations=null};
  Error(()=>WorkflowService.SubmitOrder(s,new([new("d",1)]),new("new-waiter","waiter"),"legacy-conflict",Now),409);
  Console.WriteLine("PASS Reservation_shared_ingredients_atomic_reject_ready_expiry");Console.WriteLine("PASS Reservation_concurrent_submit_restart_planning");return 2;
 }
}
