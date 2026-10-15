using Flagman;
using System.Text.Json;

public static class KitchenRejectionChecks
{
 static readonly DateTimeOffset Now=DateTimeOffset.Parse("2026-10-15T10:00:00Z");
 static readonly Actor Waiter=new("waiter","waiter"),Cook=new("cook","cook");
 static (State s,OrderRequest order) Fixture(){var s=new State();Inventory.AddProduct(s,new("p","Томаты","g"),Now);Inventory.AddProduct(s,new("unused","Сливки","ml"),Now);Inventory.SaveDish(s,new("d","Салат","Салаты",[new("p",500)]),Now);Inventory.Deliver(s,new("receipt",[new("p",500,"g",Now.AddHours(1))]),"receipt",Now);return(s,WorkflowService.SubmitOrder(s,new([new("d",1)]),Waiter,"submit",Now));}
 static OrderDecisionInput Input(string? code,string[]? products=null,string? reason=null)=>JsonSerializer.Deserialize<OrderDecisionInput>(JsonSerializer.Serialize(new{expectedVersion=1,decision="reject",reasonCode=code,productIds=products,reason}),Store.Json)!;
 static void Invalid(OrderDecisionInput input){var(s,o)=Fixture();try{WorkflowService.DecideOrder(s,o.Id,input,Cook,"reject",Now);}catch(DomainException e){WorkflowChecks.Check(e.Status==400,"Wrong rejection error");WorkflowChecks.Check(s.OrderRequests[0].Status=="submitted"&&Inventory.Available(s,"p",Now)==0&&s.Batches[0].RemainingQuantity==500,"Invalid reason changed order or reservation");return;}throw new Exception("Invalid rejection reason accepted");}
 public static int Run(){
  Invalid(Input("unknown",reason:"Причина"));Invalid(Input(null,reason:"Причина"));
  foreach(var legacy in new[]{false,true}){
   var(s,o)=Fixture();s.Dishes[0]=s.Dishes[0] with{Ingredients=[new("unused",500)]};
   if(legacy)s.OrderRequests[0]=o with{IngredientProducts=null};
   try{WorkflowService.DecideOrder(s,o.Id,Input("expired_product",["unused"]),Cook,"changed-recipe",Now);throw new Exception("Changed recipe allowed a product absent from submitted order");}catch(DomainException e){WorkflowChecks.Check(e.Status==400,"Wrong changed-recipe rejection error");}
   var result=WorkflowService.DecideOrder(s,o.Id,Input("expired_product",["p"]),Cook,"original-product",Now);WorkflowChecks.Check(result.Reason!.Contains("Томаты"),"Original ingredient cannot be selected after recipe edit");
  }
  foreach(var code in new[]{"expired_product","product_shortage","spoiled_product"}){
   Invalid(Input(code));Invalid(Input(code,["unused"]));Invalid(Input(code,["missing"]));Invalid(Input(code,["p","p"]));Invalid(Input(code,[null!]));
   var(s,o)=Fixture();var result=WorkflowService.DecideOrder(s,o.Id,Input(code,["p"]),Cook,"reject",Now);
   WorkflowChecks.Check(result.Status=="rejected"&&result.Reason!.Contains("Томаты"),"Product reason missing from visible history");
   WorkflowChecks.Check(Inventory.Available(s,"p",Now)==500&&s.Movements.Count==1&&s.Orders.Count==0,"Refusal failed to release reserve without consumption");
   var json=JsonSerializer.SerializeToElement(result,Store.Json);WorkflowChecks.Check(json.GetProperty("rejection").GetProperty("code").GetString()==code&&json.GetProperty("rejection").GetProperty("products")[0].GetProperty("name").GetString()=="Томаты","Structured rejection missing");
   WorkflowService.DecideOrder(s,o.Id,Input(code,["p"]),Cook,"reject",Now);
   var path=Path.Combine(Path.GetTempPath(),"flagman-rejection-"+Guid.NewGuid()+".db");var store=new Store(path);store.Write(data=>{data.Products=s.Products;data.Dishes=s.Dishes;data.Batches=s.Batches;data.Movements=s.Movements;data.OrderRequests=s.OrderRequests;return 0;});
   WorkflowChecks.Check(new Store(path).Read(data=>JsonSerializer.Serialize(data.OrderRequests.Single(),Store.Json))==JsonSerializer.Serialize(result,Store.Json),"Restart lost rejection details");
  }
  foreach(var code in new[]{"equipment_failure","other"}){
   Invalid(Input(code));Invalid(Input(code,reason:"   "));Invalid(Input(code,reason:new string('x',501)));Invalid(Input(code,["p"],"Описание"));
   var(s,o)=Fixture();var result=WorkflowService.DecideOrder(s,o.Id,Input(code,reason:"  Описание повара  "),Cook,"reject",Now);
   WorkflowChecks.Check(result.Reason!.Contains("Описание повара")&&Inventory.Available(s,"p",Now)==500,"Explanation lost or reserve not released");
  }
  Console.WriteLine("PASS Kitchen_rejection_codes_products_and_explanations_validated");
  Console.WriteLine("PASS Kitchen_rejection_preserves_history_releases_reserve_and_replays");return 2;
 }
}
