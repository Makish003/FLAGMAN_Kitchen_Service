namespace Flagman;

public static class OrderRejections
{
 public static List<RejectionProduct> Products(State s,OrderRequest order)
 {
  if(order.IngredientProducts!=null)return order.IngredientProducts.OrderBy(p=>p.Name).ThenBy(p=>p.Id).ToList();
  // Older requests already reserved their original ingredients, even if recipes changed.
  var ids=(order.Reservations is {Count:>0}
   ?order.Reservations.Select(r=>s.Batches.Find(b=>b.Id==r.BatchId)?.ProductId).OfType<string>()
   :order.Items.SelectMany(i=>s.Dishes.Find(d=>d.Id==i.DishId)?.Ingredients??[]).Select(i=>i.ProductId)).ToHashSet();
  return s.Products.Where(p=>ids.Contains(p.Id)).Select(p=>new RejectionProduct(p.Id,p.Name)).OrderBy(p=>p.Name).ThenBy(p=>p.Id).ToList();
 }
 public static OrderRejection Validate(State s,OrderRequest order,OrderDecisionInput input)
 {
  Inventory.Require(input.ReasonCode is "expired_product" or "product_shortage" or "spoiled_product" or "equipment_failure" or "other","Выберите причину отказа");
  var comment=input.Reason?.Trim();
  Inventory.Require(input.Reason==null||input.Reason.Length<=500,"Описание причины: до 500 символов");
  var ids=input.ProductIds??[];
  var productReason=input.ReasonCode is "expired_product" or "product_shortage" or "spoiled_product";
  if(productReason){
   var allowed=Products(s,order);
   Inventory.Require(ids.Count is >0 and <=100&&ids.Distinct().Count()==ids.Count&&ids.All(id=>allowed.Any(p=>p.Id==id)),"Выберите продукт из состава заказа без повторов");
   return new(input.ReasonCode!,allowed.Where(p=>ids.Contains(p.Id)).ToList(),string.IsNullOrEmpty(comment)?null:comment);
  }
  Inventory.Require(ids.Count==0,"Для этой причины продукт не указывается");
  Inventory.Require(!string.IsNullOrWhiteSpace(comment),"Опишите причину отказа");
  return new(input.ReasonCode!,[],comment);
 }
 public static string Describe(OrderRejection reason)
 {
  var label=reason.Code switch{"expired_product"=>"Просроченный продукт","product_shortage"=>"Нехватка продукта","spoiled_product"=>"Продукт испорчен","equipment_failure"=>"Неисправность оборудования",_=>"Другое"};
  var details=reason.Products.Count>0?string.Join(", ",reason.Products.Select(p=>p.Name)):reason.Comment;
  return label+": "+details+(reason.Products.Count>0&&reason.Comment!=null?". "+reason.Comment:"");
 }
}
