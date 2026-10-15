namespace Flagman;
public static class AccessEndpoints
{
 public static void MapAccess(this RouteGroupBuilder api){
 api.MapGet("/suppliers",(HttpContext c,Store st)=>st.Read(s=>{AccessService.RequireRole(AccessService.Current(s,c),"manager");return s.Users.Where(u=>u.Active&&u.Role=="supplier").Select(u=>new{u.Id,u.Name});}));
 api.MapGet("/accounts",(HttpContext c,Store st)=>st.Read(s=>{AccessService.RequireRole(AccessService.Current(s,c),"admin");return s.Users.Select(AccessService.Public).ToList();}));
 api.MapPost("/accounts",(AccountInput i,HttpContext c,Store st)=>st.Write(s=>AccessService.Public(AccessService.SaveAccount(s,null,i,AccessService.Current(s,c),s.Now(DateTimeOffset.UtcNow)))));
 api.MapPut("/accounts/{id}",(string id,AccountInput i,HttpContext c,Store st)=>st.Write(s=>AccessService.Public(AccessService.SaveAccount(s,id,i,AccessService.Current(s,c),s.Now(DateTimeOffset.UtcNow)))));
 api.MapGet("/accounts/{id}/keys",(string id,HttpContext c,Store st)=>st.Read(s=>{AccessService.RequireRole(AccessService.Current(s,c),"admin");return s.Credentials.Where(x=>x.UserId==id).Select(x=>new{x.Id,x.UserId,x.CreatedAt,x.RevokedAt});}));
 api.MapPost("/accounts/{id}/keys",(string id,HttpContext c,Store st)=>st.Write(s=>AccessService.IssueKey(s,id,AccessService.Current(s,c),s.Now(DateTimeOffset.UtcNow))));
 api.MapDelete("/keys/{id}",(string id,HttpContext c,Store st)=>{st.Write(s=>{AccessService.RevokeKey(s,id,AccessService.Current(s,c),s.Now(DateTimeOffset.UtcNow));return 0;});return Results.Ok();});
 }
}
