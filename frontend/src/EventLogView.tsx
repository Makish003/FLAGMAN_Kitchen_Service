import {useState} from 'react';
import {Activity} from 'lucide-react';
import {Button,Empty,Input,Combobox,Pagination,PanelTitle,Table} from './components';
import {useWorkflowResource} from './workflowHooks';
import type {Account,PageResult} from './workflowTypes';
type EventEntry={id:number;type:string;at:string;entityId?:string;actorId?:string;summary?:string};
const labels:Record<string,string>={
 'demo.enriched':'Подготовлены демонстрационные данные','generator.started':'Демонстрация запущена','generator.stopped':'Демонстрация остановлена',
 'session.login':'Вход в систему','session.logout':'Выход из системы',
 'catalog.changed':'Добавлен продукт','catalog.archived':'Архивирован продукт или блюдо','recipe.changed':'Сохранена рецептура',
 'delivery.created':'Поставка принята на склад','order.accepted':'Заказ приготовлен: продукты списаны','order.rejected':'Заказ отклонён',
 'batch.warning':'Скоро истекает срок годности','batch.expired':'Истёк срок годности продукта','batch.written-off':'Продукт списан',
 'procurement.submitted':'Создана заявка поставщику','procurement.responded':'Поставщик ответил на заявку','procurement.cancelled':'Заявка поставщику отменена',
 'delivery-request.submitted':'Поступила заявка на поставку','delivery-request.accepted':'Поставка принята полностью','delivery-request.partially_accepted':'Поставка принята частично','delivery-request.rejected':'Поставка отклонена','delivery-request.decided':'Принято решение по поставке',
 'order-request.submitted':'Создана заявка на заказ','order-request.ready':'Заказ готов к выдаче','order-request.rejected':'Заявка на заказ отклонена','order-request.decided':'Принято решение по заказу','order-request.served':'Заказ выдан гостю','order-request.reserved':'Продукты зарезервированы для заказа',
 'account.saved':'Создан или изменён аккаунт','key.issued':'Выдан API-ключ','key.revoked':'Отозван API-ключ',
 'settings.changed':'Изменены настройки','offer.updated':'Изменена публикация блюда','offer.changed':'Изменена публикация блюда',
 'time.changed':'Обновилось время или состояние сроков','generator.processed':'Обработан шаг демонстрации','generator.failed':'Ошибка демонстрации',
};
export function EventLogView({timezone}:{timezone:string}){
 const[page,setPage]=useState(1),[search,setSearch]=useState(''),[category,setCategory]=useState('all');
 const log=useWorkflowResource<PageResult<EventEntry>>('/history/eventLog?page='+page+'&size=50&q='+encodeURIComponent(search)+'&status='+category);
 const accounts=useWorkflowResource<Account[]>('/accounts');
 const date=(v:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:timezone,dateStyle:'short',timeStyle:'medium'}).format(new Date(v));
 return <section className="panel workflow-list"><PanelTitle icon={<Activity size={20}/>} title="Все события ресторана" subtitle="Новые события появляются автоматически. История сохраняется после перезапуска."/>
 <div className="event-log-filters"><label>Поиск по продукту, номеру или ID<Input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Найти событие…"/></label><label>Категория<Combobox value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="all">Все события</option>{[['delivery','Поставки'],['order','Заказы'],['batch','Продукты и сроки'],['procurement','Заявки поставщикам'],['account','Аккаунты'],['key','API-ключи'],['session','Вход и выход'],['catalog','Каталог продуктов'],['recipe','Рецептуры'],['offer','Публикация блюд'],['settings','Настройки'],['generator','Демонстрация'],['time','Время и состояние склада']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</Combobox></label><Button className="button secondary" onClick={log.refresh}>Обновить</Button></div>
 {log.error&&<p role="alert" className="form-error">{log.error}</p>}
 {!log.data&&!log.error&&<p role="status">Загрузка событий…</p>}
 {log.data&&(log.data.items.length?<div className="table-wrap"><Table className="operational-table event-log-table"><thead><tr><th>Дата и время</th><th>Событие</th><th>Подробности</th><th>Кто выполнил</th></tr></thead><tbody>{log.data.items.map(e=><tr key={e.id}><td><time dateTime={e.at}>{date(e.at)}</time><small>№ {e.id}</small></td><td><strong>{labels[e.type]??e.type}</strong><small>{e.type}</small></td><td className="event-details">{e.summary||'Подробности для этой записи не сохранены.'}{e.entityId&&<small className="event-entity">ID: {e.entityId}</small>}</td><td>{e.actorId?(accounts.data?.find(a=>a.id===e.actorId)?.name??e.actorId):'Система'}</td></tr>)}</tbody></Table></div>:<Empty text="Событий по выбранным условиям нет"/>)}
 <Pagination page={page} total={log.data?.total??0} size={50} onPage={setPage}/></section>;
}
