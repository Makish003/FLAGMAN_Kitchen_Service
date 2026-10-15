import type {ReactNode} from 'react';
import {number,qty} from './format';
import {WorkflowStatus} from './workflowUi';
import type {OrderRequest} from './workflowTypes';

export function OrderRequestCard({order:o,dishes=[],timezone,actions}:{order:OrderRequest;dishes?:{id:string;name:string}[];timezone?:string;actions?:ReactNode}){
 return <article className="order-request-card" aria-label={'Заказ #'+o.id.slice(0,8)}>
   <header className="order-request-heading"><h3>Заказ <span>#{o.id.slice(0,8)}</span></h3><WorkflowStatus status={o.status} order/></header>
   {timezone&&(o.authorName||o.createdAt)&&<div className="order-request-meta">{o.authorName&&<span>Официант: <strong>{o.authorName}</strong></span>}{o.createdAt&&<time dateTime={o.createdAt}>{new Date(o.createdAt).toLocaleString('ru-RU',{timeZone:timezone})}</time>}</div>}
   <div className="order-request-summary"><span>Состав заказа</span><span>Порций <strong>{number(o.items.reduce((total,item)=>total+item.portions,0))}</strong></span></div>
   <ul className="order-request-items" aria-label="Блюда в заказе">
    {o.items.map(i=><li key={i.dishId}><span>{i.dishName??dishes.find(d=>d.id===i.dishId)?.name??i.dishId}</span><strong aria-label={number(i.portions)+' порций'}>× {number(i.portions)}</strong></li>)}
   </ul>
   {(o.reason||o.status==='rejected'||!!o.shortages?.length)&&<div className={'order-request-note'+(o.status==='rejected'?' is-rejected':'')}>
    <strong>{o.status==='rejected'?'Причина отказа':'Комментарий'}</strong>
    {(o.reason||(o.status==='rejected'&&!o.shortages?.length))&&<p>{o.reason||'Причина отказа не указана'}</p>}
    {!!o.shortages?.length&&<ul>{o.shortages.map((x,index)=><li key={index}>{x.productName}: не хватает {qty(x.missing,x.unit)}</li>)}</ul>}
   </div>}
   {actions&&<footer className="order-request-actions">{actions}</footer>}
  </article>;
}
