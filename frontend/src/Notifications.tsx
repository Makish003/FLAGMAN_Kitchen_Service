import {useEffect,useRef,useState} from 'react';
import {Bell,Boxes,ChevronRight,CircleAlert,Clock3,ShieldCheck,Truck,UtensilsCrossed,X} from 'lucide-react';
import {Button} from './components';
import type {Snapshot} from './types';
import {usePresence} from './motion/usePresence';

const noticeSections = {stop:'Стоп-лист',expiry:'Сроки годности',stock:'Склад и партии',menu:'Меню и рецептуры',deliveries:'Поставки'};
type Notice = {id:string;title:string;description:string;page:keyof typeof noticeSections;count:number;icon:typeof Bell};
const plural = (count:number,forms:[string,string,string]) => forms[count%100>=11&&count%100<=14?2:count%10===1?0:count%10>=2&&count%10<=4?1:2];
function noticesFor(s:Snapshot):Notice[] {
  const notices:Notice[]=[];
  const dishes=s.dishes.filter(d=>!d.archived);
  const stopped=dishes.filter(d=>d.portions===0).length;
  if(stopped)notices.push({id:'stop',title:`${stopped} ${plural(stopped,['блюдо','блюда','блюд'])} в стоп-листе!`,description:'Посмотрите, каких ингредиентов не хватает.',page:'stop',count:stopped,icon:CircleAlert});
  const warning=s.totals.warningBatches;
  if(warning)notices.push({id:'expiry',title:`${warning} ${plural(warning,['партия скоро истечёт','партии скоро истекут','партий скоро истекут'])}!`,description:'Проверьте сроки годности и используйте продукты вовремя.',page:'expiry',count:warning,icon:Clock3});
  if(!s.products.length||!dishes.length||!s.totals.deliveries)notices.push({id:'setup',title:'Вы не закончили настройку склада!',description:!s.products.length?'Добавьте продукты для учёта остатков.':!dishes.length?'Добавьте блюда и их рецептуры.':'Примите первую поставку продуктов.',page:!s.products.length?'stock':!dishes.length?'menu':'deliveries',count:1,icon:Boxes});
  return notices;
}

function PushNotice({notice,onOpen,onClose}:{notice:Notice;onOpen:()=>void;onClose:()=>void}) {
  const [visible,setVisible]=useState(true);
  const ref=useRef<HTMLElement>(null);
  const motion=usePresence(visible,ref,onClose);
  useEffect(()=>{const timer=setTimeout(()=>setVisible(false),8000);return()=>clearTimeout(timer);},[]);
  return <article ref={ref} data-phase={motion.phase} inert={!visible} aria-hidden={!visible||undefined} className="notification-push" role="status"><Button className="notification-push-action" onClick={onOpen}><span className="notification-app"><Bell size={14}/> {noticeSections[notice.page]} <small>Сейчас</small></span><strong>{notice.title}</strong><span>{notice.description}</span></Button><Button className="icon-button notification-push-close" aria-label={`Закрыть уведомление: ${notice.title}`} onClick={()=>setVisible(false)}><X size={16}/></Button></article>;
}

export function Notifications({snapshot,page,navigate}:{snapshot:Snapshot|null;page:string;navigate:(page:string)=>void}) {
  const [expanded,setExpanded]=useState(false);
  const [pushes,setPushes]=useState<(Notice&{key:number})[]>([]);
  const previous=useRef<Map<string,number>|null>(null);
  const sequence=useRef(0);
  const container=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLElement>(null);
  const panelMotion=usePresence(expanded,panel);
  const notices=snapshot?noticesFor(snapshot):[];
  useEffect(()=>setExpanded(false),[page]);
  useEffect(()=>{
    if(!snapshot)return;
    const current=noticesFor(snapshot);
    const added=previous.current?current.filter(n=>n.count>(previous.current!.get(n.id)??0)):[];
    previous.current=new Map(current.map(n=>[n.id,n.count]));
    const fresh=added.map(n=>({...n,key:++sequence.current}));
    // Resolved alerts disappear from both the panel and any visible pushes.
    setPushes(old=>[...old.filter(n=>current.some(c=>c.id===n.id)&&!fresh.some(c=>c.id===n.id)).map(n=>({...current.find(c=>c.id===n.id)!,key:n.key})),...fresh].slice(-3));
  },[snapshot]);
  useEffect(()=>{
    if(!expanded)return;
    panel.current?.focus();
    const outside=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node))setExpanded(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setExpanded(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[expanded]);
  const visit=(target:string)=>{setExpanded(false);navigate(target);};
  return <div className="notifications" ref={container} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setExpanded(false);}}>
    <Button ref={trigger} className="icon-button" aria-label="Уведомления" aria-expanded={expanded} aria-haspopup="dialog" aria-controls="notifications-panel" onClick={()=>setExpanded(v=>!v)}><Bell size={19}/>{notices.length>0&&<i aria-hidden="true"/>}</Button>
    {panelMotion.present&&<section ref={panel} data-phase={panelMotion.phase} inert={!expanded} aria-hidden={!expanded||undefined} tabIndex={-1} className="notifications-panel" id="notifications-panel" role="dialog" aria-labelledby="notifications-title"><div className="notifications-heading"><h2 id="notifications-title">Уведомления {notices.length>0&&<span>{notices.length}</span>}</h2><Button className="icon-button" aria-label="Закрыть уведомления" onClick={()=>{setExpanded(false);trigger.current?.focus();}}><X size={18}/></Button></div>
      <div className="notifications-content"><div className="notification-shortcuts" aria-label="Быстрые переходы">{[
        {page:'stock',label:'Склад',icon:Boxes},{page:'menu',label:'Меню',icon:UtensilsCrossed},
        {page:'expiry',label:'Сроки годности',icon:Clock3},{page:'deliveries',label:'Поставки',icon:Truck},
      ].map(shortcut=><Button key={shortcut.page} onClick={()=>visit(shortcut.page)}><shortcut.icon size={22}/><span>{shortcut.label}</span></Button>)}</div><p className="notifications-caption">Требуют внимания</p>
      {!snapshot?<p className="notifications-empty" role="status">Загружаем уведомления…</p>:notices.length?<ul className="notifications-list">{notices.map(n=><li key={n.id}><Button className="notification-item" onClick={()=>visit(n.page)}><span className={`notification-icon ${n.id}`}><n.icon size={24}/></span><span><strong>{n.title}</strong><small>{n.description}</small></span><ChevronRight size={17}/></Button></li>)}</ul>:<div className="notifications-empty"><ShieldCheck size={28}/><strong>Всё под контролем</strong><p>Новых уведомлений нет.</p></div>}
      </div><div className="notifications-footer"><span><Bell size={16}/> Флагман</span><span><ShieldCheck size={16}/> Контроль кухни</span></div>
    </section>}
    {pushes.length>0&&<div className="notification-pushes" aria-label="Новые уведомления">{pushes.map(n=><PushNotice key={n.key} notice={n} onClose={()=>setPushes(old=>old.filter(p=>p.key!==n.key))} onOpen={()=>{setPushes(old=>old.filter(p=>p.key!==n.key));visit(n.page);}}/>)}</div>}
  </div>;
}
