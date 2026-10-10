using Flagman;
using Microsoft.Data.Sqlite;

if (args.Length < 2) throw new ArgumentException("verify <db> | backup <source> <new-target> | restore <backup> <new-target>");
if(args[0]=="fixture") {
    if(File.Exists(args[1]))throw new IOException("Fixture target must be new");
    var active=int.Parse(Environment.GetEnvironmentVariable("FLAGMAN_LOAD_ACTIVE")??"1000");if(active is <1 or >10000)throw new ArgumentException("Active load: 1..10000");
    var store=new Store(args[1]);var now=DateTimeOffset.UtcNow;
    store.Write(s=>{s.Products.Add(new("load","Нагрузочный продукт","g"));s.Dishes.Add(new("load","Нагрузочное блюдо","Тест",[new("load",100)]));
        for(var i=0;i<10000;i++){var id="load-"+i;var live=i<active;s.Batches.Add(new(id,"history","load",live?1000:900,live?1000:0,now.AddDays(-365),now.AddDays(live?365:-300),null,null,"explicit"));for(var j=0;j<10;j++)s.Movements.Add(new(id+"-"+j,id,"load",!live&&j==9?-900:100,!live&&j==9?"expiry":"receipt",null,now.AddDays(!live&&j==9?-300:-365)));}return 0;});
    store.VerifyIntegrity();Console.WriteLine($"Fixture: 10000 batches ({active} active), 100000 historical movements");return;
}
if (!File.Exists(args[1])) throw new IOException("Source database does not exist");
switch (args[0]) {
    case "verify": new Store(args[1]).VerifyIntegrity(); break;
    case "backup":
    case "restore":
        if (args.Length != 3 || File.Exists(args[2])) throw new IOException("Choose a new target database; existing files are never overwritten");
        Store.BackupFile(args[1], args[2]); new Store(args[2]).VerifyIntegrity();
        break;
    default: throw new ArgumentException("Unknown command");
}
SqliteConnection.ClearAllPools();
Console.WriteLine("Integrity and exact movement reconciliation: OK");
