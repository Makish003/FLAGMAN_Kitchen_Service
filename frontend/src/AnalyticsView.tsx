import {useEffect,useState} from 'react';
import {ArrowRight,Check,Truck,X,ArrowDownLeft,TrendingUp} from 'lucide-react';
import {Button,Input,Table,Metric,PanelTitle,Empty,Badge} from './components';
import {api} from './api';
import {restaurantDate} from './time';
import {qty,number,percent,counted} from './format';
import {insightSummary} from './insightSummary';
import {OrdersChart} from './OrdersChart';
import type {Analytics,Snapshot} from './types';

export function AnalyticsView({s,dishName,navigate}:{s:Snapshot;dishName:(id:string)=>string;navigate:(id:string)=>void}) {
  const [from,setFrom]=useState(restaurantDate(s.analytics.from,s.settings.timezone));
  const [to,setTo]=useState(restaurantDate(s.analytics.to,s.settings.timezone));
  const [period,setPeriod]=useState<{from:string;to:string}|null>(null);
  const [base,setBase]=useState(s.analytics),[analytics,setAnalytics]=useState(s.analytics),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [selectedDays,setSelectedDays]=useState<string[]|null>(null),[filterBusy,setFilterBusy]=useState(false);
  const [search,setSearch]=useState('');
  useEffect(()=>{
    if(!period){setBase(s.analytics);return;}
    const controller=new AbortController();setBusy(true);
    api<Analytics>(`/analytics?fromDate=${period.from}&toDate=${period.to}`,'GET',undefined,undefined,controller.signal)
      .then(a=>{if(!controller.signal.aborted){setBase(a);setError('');}})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[period,s.analytics,s.revision]);
  useEffect(()=>{
    if(selectedDays===null){setAnalytics(base);setFilterBusy(false);return;}
    if(!selectedDays.length){setAnalytics({...base,ordersAccepted:0,ordersRejected:0,lossBatches:0,products:[],dishes:[],wasteProducts:[],costs:[],priceCoverage:[],daily:[]});setFilterBusy(false);return;}
    const controller=new AbortController();setFilterBusy(true);setError('');
    const params=new URLSearchParams({fromDate:restaurantDate(base.from,base.timezone),toDate:restaurantDate(base.to,base.timezone),days:selectedDays.join(',')});
    api<Analytics>('/analytics?'+params,'GET',undefined,undefined,controller.signal)
      .then(a=>{if(!controller.signal.aborted)setAnalytics(a);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setFilterBusy(false);});
    return()=>controller.abort();
  },[base,selectedDays]);
  const dishes=(analytics.dishes??[]).slice(0,5);
  const currencies=[...new Set((analytics.wasteProducts??[]).map(p=>p.currency))];
  const summary=insightSummary(analytics);
  const ranked=[...analytics.products].sort((a,b)=>b.shortageCount-a.shortageCount||a.name.localeCompare(b.name,'ru'));
  const activeCosts=(analytics.costs??[]).filter(c=>c.consumed||c.wasted);
  const pendingPeriod=from!==(period?.from??restaurantDate(analytics.from,analytics.timezone))||to!==(period?.to??restaurantDate(analytics.to,analytics.timezone));
  return <div className="analytics-workspace" aria-busy={busy||filterBusy}>
    <form className="report-toolbar" onSubmit={e=>{e.preventDefault();if(from>to){setError('Дата начала должна быть не позже даты окончания.');return;}setSelectedDays(null);setPeriod({from,to});}}>
      <label>С даты<Input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>По дату<Input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label>
      <Button className="button secondary" disabled={busy}>{busy?'Обновляем…':'Применить период'}</Button>
      <span className="report-range">{restaurantDate(analytics.from,analytics.timezone)} — {restaurantDate(analytics.to,analytics.timezone)}</span>
      {pendingPeriod&&<small>Период изменён. Примените фильтр.</small>}{error&&<p role="alert" className="error-text">{error}</p>}
    </form>
    {selectedDays!==null&&<p className="analytics-filter-note" role="status">{filterBusy?'Обновляем данные выбранных дней…':selectedDays.length?'Все показатели ниже рассчитаны по выбранным дням.':'Выберите хотя бы один день на графике.'}</p>}
    <section className={`business-summary analytics-summary ${summary.tone}`} aria-label="Выводы за период"><div className="summary-heading"><TrendingUp size={24}/><h2>{summary.title}</h2></div>
      {summary.total||analytics.lossBatches?<dl className="summary-facts"><div><dt>{analytics.ordersRejected?'Доля отказов':'Принято заказов'}</dt><dd>{analytics.ordersRejected?percent(summary.rejectionRate):number(analytics.ordersAccepted)}</dd></div><div><dt>{analytics.ordersRejected?'Отклонённые заказы':'Списано партий'}</dt><dd>{analytics.ordersRejected?`${number(analytics.ordersRejected)} из ${number(summary.total)}`:number(analytics.lossBatches)}</dd></div><div><dt>{summary.shortages.length?'Ингредиентов в дефиците':'Продуктов с потерями'}</dt><dd>{summary.shortages.length||summary.losses.length}</dd></div></dl>:<p>После первых заказов здесь появятся выводы о дефиците и потерях.</p>}
      <div className="summary-next"><div><span>{summary.shortages.length?'В первую очередь пополнить':summary.losses.length?'Проверьте объём закупки':'Следующее действие'}</span>{summary.shortages.length||summary.losses.length?<div className="detail-chips">{(summary.shortages.length?summary.shortages:summary.losses).slice(0,3).map(p=><Badge key={p.id} status={summary.shortages.length?'red':'amber'}>{p.name}</Badge>)}</div>:<p>{summary.total?'Контролируйте ближайшие сроки продуктов.':'Добавьте продукты, блюда и первую поставку.'}</p>}</div><Button className="button secondary" onClick={()=>navigate(summary.shortages.length?'procurement':'expiry')}>{summary.shortages.length?'План закупок':'Проверить сроки'}<ArrowRight size={16}/></Button></div>
    </section>
    <div className="metrics report-metrics"><Metric icon={<Check/>} label="Принято заказов" value={analytics.ordersAccepted} detail={summary.total?`${percent(analytics.ordersAccepted/summary.total*100)} от всех заказов`:'Нет заказов за период'} tone="green"/><Metric icon={<X/>} label="Отказов из-за дефицита" value={analytics.ordersRejected} detail={`${percent(summary.rejectionRate)} от всех заказов`} tone="red"/><Metric icon={<ArrowDownLeft/>} label="Списано партий" value={analytics.lossBatches} detail={`${counted(summary.losses.length,'продукт','продукта','продуктов')} с потерями`} tone="amber"/><Metric icon={<Truck/>} label="Продуктов в дефиците" value={summary.shortages.length} detail="По отказам за период" tone="blue"/></div>
    <div className="report-grid analytics-charts"><div className="analytics-left"><OrdersChart analytics={base} selectedDays={selectedDays} onSelectDays={setSelectedDays}/>
      <section className="report-section dish-ranking"><PanelTitle title="Какие блюда чаще не удавалось приготовить" subtitle="Топ-5 по отклонённым заказам за выбранные дни"/>{dishes.length?<ol className="analytics-ranking">{dishes.map(d=><li key={d.id}><div className="ranking-heading"><strong>{d.name}</strong><span>{counted(d.rejectedOrders,'отказ','отказа','отказов')}</span></div><div className="ranking-bar"><span style={{width:d.rejectedOrders/dishes[0].rejectedOrders*100+'%'}}/></div><small>{counted(d.rejectedPortions,'порция','порции','порций')} · {d.reasons.length?'Не хватало: '+d.reasons.join(', '):'Заказ отклонён из-за дефицита'}</small></li>)}</ol>:<Empty text="За выбранные дни отклонённых заказов с блюдами нет"/>}</section>
    </div><section className="report-section"><PanelTitle title="Самые дефицитные ингредиенты" subtitle="Приоритет по числу отказов"/>{!summary.shortages.length?<Empty text="За выбранный период дефицита не было"/>:<ol className="shortage-ranking">{summary.shortages.slice(0,5).map((p,i)=><li key={p.id}><span className="ranking-number">{i+1}</span><div className="ranking-content"><div className="ranking-heading"><strong>{p.name}</strong><Badge status="red">{counted(p.shortageCount,'отказ','отказа','отказов')}</Badge></div><p>Не хватало <strong>{qty(p.shortageQuantity,p.unit)}</strong></p><div className="detail-chips">{p.affectedDishes.map(id=><span key={id}>{dishName(id)}</span>)}</div></div></li>)}</ol>}</section></div>
    <section className="report-section waste-ranking"><PanelTitle title="Топ продуктов по стоимости списаний" subtitle="Топ-5 в каждой валюте · по известным закупочным ценам"/>{currencies.length?currencies.map(currency=>{
      const products=(analytics.wasteProducts??[]).filter(p=>p.currency===currency).slice(0,5);
      return <div key={currency} className="waste-currency"><h3>{currency}</h3><ol className="analytics-ranking">{products.map(p=><li key={p.id}><div className="ranking-heading"><strong>{p.name}</strong><span>{number(p.cost)} {currency}</span></div><div className="ranking-bar amber"><span style={{width:p.cost/products[0].cost*100+'%'}}/></div></li>)}</ol></div>;
    }):<Empty text="За выбранные дни нет списаний с известной стоимостью"/>}<p className="cost-note">Списания: цены известны для {analytics.priceCoverage.find(c=>c.kind==='expiry')?.priced??0} из {analytics.priceCoverage.find(c=>c.kind==='expiry')?.total??0} движений. Неизвестная цена не означает нулевую стоимость.</p></section>
    <section className="report-section analytics-products"><PanelTitle title="Расход, потери и дефицит" subtitle="Сначала продукты с наибольшим числом отказов" action={<Input aria-label="Найти продукт в аналитике" placeholder="Найти продукт" value={search} onChange={e=>setSearch(e.target.value)}/>}/><div className="table-wrap"><Table><thead><tr><th>Продукт</th><th>Расход</th><th>Потери</th><th>Отказы</th><th>Дефицит</th><th>Затронутые блюда</th></tr></thead><tbody>{ranked.filter(p=>p.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(p=><tr key={p.id} className={p.shortageCount?'row-danger':p.wasted?'row-warning':''}><td><strong>{p.name}</strong></td><td><span className="quantity-value">{qty(p.consumed,p.unit)}</span></td><td>{p.wasted?<strong className="amber-text">{qty(p.wasted,p.unit)}</strong>:<span className="muted">{qty(0,p.unit)}</span>}</td><td>{p.shortageCount?<Badge status="red">{counted(p.shortageCount,'отказ','отказа','отказов')}</Badge>:<span className="muted">0</span>}</td><td>{p.shortageQuantity?<strong className="error-text">{qty(p.shortageQuantity,p.unit)}</strong>:<span className="muted">{qty(0,p.unit)}</span>}</td><td><div className="detail-chips">{p.affectedDishes.length?p.affectedDishes.map(id=><span key={id}>{dishName(id)}</span>):<span className="muted">Нет</span>}</div></td></tr>)}</tbody></Table></div>{!ranked.length&&<Empty text="Движений продуктов за период нет"/>}{ranked.length>0&&!ranked.some(p=>p.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))&&<Empty text="Продуктов с таким названием нет"/>}</section>
    <section className="report-section cost-section"><PanelTitle title="Стоимость расхода и потерь" subtitle="По известным закупочным ценам"/>{activeCosts.length?<div className="cost-grid">{activeCosts.map(c=><dl key={c.currency}><div><dt>Потери по сроку · {c.currency}</dt><dd className="amber-text">{number(c.wasted)}</dd></div><div><dt>Расход на заказы · {c.currency}</dt><dd>{number(c.consumed)}</dd></div></dl>)}</div>:<p className="panel-note">Нет движений с известной стоимостью за период.</p>}<div className="price-coverage">{analytics.priceCoverage.map(c=><span key={c.kind}>{c.kind==='order'?'Расход':'Потери'}: цены известны для <strong>{c.priced} из {c.total}</strong> движений</span>)}</div><p className="cost-note">Неизвестная цена не означает нулевую стоимость.</p><details className="report-details"><summary>Данные и методика</summary><p>Принятые заказы и уникальные отказы учитываются раздельно. Списания относятся к дате проведения. Количества разных единиц и суммы разных валют не складываются.</p><p>Часовой пояс: {analytics.timezone}. По фильтру дат включаются полные дни ресторана.</p></details></section>
  </div>;
}
