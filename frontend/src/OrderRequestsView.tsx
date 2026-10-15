import {OrderCardGrid,newestFirst} from './OrderCardGrid';
import {ChefHat,ShoppingBasket} from 'lucide-react';
import {useEffect,useState} from 'react';
import {OrderRequestCard} from './OrderRequestCard';
import {Button,Combobox,Dialog,PanelTitle,Empty,Pagination} from './components';
import {useDialog} from './motion/useDialog';
import {useWorkflowCommand,useWorkflowResource} from './workflowHooks';
import type {OrderRequest,PageResult} from './workflowTypes';
import type {Snapshot} from './types';

const orderGroups=[['submitted','Ожидают приготовления'],['ready','Готовы к выдаче'],['served','Выданы'],['rejected','Отклонены'],['accepted','Завершены ранее'],['cancelled','Отменены']] as const;
export function OrderRequestsView({s,actorId,administrator=false}:{s:Snapshot;actorId:string;administrator?:boolean}){return <OrderList administrator={administrator} dishes={s.dishes} actorId={actorId} timezone={s.settings.timezone}/>;}
export function CookView({timezone}:{timezone:string}){return <OrderList kitchen timezone={timezone}/>;}
function KitchenClock({timezone}:{timezone:string}){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[]);
 return <time dateTime={now.toISOString()} aria-label="Текущие дата и время">{now.toLocaleString('ru-RU',{timeZone:timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time>;
}
function OrderList({kitchen=false,administrator=false,dishes=[],actorId,timezone}:{kitchen?:boolean;administrator?:boolean;dishes?:{id:string;name:string}[];actorId?:string;timezone:string}){
 const [page,setPage]=useState(1),[selected,setSelected]=useState<OrderRequest>();
 const [status,setStatus]=useState('all');
 const list=useWorkflowResource<PageResult<OrderRequest>>((kitchen?'/cook':'')+'/order-requests?page='+page+'&status='+status);
 const {run,busy,error}=useWorkflowCommand(list.refresh);
 return <section className="panel workflow-list">
  <PanelTitle icon={kitchen?<ChefHat size={20}/>:<ShoppingBasket size={20}/>} title={kitchen?'Заказы кухни':'Заказы сотрудников'} subtitle={kitchen?'Приготовьте заказ и отметьте готовность к выдаче':'Приготовление подтверждает повар, выдачу — официант'}/>
  {kitchen&&<p><strong>Заказы за сегодня</strong><span className="muted"> · <KitchenClock timezone={timezone}/></span></p>}
  <div className="tabs" role="group" aria-label="Статус заказов">
   {[['all','Все статусы'],...orderGroups].map(([value,label])=><Button key={value} className={status===value?'selected':''} aria-pressed={status===value} onClick={()=>{setStatus(value);setPage(1);}}>{label}</Button>)}
  </div>
  <p className="form-hint">Новые заказы — слева, более ранние — справа.{kitchen?' При нажатии «Готово» наличие проверяется повторно и ингредиенты списываются.':''}</p>
  {(list.error||error)&&<p role="alert" className="form-error">{list.error||error}</p>}
  <OrderCardGrid>{newestFirst(list.data?.items??[]).map(o=><OrderRequestCard key={o.id} order={o} dishes={dishes} timezone={timezone} actions={(!kitchen&&o.status==='ready'&&(administrator||o.authorId===actorId)||(kitchen||administrator)&&o.status==='submitted')?<>
    {!kitchen&&o.status==='ready'&&(administrator||o.authorId===actorId)&&<Button className="button primary" disabled={busy} onClick={()=>run('/order-requests/'+o.id+'/serve',{expectedVersion:o.version})}>Подтвердить выдачу</Button>}
    {(kitchen||administrator)&&o.status==='submitted'&&<>
     <Button className="button secondary" disabled={busy} onClick={()=>setSelected(o)}>Отклонить заказ</Button>
     <Button className="button primary" disabled={busy} onClick={()=>run('/order-requests/'+o.id+'/decision',{expectedVersion:o.version,decision:'accept'})}>Готово</Button>
    </>}
   </>:undefined}/>)}</OrderCardGrid>
  {list.data&&!list.data.items.length&&<Empty text="Заказов пока нет"/>}
  <Pagination page={page} total={list.data?.total??0} size={list.data?.size??50} onPage={setPage}/>
  {selected&&<RejectOrder request={selected} refresh={list.refresh} onClose={()=>setSelected(undefined)}/>}
 </section>;
}
function RejectOrder({request,refresh,onClose}:{request:OrderRequest;refresh:()=>Promise<void>;onClose:()=>void}){
 const {ref,phase,requestClose}=useDialog(onClose),{run,busy,error}=useWorkflowCommand(refresh);
 const [reasonCode,setReasonCode]=useState(''),[productId,setProductId]=useState(''),[reason,setReason]=useState('');
 const productReason=['expired_product','product_shortage','spoiled_product'].includes(reasonCode);
 const products=request.rejectionProducts??[];
 const valid=!!reasonCode&&(productReason?products.some(p=>p.id===productId):!!reason.trim());
 return <Dialog ref={ref} data-phase={phase} className="operation-modal workflow-modal" aria-labelledby="order-reject-title" onCancel={e=>{e.preventDefault();if(!busy)requestClose();}}>
  <div className="modal-header"><h2 id="order-reject-title">Отклонить заказ</h2><Button className="button secondary" disabled={busy} onClick={()=>requestClose()}>Закрыть</Button></div>
  <div className="modal-body">
   <label>Причина отказа<Combobox required disabled={busy} value={reasonCode} onChange={e=>{setReasonCode(e.target.value);setProductId('');setReason('');}}>
    <option value="" disabled>Выберите причину отказа</option>
    <option value="expired_product">Просроченный продукт</option>
    <option value="product_shortage">Нехватка продукта</option>
    <option value="spoiled_product">Продукт испорчен</option>
    <option value="equipment_failure">Неисправность оборудования</option>
    <option value="other">Другое</option>
   </Combobox></label>
   {productReason&&<label>Продукт<Combobox required disabled={busy} value={productId} onChange={e=>setProductId(e.target.value)}>
    <option value="" disabled>Выберите продукт из заказа</option>
    {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </Combobox></label>}
   {productReason&&!products.length&&<p role="alert">Состав заказа недоступен. Закройте диалог и обновите список заказов.</p>}
   {!!reasonCode&&!productReason&&<label>Описание причины<textarea className="rejection-comment" required disabled={busy} rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
   <p className="form-hint">Причина будет видна официанту и менеджеру. Резерв продуктов освободится после отказа.</p>
   {error&&<p role="alert">{error}</p>}
  </div>
  <div className="modal-footer"><Button className="button primary destructive" disabled={busy||!valid} onClick={async()=>{if(await run('/order-requests/'+request.id+'/decision',{expectedVersion:request.version,decision:'reject',reasonCode,...(productReason?{productIds:[productId]}:{reason:reason.trim()})}))requestClose();}}>Отклонить</Button></div>
 </Dialog>;
}
