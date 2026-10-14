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
        Console.WriteLine("PASS Migration_preserves_legacy_inventory"); return 1;
    }
    public static void Check(bool value,string message) {if(!value)throw new Exception(message);}
}
