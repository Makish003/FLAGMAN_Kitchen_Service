import {ArrowRight,Boxes,Clock3,Truck,ShieldCheck} from 'lucide-react';
import {Button,PanelTitle,Table,Badge,Empty} from './components';
import {OrdersChart} from './OrdersChart';
import {insightSummary} from './insightSummary';
import {qty,counted} from './format';
import type {Snapshot} from './types';

function HealthMeter({value,total,label,display}:{value:number;total:number;label:string;display:string}) {
  const percentage=total?value/total*100:0;
  return <div className="health-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={value}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="meter-track" cx="50" cy="50" r="42"/>{percentage>0&&<circle className="meter-value" cx="50" cy="50" r="42" pathLength="100" strokeDasharray={`${percentage} 100`} transform="rotate(-90 50 50)"/>}</svg><strong aria-hidden="true">{display}</strong></div>;
}

export function WarehouseDashboard({s,navigate}:{s:Snapshot;navigate:(id:string)=>void}) {
  const dishes=s.dishes.filter(d=>!d.archived),blocked=dishes.filter(d=>!d.portions);
  const products=s.products.filter(p=>!p.archived);
  const menuProducts=new Set(dishes.flatMap(d=>d.ingredients.map(i=>i.productId)));
  const missing=products.filter(p=>menuProducts.has(p.id)&&p.usable<=0);
  const risk=products.filter(p=>p.expiring>0);
  const usable=products.filter(p=>p.usable>0);
  const summary=insightSummary(s.analytics);
  if (!products.length&&!dishes.length) return <section className="report-section warehouse-health"><PanelTitle icon={<Boxes size={18}/>} title="Состояние склада" action={<Badge status="neutral">Ожидает настройки</Badge>}/><div className="report-empty"><Boxes size={28}/><div><strong>Продукты и меню ещё не добавлены</strong><p>Нет остатков, рецептур и данных для оценки рисков.</p></div></div></section>;
  const priorities=[...products].filter(p=>p.expiring>0||p.expired>0||missing.some(x=>x.id===p.id))
    .sort((a,b)=>Number(b.usable<=0)-Number(a.usable<=0)||Number(b.expired>0)-Number(a.expired>0)||a.name.localeCompare(b.name,'ru')).slice(0,6);
  return <div className="warehouse-dashboard">
    <section className="report-section warehouse-health"><PanelTitle icon={<Boxes size={18}/>} title="Состояние склада" subtitle="Актуальные остатки и риски для меню" action={<Badge status={blocked.length||risk.length?'amber':'green'}>{blocked.length||risk.length?'Требует внимания':'Стабильно'}</Badge>}/>
      <div className="health-grid"><div><HealthMeter value={dishes.length-blocked.length} total={dishes.length} label="Доступность меню" display={dishes.length?Math.round((dishes.length-blocked.length)/dishes.length*100)+'%':'—'}/><div><span>Доступность меню</span><strong className="health-value">{dishes.length-blocked.length} из {dishes.length} блюд</strong><small>{blocked.length?`${counted(blocked.length,'блюдо','блюда','блюд')} в стоп-листе`:dishes.length?'Все блюда доступны':'Добавьте блюда в меню'}</small></div></div><div><HealthMeter value={usable.length} total={products.length} label="Продукты с запасом" display={`${usable.length}/${products.length}`}/><div><span>Продукты с запасом</span><strong className="health-value">{counted(usable.length,'продукт','продукта','продуктов')}</strong><small>{missing.length} ингредиентов меню без запаса</small></div></div><div><span className="health-risk-icon"><Clock3 size={26}/></span><div><span>Риск списания</span><strong className={`health-value ${risk.length?'amber-text':''}`}>{counted(risk.length,'продукт','продукта','продуктов')}</strong><Button className="text-button" onClick={()=>navigate('expiry')}>Проверить сроки <ArrowRight size={14}/></Button></div></div></div>
    </section>
    <div className="report-grid"><OrdersChart analytics={s.analytics} compact/><section className="report-section"><PanelTitle title="Приоритеты смены" subtitle="Действия по текущему складу"/><div className="shift-actions">
      <Button onClick={()=>navigate('procurement')}><Truck size={20}/><span><strong>{blocked.length?`Вернуть в меню ${counted(blocked.length,'блюдо','блюда','блюд')}`:'Проверить следующую закупку'}</strong><small>{missing.length?`Без запаса: ${missing.slice(0,3).map(p=>p.name).join(', ')}`:'Рассчитать потребность к доставке'}</small></span><ArrowRight size={16}/></Button>
      <Button onClick={()=>navigate('offers')}><Clock3 size={20}/><span><strong>{risk.length?`Использовать ${counted(risk.length,'продукт','продукта','продуктов')} вовремя`:'Сроки под контролем'}</strong><small>{risk.length?'Подобрать блюда из партий с близким сроком':'Проверить предложения кухни'}</small></span><ArrowRight size={16}/></Button>
      <Button onClick={()=>navigate('analytics')}><ShieldCheck size={20}/><span><strong>{summary.title}</strong><small>{summary.total?`${s.analytics.ordersAccepted} принято · ${s.analytics.ordersRejected} отказов · ${s.analytics.lossBatches} списаний`:'Нет заказов за период'}</small></span><ArrowRight size={16}/></Button>
    </div></section></div>
    <section className="report-section"><PanelTitle title="Продукты, требующие внимания" action={<Button className="text-button" onClick={()=>navigate('stock')}>Весь склад <ArrowRight size={15}/></Button>}/>{priorities.length?<div className="table-wrap"><Table><thead><tr><th>Продукт</th><th>Пригодный запас</th><th>Скоро истечёт</th><th>Влияние на меню</th><th>Действие</th></tr></thead><tbody>{priorities.map(p=>{const affected=blocked.filter(d=>d.shortages.some(x=>x.productId===p.id));return <tr key={p.id}><td><strong>{p.name}</strong></td><td>{qty(p.usable,p.unit)}</td><td className={p.expiring?'amber-text':''}>{qty(p.expiring,p.unit)}</td><td>{affected.length?<Badge status="red">{counted(affected.length,'блюдо','блюда','блюд')} {affected.length===1?'недоступно':'недоступны'}</Badge>:<Badge status="green">Не блокирует меню</Badge>}</td><td><Button className="text-button" onClick={()=>navigate(affected.length?'procurement':p.expired>0?'stock':'offers')}>{affected.length?'Закупить':p.expired>0?'Проверить остаток':'Использовать'}<ArrowRight size={14}/></Button></td></tr>;})}</tbody></Table></div>:<Empty text="Дефицита и партий в зоне риска нет"/>}</section>
  </div>;
}
