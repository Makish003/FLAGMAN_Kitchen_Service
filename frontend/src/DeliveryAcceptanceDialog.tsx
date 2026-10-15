import type {ReactNode} from 'react';
import {WorkflowStatus} from './workflowUi';
import {useState} from 'react';
import {Button,Input,Dialog,PanelTitle,Empty} from './components';
import {useDialog} from './motion/useDialog';
import {qty} from './format';
import {restaurantLocal,restaurantUtc} from './time';
import {useWorkflowCommand} from './workflowHooks';
import type {DeliveryRequest,ProductOption,AcceptanceLine} from './workflowTypes';
export function DeliveryAcceptanceDialog({request,products,timezone,refresh,onClose}:{request:DeliveryRequest;products:ProductOption[];timezone:string;refresh:()=>Promise<void>;onClose:()=>void}){
 const {ref,phase,requestClose}=useDialog(onClose);const {run,busy,error}=useWorkflowCommand(refresh);const[items,setItems]=useState<AcceptanceLine[]>(request.items.map(l=>({lineId:l.id,acceptedQuantity:l.quantity,verifiedExpiresAt:l.expiresAt,reason:''})));
 return <Dialog ref={ref} data-phase={phase} className="operation-modal workflow-modal" aria-labelledby="acceptance-title" onCancel={e=>{e.preventDefault();if(!busy)requestClose();}}><form className="workflow-form" onSubmit={async e=>{e.preventDefault();if(await run('/delivery-requests/'+request.id+'/acceptance',{expectedVersion:request.version,items:items.map((item,i)=>({...item,reason:item.acceptedQuantity<request.items[i].quantity?item.reason:''}))}))requestClose();}}><div className="modal-header"><h2 id="acceptance-title">Приёмка {request.number}</h2><Button className="button secondary" type="button" disabled={busy} onClick={()=>requestClose()}>Закрыть</Button></div><div className="modal-body"><p>Проверьте каждую строку по фактическому товару. При полном отказе укажите ноль и причины.</p>{request.items.map((l,i)=><fieldset className="workflow-fields" key={l.id}><legend>{products.find(p=>p.id===l.productId)?.name??l.productId}</legend><p>Заявлено <strong>{qty(l.quantity,l.unit)}</strong> · срок поставщика {new Date(l.expiresAt).toLocaleString('ru-RU',{timeZone:timezone})}</p><label>Принято<Input required type="number" min={0} max={l.quantity} step="any" value={items[i].acceptedQuantity} onChange={e=>setItems(items.map((x,n)=>n===i?{...x,acceptedQuantity:+e.target.value,reason:+e.target.value<l.quantity?x.reason:''}:x))}/></label><label>Проверенный срок ({timezone})<Input type="datetime-local" required={items[i].acceptedQuantity>0} value={restaurantLocal(items[i].verifiedExpiresAt??l.expiresAt,timezone)} onChange={e=>setItems(items.map((x,n)=>n===i?{...x,verifiedExpiresAt:e.target.value?restaurantUtc(e.target.value,timezone):undefined}:x))}/></label>{items[i].acceptedQuantity<l.quantity&&<label className="wide">Причина уменьшения или отказа<Input required maxLength={500} value={items[i].reason??''} onChange={e=>setItems(items.map((x,n)=>n===i?{...x,reason:e.target.value}:x))}/></label>}</fieldset>)}{error&&<p role="alert" className="form-error">{error}</p>}</div><div className="modal-footer"><Button className="button secondary" type="button" disabled={busy} onClick={()=>setItems(items.map(x=>({...x,acceptedQuantity:0})))}>Отказать полностью</Button><Button className="button primary" disabled={busy}>{busy?'Сохраняем…':'Подтвердить приёмку'}</Button></div></form></Dialog>;
}
export function DeliveryRequestsList({requests,products,manager,timezone,refresh,pagination}:{requests:DeliveryRequest[];products:ProductOption[];manager:boolean;timezone:string;refresh:()=>Promise<void>;pagination?:ReactNode}) {
 const [selected,setSelected]=useState<DeliveryRequest>();
 const date=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:timezone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
 return <section className="panel workflow-list">
  <PanelTitle title={manager?'Очередь приёмки':'Мои поставки'} subtitle={manager?'Проверьте количество и сроки перед приёмкой на склад':'Статусы отправленных поставок и результаты приёмки'}/>
  {!requests.length&&<Empty text="Заявок пока нет"/>}
  <div className="delivery-request-grid">{requests.map(r=><article className="workflow-card order-request-card delivery-request-card" key={r.id}>
   <div className="order-request-heading"><h3>{r.number}</h3><WorkflowStatus status={r.status}/></div>
   <ul className="delivery-request-items">{r.items.map(l=>{
    const accepted=r.acceptance?.find(a=>a.lineId===l.id);
    const changedExpiry=accepted?.verifiedExpiresAt&&new Date(accepted.verifiedExpiresAt).getTime()!==new Date(l.expiresAt).getTime();
    return <li key={l.id}>
     <strong className="delivery-request-product">{products.find(p=>p.id===l.productId)?.name??l.productId}</strong>
     <dl className="delivery-request-facts">
      <div><dt>Заявлено</dt><dd>{qty(l.quantity,l.unit)}</dd></div>
      {r.acceptance&&<div><dt>Принято</dt><dd>{qty(accepted?.acceptedQuantity??0,l.unit)}</dd></div>}
      <div className="delivery-request-expiry"><dt>Срок поставщика</dt><dd><time dateTime={l.expiresAt}>{date(l.expiresAt)}</time></dd></div>
      {changedExpiry&&<div className="delivery-request-expiry"><dt>Проверенный срок</dt><dd><time dateTime={accepted!.verifiedExpiresAt}>{date(accepted!.verifiedExpiresAt!)}</time></dd></div>}
     </dl>
     {accepted&&accepted.acceptedQuantity<l.quantity&&accepted.reason&&<div className="delivery-request-reason"><strong>Причина уменьшения или отказа</strong><p>{accepted.reason}</p></div>}
    </li>;
   })}</ul>
   {(r.procurementRequestId||r.deliveryId)&&<div className="delivery-request-references">
    {r.procurementRequestId&&<span>Закупка <strong>#{r.procurementRequestId.slice(0,8)}</strong></span>}
    {r.deliveryId&&<span>Проведённая поставка <strong>#{r.deliveryId.slice(0,8)}</strong></span>}
   </div>}
   {manager&&r.status==='submitted'&&<div className="order-request-actions"><Button className="button primary" onClick={()=>setSelected(r)}>Проверить приёмку</Button></div>}
  </article>)}</div>
  {pagination}
  {selected&&<DeliveryAcceptanceDialog request={selected} products={products} timezone={timezone} refresh={refresh} onClose={()=>setSelected(undefined)}/>}
 </section>;
}
