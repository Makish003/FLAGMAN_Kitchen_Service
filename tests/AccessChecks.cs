using Flagman;
public static class AccessChecks
{
 public static int Run(){var s=new State();var now=DateTimeOffset.UtcNow;AccessService.Bootstrap(s,"test-manager-password");var manager=s.Users.Single(); WorkflowChecks.Check(AccessService.Login(s,"manager","test-manager-password")?.Id==manager.Id,"Bootstrap login"); WorkflowChecks.Check(AccessService.Login(s,"manager","wrong")==null,"Wrong password");var actor=new Actor(manager.Id,"admin"); WorkflowChecks.Check(manager.Role=="admin","Bootstrap admin role");var supplier=AccessService.SaveAccount(s,null,new("supplier","Поставщик","supplier","supplier-password"),actor,now);try{AccessService.SaveAccount(s,null,new(" supplier ","Duplicate","supplier","supplier-password"),actor,now);throw new Exception("Whitespace login duplicate accepted");}catch(DomainException e){WorkflowChecks.Check(e.Status==409,"Unique normalized login");}var issued=AccessService.IssueKey(s,supplier.Id,actor,now);WorkflowChecks.Check(AccessService.Bearer(s,issued.Token)?.UserId==supplier.Id,"Bearer auth");AccessService.SaveAccount(s,supplier.Id,new("supplier","Поставщик","waiter",null),actor,now);WorkflowChecks.Check(AccessService.Bearer(s,issued.Token)==null,"Role invalidates key");try{AccessService.SaveAccount(s,manager.Id,new("manager","Администратор","admin",null,false),actor,now);throw new Exception("Last admin disabled");}catch(DomainException e){WorkflowChecks.Check(e.Status==409,"Last admin guard");} CheckRolesAndMigration(); Console.WriteLine("PASS Accounts_roles_revocation_last_admin");return 1;}
 static void CheckRolesAndMigration(){
  var now=DateTimeOffset.UtcNow;var s=new State();AccessService.Bootstrap(s,"admin-password");var admin=new Actor(s.Users.Single().Id,"admin");
  var manager=AccessService.SaveAccount(s,null,new("limited","Менеджер","manager","manager-password"),admin,now);var limited=new Actor(manager.Id,"manager");
  foreach(var action in new Action[]{()=>AccessService.SaveAccount(s,null,new("blocked","Blocked","admin","blocked-password"),limited,now),()=>AccessService.IssueKey(s,manager.Id,limited,now),()=>AccessService.RevokeKey(s,"missing",limited,now)}){
   try{action();throw new Exception("Manager accessed account administration");}catch(DomainException e){WorkflowChecks.Check(e.Status==403,"Manager account boundary");}
  }
  AccessService.RequireRole(limited,"manager");AccessService.RequireRole(admin,"manager");AccessService.RequireRole(admin,"supplier");AccessService.RequireOwner(admin,"other");
  var path=Path.Combine(Path.GetTempPath(),"flagman-admin-"+Guid.NewGuid()+".db");
  try{
   var store=new Store(path);store.Write(state=>{state.Users.Add(manager);return 0;});
   using(var db=new Microsoft.Data.Sqlite.SqliteConnection("Data Source="+path)){db.Open();using var cmd=db.CreateCommand();cmd.CommandText="DELETE FROM schema_migrations WHERE version=5";cmd.ExecuteNonQuery();}
   store=new Store(path);var upgraded=store.Read(state=>state.Users.Single());WorkflowChecks.Check(upgraded.Role=="admin"&&upgraded.SessionVersion==manager.SessionVersion+1,"Legacy manager promoted");WorkflowChecks.Check(AccessService.Login(store.Read(state=>state),"limited","manager-password")!=null,"Migration preserves password");
   store.Write(state=>{AccessService.SaveAccount(state,null,new("new-manager","Новый менеджер","manager","manager-password"),new Actor(upgraded.Id,"admin"),now);return 0;});
   store=new Store(path);WorkflowChecks.Check(store.Read(state=>state.Users.Single(u=>u.Login=="new-manager").Role)=="manager","Restart preserves new manager role");store.Readiness();
  }finally{Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();foreach(var file in Directory.GetFiles(Path.GetDirectoryName(path)!,Path.GetFileName(path)+"*"))File.Delete(file);}
 }
}
