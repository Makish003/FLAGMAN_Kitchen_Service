namespace Flagman;
public static class WorkflowEndpoints
{
 static string Key(HttpContext c)=>c.Request.Headers["Idempotency-Key"].ToString();
 public static string? Operation(string path)=>path switch {"/orders" or "/order-requests"=>"order","/deliveries" or "/delivery-requests"=>"delivery","/procurement-requests"=>"procurement",_ when path.EndsWith("/supplier-response")=>"procurement-response",_ when path.EndsWith("/cancel")=>"procurement-cancel",_ when path.EndsWith("/acceptance")=>"delivery-acceptance",_ when path.EndsWith("/serve")=>"order-serve",_ when path.EndsWith("/decision")=>"order-decision",_ when path.EndsWith("/write-off")=>"write-off",_=>null};
 static object List<T>(IEnumerable<T> rows,int? page,int? size){var p=page??1;var n=size??50;Inventory.Require(p is >0 and <=100000&&n is >0 and <=100,"Некорректная пагинация");var all=rows.ToList();return new{total=all.Count,page=p,size=n,items=all.Skip((p-1)*n).Take(n).ToList()};}
 static object OrderView(State s,OrderRequest r,Actor actor)=>new{
  r.Id,r.Status,r.Version,r.CreatedAt,r.Reason,r.Rejection,r.Shortages,r.OrderId,r.DecidedAt,r.ServedAt,
  rejectionProducts=actor.Role=="cook"?OrderRejections.Products(s,r):null,
  authorId=actor.Role=="manager"?r.AuthorId:null,
  authorName=s.Users.Find(u=>u.Id==r.AuthorId)?.Name,
  decisionActorId=actor.Role=="manager"?r.DecisionActorId:null,
  servedById=actor.Role=="manager"?r.ServedById:null,
  items=r.Items.Select(i=>new{i.DishId,i.Portions,dishName=s.Dishes.Find(d=>d.Id==i.DishId)?.Name??i.DishId})
 };
 public static void MapWorkflows(this RouteGroupBuilder api){
 api.MapPost("/procurement-requests",(ProcurementRequestInput i,HttpContext c,Store st)=>Results.Json(st.Write(s=>WorkflowService.CreateProcurement(s,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))),statusCode:201));
 api.MapPost("/procurement-requests/{id}/supplier-response",(string id,ProcurementResponseInput i,HttpContext c,Store st)=>st.Write(s=>WorkflowService.RespondProcurement(s,id,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))));
 api.MapPost("/procurement-requests/{id}/cancel",(string id,VersionInput i,HttpContext c,Store st)=>st.Write(s=>WorkflowService.CancelProcurement(s,id,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))));
 foreach(var path in new[]{"/delivery-requests","/deliveries"})api.MapPost(path,(DeliveryRequestInput i,HttpContext c,Store st)=>Results.Json(st.Write(s=>WorkflowService.SubmitDelivery(s,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))),statusCode:201));
 api.MapPost("/delivery-requests/{id}/acceptance",(string id,DeliveryAcceptanceInput i,HttpContext c,Store st)=>st.Write(s=>WorkflowService.AcceptDelivery(s,id,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))));
 foreach(var path in new[]{"/order-requests","/orders"})api.MapPost(path,(OrderRequestInput i,HttpContext c,Store st)=>Results.Json(st.Write(s=>WorkflowService.SubmitOrder(s,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))),statusCode:201));
 api.MapPost("/order-requests/{id}/decision",(string id,OrderDecisionInput i,HttpContext c,Store st)=>st.Write(s=>WorkflowService.DecideOrder(s,id,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))));
 api.MapPost("/order-requests/{id}/serve",(string id,VersionInput i,HttpContext c,Store st)=>st.Write(s=>WorkflowService.ServeOrder(s,id,i,AccessService.Current(s,c),Key(c),s.Now(DateTimeOffset.UtcNow))));
 foreach(var path in new[]{"/procurement-requests","/supplier/procurement-requests"})api.MapGet(path,(HttpContext c,Store st,int? page,int? size)=>st.Read(s=>{var a=AccessService.Current(s,c);AccessService.RequireRole(a,"manager","supplier");return List(s.ProcurementRequests.Where(x=>a.Role=="manager"||x.SupplierId==a.UserId).OrderByDescending(x=>x.CreatedAt),page,size);}));
 foreach(var path in new[]{"/delivery-requests","/supplier/delivery-requests"})api.MapGet(path,(HttpContext c,Store st,int? page,int? size)=>st.Read(s=>{var a=AccessService.Current(s,c);AccessService.RequireRole(a,"manager","supplier");return List(s.DeliveryRequests.Where(x=>a.Role=="manager"||x.AuthorId==a.UserId).OrderByDescending(x=>x.CreatedAt),page,size);}));
 foreach(var path in new[]{"/order-requests","/waiter/order-requests","/cook/order-requests"})api.MapGet(path,(HttpContext c,Store st,int? page,int? size,string? status)=>st.Read(s=>{
  var a=AccessService.Current(s,c);AccessService.RequireRole(a,"manager","waiter","cook");
  var rows=s.OrderRequests.Where(x=>a.Role!="waiter"||x.AuthorId==a.UserId);
  if(a.Role=="cook") {
   var zone=TimeZoneInfo.FindSystemTimeZoneById(s.Settings.Timezone);
   var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(s.Now(DateTimeOffset.UtcNow),zone).DateTime);
   rows=rows.Where(x=>DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(x.CreatedAt,zone).DateTime)==today);
  }
  Inventory.Require(status is null or "all" or "submitted" or "ready" or "served" or "rejected" or "accepted" or "cancelled","Неизвестный статус заказа");
  if(status is not null and not "all")rows=rows.Where(x=>x.Status==status);
  // Sort before pagination: oldest active work first, latest completed orders first.
  rows=rows.OrderBy(x=>x.Status switch {"submitted"=>0,"ready"=>1,"served"=>2,"rejected"=>3,"accepted"=>4,_=>5})
   .ThenBy(x=>x.Status is "submitted" or "ready"?x.CreatedAt:DateTimeOffset.MinValue)
   .ThenByDescending(x=>x.Status is "submitted" or "ready"?DateTimeOffset.MinValue:x.CreatedAt).ThenBy(x=>x.Id);
  return List(rows.Select(x=>OrderView(s,x,a)),page,size);
 }));
 api.MapGet("/procurement-requests/{id}",(string id,HttpContext c,Store st)=>st.Read(s=>{var a=AccessService.Current(s,c);AccessService.RequireRole(a,"manager","supplier");var r=s.ProcurementRequests.Find(x=>x.Id==id)??throw new DomainException("Заявка не найдена",404);AccessService.RequireOwner(a,r.SupplierId);return r;}));
 api.MapGet("/delivery-requests/{id}",(string id,HttpContext c,Store st)=>st.Read(s=>{var a=AccessService.Current(s,c);AccessService.RequireRole(a,"manager","supplier");var r=s.DeliveryRequests.Find(x=>x.Id==id)??throw new DomainException("Заявка не найдена",404);AccessService.RequireOwner(a,r.AuthorId);return r;}));
 api.MapGet("/order-requests/{id}",(string id,HttpContext c,Store st)=>st.Read(s=>{var a=AccessService.Current(s,c);AccessService.RequireRole(a,"manager","waiter","cook");var r=s.OrderRequests.Find(x=>x.Id==id)??throw new DomainException("Заказ не найден",404);if(a.Role=="waiter")AccessService.RequireOwner(a,r.AuthorId);return OrderView(s,r,a);}));
 api.MapGet("/supplier/catalog",(HttpContext c,Store st)=>st.Read(s=>{AccessService.RequireRole(AccessService.Current(s,c),"supplier","manager");return s.Products.Where(x=>!x.Archived).Select(x=>new{x.Id,x.Name,x.Unit});}));
 api.MapGet("/waiter/menu",(HttpContext c,Store st)=>st.Read(s=>{AccessService.RequireRole(AccessService.Current(s,c),"waiter","manager");var now=s.Now(DateTimeOffset.UtcNow);return s.Dishes.Where(x=>!x.Archived).Select(x=>new{x.Id,x.Name,x.Category,availablePortions=Inventory.Portions(s,x,now)});}));
 }
}
