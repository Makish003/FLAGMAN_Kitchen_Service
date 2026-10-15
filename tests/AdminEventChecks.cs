using Flagman;
using System.Text.Json;
public static class AdminEventChecks
{
 public static int Run(){
  var path=Path.Combine(Path.GetTempPath(),"flagman-events-"+Guid.NewGuid()+".db");var now=DateTimeOffset.UtcNow;
  try{
   var store=new Store(path);string id="";
   store.Write(s=>{AccessService.Bootstrap(s,"admin-password");var admin=new Actor(s.Users.Single().Id,"admin");
    var manager=AccessService.SaveAccount(s,null,new("limited","Менеджер","manager","manager-password",true,["stock","orders"]),admin,now);id=manager.Id;
    foreach(var pages in new List<string>[] {[],["accounts"],["event-log"],["unknown"]}){
     try{AccessService.SaveAccount(s,id,new("limited","Менеджер","manager",null,true,pages),admin,now);throw new Exception("Invalid menu accepted");}catch(DomainException e){WorkflowChecks.Check(e.Status==400,"Validate visible pages");}
    }
    Inventory.AddProduct(s,new("p","Томаты","g"),now);
    Inventory.Deliver(s,new("EVENT-RECEIPT",[new("p",100,"g",now.AddHours(2))]),"receipt",now);
    Inventory.Expire(s,now);Inventory.Expire(s,now.AddHours(3));var rev=s.Revision;Inventory.Expire(s,now.AddHours(4));WorkflowChecks.Check(s.Revision==rev,"No duplicate expiry event");
    WorkflowChecks.Check(s.Events.Count(e=>e.Type=="batch.expired")==1&&s.Batches.Single().RemainingQuantity==100,"One expiry event without stock mutation");return 0;});
   store=new Store(path);WorkflowChecks.Check(store.Read(s=>s.Users.Single(u=>u.Id==id).VisiblePages!.SequenceEqual(new[]{"stock","orders"})),"Menu survives restart");
   var before=JsonSerializer.SerializeToElement(store.History("eventLog",1,100,null,null),Store.Json);var count=before.GetProperty("total").GetInt32();
   store.RetainEvents(0);store.Write(s=>{s.Emit("settings.changed",now.AddHours(5));return 0;});store=new Store(path);
   var after=JsonSerializer.SerializeToElement(store.History("eventLog",1,100,null,null),Store.Json);WorkflowChecks.Check(after.GetProperty("total").GetInt32()==count+1,"History survives stream retention and restart");
   var filter=JsonSerializer.SerializeToElement(store.History("eventLog",1,1,"Томаты","batch"),Store.Json);WorkflowChecks.Check(filter.GetProperty("total").GetInt32()==2&&filter.GetProperty("items").GetArrayLength()==1,"Search category and paging");
   Console.WriteLine("PASS Admin_menu_validation_persistence_event_archive_expiry");return 1;
  }finally{Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();foreach(var file in Directory.GetFiles(Path.GetDirectoryName(path)!,Path.GetFileName(path)+"*"))File.Delete(file);}
 }
}
