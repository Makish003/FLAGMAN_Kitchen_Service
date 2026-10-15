import {EventLogView} from './EventLogView';
import {WriteOffButton} from './WriteOffButton';
import {Button,Input,Combobox,Table,Dialog} from './components';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownLeft, ArrowRight, BarChart3, Bell, Boxes, Check, ChevronLeft, ChevronRight, Clock3, Flame, LayoutDashboard, Leaf, LogOut, Menu, PackagePlus, Plus, Search, Settings as SettingsIcon, Settings2, ShieldCheck, ShoppingBasket, SlidersHorizontal, Truck, UtensilsCrossed, X, CircleAlert, Radio, Play, Square, TrendingUp } from 'lucide-react';
import {setApiActor} from './api';
import {ExternalRoleApp,WorkflowNotifications} from './ExternalRoleApp';
import {ProcurementRequestsView} from './ProcurementRequestsView';
import {OrderRequestsView} from './OrderRequestsView';
import {DeliveryRequestsList} from './DeliveryAcceptanceDialog';
import {AccountManagementView} from './AccountManagementView';
import {OfferManagement} from './OfferManagement';
import {useWorkflowResource} from './workflowHooks';
import type{DeliveryRequest,PageResult}from './workflowTypes';
import { api, ApiError, durableOperation, pendingIntent, recoverPending, clearPending } from './api';
import { restaurantUtc } from './time';
import type { Analytics, Batch, Delivery, Dish, Movement, Order, Settings, Snapshot } from './types';
import './styles.scss';
import {Badge,Empty,Metric,PanelTitle,Toolbar,History,Pagination} from './components';
import {Login,StockView,GeneratorView} from './pages';
import {AnalyticsView} from './AnalyticsView';
import {WarehouseDashboard} from './WarehouseDashboard';
import {OperationModal} from './OperationModal';
import { PlanningView } from './PlanningView';
import { OffersView } from './OffersView';
import type {OrderPreset,DeliveryPreset} from './types';
import { DetailsDialog } from './DetailsDialog';
import { Notifications } from './Notifications';
import {usePresence} from './motion/usePresence';

import { units, number, qty, shortId } from './format';
const nav = [
  { id: 'overview', label: 'Обзор кухни', icon: LayoutDashboard }, { id: 'stock', label: 'Склад и партии', icon: Boxes },
  { id: 'deliveries', label: 'Поставки', icon: Truck }, { id: 'menu', label: 'Меню и рецептуры', icon: UtensilsCrossed },
  { id: 'orders', label: 'Заказы', icon: ShoppingBasket }, { id: 'stop', label: 'Стоп-лист', icon: CircleAlert },
  { id: 'offers', label: 'Горячие предложения', icon: Flame }, { id: 'analytics', label: 'Аналитика и закупки', icon: BarChart3 },
  { id: 'expiry', label: 'Сроки годности', icon: Clock3 }, { id: 'procurement', label: 'Закупки', icon: Truck }, { id: 'forecast', label: 'Прогноз', icon: TrendingUp },
  {id:'procurement-requests',label:'Заявки поставщикам',icon:Truck},{id:'accounts',label:'Аккаунты',icon:ShieldCheck},{id:'event-log',label:'Журнал событий',icon:Activity},
  { id: 'generator', label: 'Демонстрация', icon: SlidersHorizontal },
];
import type { ModalKind, Session } from './appTypes';
function App() {
  const [reauth,setReauth]=useState(false);
  const [session, updateSession] = useState<Session | null>(null);
  const setSession=(next:Session|null)=>{setApiActor(next?.id??'',next?.role??'');updateSession(next);setReauth(false);}; const [checking, setChecking] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [page, setPage] = useState(() => nav.some(n=>n.id===location.pathname.slice(1)) ? location.pathname.slice(1) : 'overview');
  const[deliveryTab,setDeliveryTab]=useState(()=>new URLSearchParams(location.search).get('tab')==='posted'?'posted':'requests');
  const [expiryFilter,setExpiryFilter]=useState('warning');
  const [orderLogStatus,setOrderLogStatus]=useState('all');
  const [orderPreset,setOrderPreset]=useState<OrderPreset>();const [deliveryPreset,setDeliveryPreset]=useState<DeliveryPreset>();
  const [detail,setDetail]=useState<{entity:string;id:string}|null>(null);
  const [modal, setModal] = useState<ModalKind>(null); const [editDish, setEditDish] = useState<Dish | undefined>();
  const [modalVersion,setModalVersion]=useState(0);
  const [presetDish, setPresetDish] = useState<string | undefined>(); const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState<{text: string; error?: boolean} | null>(null); const [online, setOnline] = useState(false);
  const [loadError, setLoadError] = useState(''); const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [updatedAt,setUpdatedAt] = useState<number>(0); const [pending,setPending] = useState(!!pendingIntent());
  const [realNow,setRealNow] = useState(()=>new Date().toISOString());
  useEffect(()=>{const timer=setInterval(()=>setRealNow(new Date().toISOString()),1000);return()=>clearInterval(timer);},[]);
  const refreshBusy = useRef(false);
  const [wideNavigation,setWideNavigation] = useState(()=>matchMedia('(min-width: 64rem)').matches);
  useEffect(()=>{const query=matchMedia('(min-width: 64rem)');const update=()=>setWideNavigation(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
  const sidebarRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mobileMotion=usePresence(mobile&&!wideNavigation&&!!session,sidebarRef,undefined,wideNavigation);
  const mobilePresent=mobileMotion.present&&!wideNavigation&&!!session;
  const scrimRef=useRef<HTMLButtonElement>(null);
  const scrimMotion=usePresence(mobile&&!wideNavigation&&!!session,scrimRef,undefined,wideNavigation);
  const toastRef=useRef<HTMLDivElement>(null);
  const toastMotion=usePresence(!!toast,toastRef);
  const retainedToast=useRef(toast);if(toast)retainedToast.current=toast;
  const visibleToast=toast??retainedToast.current;
  useEffect(()=>{if(wideNavigation)setMobile(false);},[wideNavigation]);
  useEffect(()=>{if(!session){setMobile(false);setModal(null);setDetail(null);}},[session]);
  useEffect(() => {
    if (!mobilePresent) return;
    const previous = document.activeElement as HTMLElement;
    const workspace = workspaceRef.current;
    if (workspace) workspace.inert = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLButtonElement>('.nav-close')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); setMobile(false); }
      if (event.key !== 'Tab') return;
      const elements = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('button,a[href]') ?? [])].filter(el => el.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const wide = matchMedia('(min-width: 64rem)');
    const resize = () => { if (wide.matches) setMobile(false); };
    document.addEventListener('keydown', keyboard); wide.addEventListener('change', resize);
    return () => {
      if (workspace) workspace.inert = false;
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', keyboard); wide.removeEventListener('change', resize);
      if(!document.querySelector('dialog[open]')) {
        const target=previous?.isConnected&&!previous.closest('[inert]')&&previous.getClientRects().length?previous:document.querySelector<HTMLElement>('.mobile-menu');
        target?.focus();
      }
    };
  }, [mobilePresent]);
  useEffect(() => { document.title = `${nav.find(n => n.id === page)?.label ?? 'Обзор кухни'} · Флагман`; }, [page]);
  const notify = useCallback((text: string, error = false) => setToast({text, error}), []);
  const refresh = useCallback(async () => {
    if (refreshBusy.current) return; refreshBusy.current = true;
    try { if(!['admin','manager'].includes(session?.role??''))return; setSnapshot(await api<Snapshot>('/snapshot')); setLoadError(''); setUpdatedAt(Date.now()); setPending(!!pendingIntent()); }
    catch (error) { if (error instanceof ApiError && error.status === 401) { setReauth(true); setLoadError('Сессия истекла. Войдите снова; заполненная форма сохранена.'); } else setLoadError((error as Error).message); }
    finally { refreshBusy.current = false; }
  }, [session?.id,session?.role]);
  useEffect(()=>{if(reauth){document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>{d.dataset.reauthPaused='true';d.close();});document.querySelector<HTMLInputElement>('.reauth-overlay input')?.focus();}else document.querySelectorAll<HTMLDialogElement>('dialog[data-reauth-paused]').forEach(d=>{delete d.dataset.reauthPaused;if(d.isConnected)d.showModal();});},[reauth]);
  useEffect(()=>{const unauthorized=()=>{if(session)setReauth(true);};window.addEventListener('flagman:unauthorized',unauthorized);return()=>window.removeEventListener('flagman:unauthorized',unauthorized);},[session]);
  useEffect(() => { api<Session>('/session').then(setSession).catch(() => {}).finally(() => setChecking(false)); }, []);
  useEffect(() => {
    if (!session || !['admin','manager'].includes(session.role)) return; refresh();
    const stream = new EventSource('/api/events'); let debounce: ReturnType<typeof setTimeout>;
    const update = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 150); };
    stream.onopen = () => setOnline(true); stream.onerror = () => setOnline(false);
    stream.addEventListener('sync', update); stream.addEventListener('change', update);
    const timer = setInterval(refresh, 30000);
    return () => { stream.close(); clearInterval(timer); clearTimeout(debounce); setOnline(false); };
  }, [session, refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  const open = (kind: ModalKind, dish?: Dish, preset?: string) => { setModalVersion(v=>v+1);setOrderPreset(undefined);setDeliveryPreset(undefined);setMobile(false); setEditDish(dish); setPresetDish(preset); setModal(kind); };
  const canOpenPage = (id:string) => (!['accounts','event-log'].includes(id)||session?.role==='admin')&&(session?.role!=='manager'||!session.visiblePages||session.visiblePages.includes(id))&&(id!=='generator'||session?.role==='admin'&&session.demo);
  const firstPage=nav.find(n=>canOpenPage(n.id))?.id??'overview';
  const navigate = (id: string) => { if(!canOpenPage(id))id=firstPage; history.pushState({},'', '/'+id); setPage(id); setSearch(''); setMobile(false); };
  useEffect(()=>{if(['admin','manager'].includes(session?.role??'')&&(!nav.some(n=>n.id===location.pathname.slice(1))||!canOpenPage(location.pathname.slice(1)))){history.replaceState({},'','/'+firstPage);setPage(firstPage);}},[session?.role,session?.demo,session?.visiblePages,page]);
  useEffect(()=>{const back=()=>{setDeliveryTab(new URLSearchParams(location.search).get('tab')==='posted'?'posted':'requests');setPage(nav.some(n=>n.id===location.pathname.slice(1))?location.pathname.slice(1):'overview');setSearch(new URLSearchParams(location.search).get('q')??'');};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
  useEffect(()=>{const u=new URL(location.href);if(search)u.searchParams.set('q',search);else u.searchParams.delete('q');history.replaceState({},'',u);},[search]);
  const date = (value: string, full = false) => new Intl.DateTimeFormat('ru-RU', { timeZone: snapshot?.settings.timezone ?? 'Europe/Moscow', day: '2-digit', month: 'short', ...(full ? {year: 'numeric' as const} : {}), hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const hours = (expiry: string) => snapshot ? (new Date(expiry).getTime() - new Date(snapshot.now).getTime()) / 3600000 : 0;
  const remaining = (expiry: string) => { const h = hours(expiry); return h <= 0 ? 'Срок истёк' : h < 1 ? `${Math.max(1, Math.ceil(h * 60))} мин` : h < 48 ? `${number(Math.floor(h))} ч` : `${Math.floor(h / 24)} дн`; };
  if (checking) return <div className="loading-screen" role="status"><Activity className="spin"/><p>Подключаемся к кухне…</p></div>;
  if (!session) return <Login onLogin={setSession} message={loadError}/>;
  const loginAgain=reauth?<div className="reauth-overlay"><Login onLogin={setSession} message="Войдите снова. Форма текущего аккаунта сохранена."/></div>:null;
  if(!['admin','manager'].includes(session.role))return <><div inert={reauth}><ExternalRoleApp key={session.id+session.role} session={session} onLogout={()=>api('/logout','POST').then(()=>setSession(null)).catch(e=>{if(e instanceof ApiError&&e.status===401)setSession(null);else notify(e.message,true);})}/></div>{loginAgain}</>;
  const activeDishes=snapshot?.dishes.filter(d=>!d.archived)??[];
  const stop = activeDishes.filter(d=>d.portions===0);
  const expiring = snapshot?.expiringBatches ?? [];
  const warningCount = snapshot?.totals.warningBatches ?? 0;
  const filtered = (text: string) => text.toLowerCase().includes(search.toLowerCase());
  const productName = (id: string) => snapshot?.products.find(p => p.id === id)?.name ?? id;
  const dishName = (id: string) => snapshot?.dishes.find(d => d.id === id)?.name ?? id;
  const productUnit = (id: string) => snapshot?.products.find(p => p.id === id)?.unit ?? '';
  const change = async (fn: () => Promise<unknown>, message: string) => { try { await fn(); await refresh(); notify(message); } catch (e) { notify((e as Error).message, true); } };
  const current = nav.find(n => n.id === page)??nav[0];
  const showDeliveryAction = ['overview','stock','deliveries'].includes(page);
  const showOrderAction = ['overview','orders'].includes(page);
  const demoOffsetHours = session.demo ? snapshot?.demoOffsetHours ?? 0 : 0;
  const headerNow = new Date(new Date(realNow).getTime() + demoOffsetHours * 3600000).toISOString();
  return <><div className="app-shell" inert={reauth}><a className="skip-link" href="#main-content">Перейти к содержимому</a>
    {mobilePresent && <Button ref={scrimRef} data-phase={scrimMotion.phase} className="nav-scrim" aria-label="Закрыть навигацию" onClick={() => setMobile(false)}/>}
    <aside inert={!wideNavigation&&!mobilePresent} aria-hidden={!wideNavigation&&!mobilePresent?true:undefined} ref={sidebarRef} data-phase={wideNavigation?undefined:mobileMotion.phase} id="main-navigation" className={`sidebar ${mobile ? 'open' : ''}`} role={mobilePresent?'dialog':undefined} aria-modal={mobilePresent?true:undefined} aria-label="Навигация кухни"><Button className="icon-button nav-close" aria-label="Закрыть навигацию" onClick={()=>setMobile(false)}><X size={18}/></Button>
      <a className="brand" href="/overview" onClick={e => {e.preventDefault(); navigate('overview');}}><span className="brand-mark"><Leaf size={24}/></span><span>флагман<small>КОНТРОЛЬ КУХНИ</small></span></a>
      <div className="restaurant"><span className="restaurant-icon"><UtensilsCrossed size={18}/></span><div>Ресторан «Флагман»<small>Операционный кабинет</small></div><span className="dot"/></div>
      <nav aria-label="Основная навигация">{[
        {label:'Каждый день', ids:['overview','stock','menu','orders','deliveries']},
        {label:'Контроль кухни', ids:['expiry','stop','offers']},
        {label:'Планирование', ids:['procurement','procurement-requests','forecast','analytics','accounts','event-log','generator']},
      ].map(group => <React.Fragment key={group.label}><p className="nav-label">{group.label}</p>{group.ids.map(id=>nav.find(n=>n.id===id)!).filter(n=>canOpenPage(n.id)).map(n=><Button key={n.id} aria-label={n.label} className={page===n.id?'active':''} onClick={()=>navigate(n.id)} aria-current={page===n.id?'page':undefined}><n.icon size={18}/><span>{n.label}</span>{n.id==='stop'&&stop.length>0&&<b>{stop.length}</b>}</Button>)}</React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="system"><ShieldCheck size={20}/><div>Склад под контролем<small>Учёт по партиям · FEFO</small></div></div><Button className="profile" onClick={() => open('settings')}><span className="profile-icon"><SettingsIcon size={20} aria-hidden="true"/></span><span>{session.name}<small>Настройки ресторана</small></span></Button></div>
    </aside>
    <div className="workspace" ref={workspaceRef}>
      <header className="topbar"><div><Button className="icon-button mobile-menu" aria-label="Открыть навигацию" aria-expanded={mobile} aria-controls="main-navigation" onClick={() => setMobile(true)}><Menu/></Button><span className="breadcrumb">Рабочее пространство <ChevronRight size={14}/> <strong>{current.label}</strong></span></div><div className="topbar-right"><div className="header-clock-area" data-testid={session.demo?"demo-time":undefined}>{session.demo&&<div className="header-clock-mode"><Badge status="neutral">Демо-режим</Badge><span>Время демо{demoOffsetHours ? ` (+${number(demoOffsetHours)} ч)` : ''}</span></div>}<time className="header-clock" data-testid="current-time" dateTime={headerNow} title={snapshot?.settings.timezone??'Europe/Moscow'}><span className="clock-date">{new Intl.DateTimeFormat('ru-RU',{timeZone:snapshot?.settings.timezone??'Europe/Moscow',day:'2-digit',month:'short',year:'numeric'}).format(new Date(headerNow))}</span><span className="clock-time">{new Intl.DateTimeFormat('ru-RU',{timeZone:snapshot?.settings.timezone??'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(headerNow))}</span><span className="clock-zone">{snapshot?.settings.timezone??'Europe/Moscow'}</span></time></div><Notifications snapshot={snapshot} page={page} navigate={navigate}/><Button className="icon-button" aria-label="Выйти" onClick={() => change(async () => {await api('/logout', 'POST'); setPending(false); setSession(null); setSnapshot(null);}, 'Вы вышли из системы')}><LogOut size={18}/></Button></div></header>
      <main id="main-content" tabIndex={-1}><div key={page} className="section-motion">
        <div className="page-heading"><div><p className="eyebrow">{page === 'overview' ? 'ВСЁ ДЛЯ СПОКОЙНОЙ СМЕНЫ' : 'ОПЕРАЦИОННЫЙ КОНТРОЛЬ'}</p><h1>{page === 'overview' ? 'Обзор кухни' : current.label}</h1><p className="page-description">{page === 'overview' ? 'Что происходит на кухне и чем заняться в первую очередь.' : descriptions[page]}</p></div>{(showDeliveryAction||showOrderAction)&&<div className="heading-actions">{showDeliveryAction&&<Button className="button secondary" disabled={pending} onClick={() => open('delivery')}><PackagePlus size={17}/>Принять поставку</Button>}{showOrderAction&&<Button className="button primary" disabled={pending} onClick={() => open('order')}><Plus size={18}/>Новый заказ</Button>}</div>}</div>
        {loadError && <div className="notice danger" role="alert">{loadError}<Button onClick={refresh}>Повторить</Button></div>}
        {pending && <div className="notice danger" role="alert"><div><strong>Есть незавершённая операция</strong><p>Восстановите результат перед новым заказом или поставкой. Исходный состав сохранён.</p></div><Button className="button secondary" onClick={()=>change(async()=>{const r=await recoverPending();setPending(false);notify(r?.status==='rejected'?'Прежний заказ отклонён; причины в журнале.':'Прежняя операция восстановлена.');},'Результат операции проверен')}>Восстановить результат</Button></div>}
        {!snapshot ? <div className="skeleton"><Activity className="spin"/> Загружаем состояние склада…</div> : <>
          <div className="date-line"><span className="revision">{loadError || !online ? 'Данные могут быть устаревшими · ' : ''}Проверено {updatedAt ? new Date(updatedAt).toLocaleTimeString('ru-RU',{timeZone:snapshot.settings.timezone}) : ':'} · #{snapshot.revision}</span></div>
          {page==='overview' && (snapshot.products.length===0 || activeDishes.length===0 || snapshot.totals.deliveries===0) && <section className="panel onboarding" aria-labelledby="setup-title"><p className="eyebrow">ПЕРВЫЙ ЗАПУСК</p><h2 id="setup-title">Подготовьте кухню к первому заказу</h2><p>Три коротких шага. Базовые настройки уже готовы к работе.</p><ol className="setup-steps">{[
            {done:snapshot.products.length>0,title:'Добавьте продукты',text:'Название и единица измерения'},
            {done:activeDishes.length>0,title:'Составьте меню',text:'Блюдо и ингредиенты на порцию'},
            {done:snapshot.totals.deliveries>0,title:'Примите поставку',text:'Количество и срок годности'},
          ].map((step,i)=><li key={step.title} className={step.done?'done':''}><span>{step.done?<Check size={16}/>:i+1}</span><div><strong>{step.title}</strong><small>{step.text}</small></div></li>)}</ol><div className="setup-actions"><Button className="button primary" disabled={pending} onClick={()=>open(snapshot.products.length===0?'product':activeDishes.length===0?'dish':'delivery')}><Plus size={17}/>{snapshot.products.length===0?'Добавить продукт':activeDishes.length===0?'Добавить блюдо':'Принять первую поставку'}</Button>{session.role==='admin'&&session.demo&&snapshot.products.length===0&&<Button className="button secondary" onClick={()=>change(()=>api('/demo/seed','POST'),'Демонстрационный склад готов')}>Загрузить демо</Button>}<Button className="text-button" onClick={()=>open('settings')}>Настройки</Button></div></section>}
          {page === 'overview' && <>
            {snapshot.products.length>0 && <section className={`attention-banner ${warningCount||stop.length?'warning':''}`} aria-labelledby="attention-title"><span className="attention-icon">{warningCount||stop.length?<CircleAlert size={24}/>:<ShieldCheck size={24}/>}</span><div><h2 id="attention-title">{warningCount?'Используйте продукты с близким сроком':stop.length?'Пополните ингредиенты для меню':'Кухня готова к работе'}</h2><p>{warningCount?`${warningCount} партий требуют внимания. Посмотрите, какие блюда можно приготовить из них сегодня.`:stop.length?`${stop.length} блюд недоступны. Покажем, каких продуктов не хватает.`:'Нет партий с близким сроком годности. Доступность каждого заказа проверим перед списанием.'}</p></div>{(warningCount>0||stop.length>0)&&<Button className="button secondary" onClick={()=>navigate(warningCount?'offers':'stop')}>{warningCount?'Что приготовить':'Что пополнить'}<ArrowRight size={16}/></Button>}</section>}
            <div className="metrics"><Metric icon={<Boxes/>} label="Продуктов на складе" value={snapshot.products.filter(p => p.usable > 0).length} detail={`${snapshot.totals.activeBatches} активных партий`} tone="green"/><Metric icon={<Clock3/>} label="Истекают скоро" value={warningCount} detail={`Партии в пределах ${snapshot.settings.warningHours} часов`} tone="amber"/><Metric icon={<UtensilsCrossed/>} label="Блюд в стоп-листе" value={stop.length} detail={`${activeDishes.length - stop.length} блюд доступны к заказу`} tone="red"/><Metric icon={<ArrowDownLeft/>} label="Потери за период" value={snapshot.analytics.lossBatches} detail={`Партий списано за ${snapshot.settings.demandWindowDays} дней`} tone="blue"/></div>
            <WarehouseDashboard s={snapshot} navigate={navigate}/>
            <div className="overview-grid"><section className="panel expiry-panel"><PanelTitle icon={<Clock3 size={18}/>} title="Сначала используйте" subtitle="Партии с ближайшим сроком годности" action={<Button className="text-button" onClick={() => navigate('stock')}>Весь склад <ArrowRight size={15}/></Button>}/>{warningCount === 0 ? <Empty text="Нет партий с близким сроком годности"/> : <div className="compact-table"><Table><thead><tr><th>Продукт / партия</th><th>Остаток</th><th>До истечения</th><th>Приоритет</th></tr></thead><tbody>{expiring.slice(0, 5).map(b => <tr key={b.id}><td><strong>{productName(b.productId)}</strong><small>#{shortId(b.id)}</small></td><td>{qty(b.remainingQuantity, productUnit(b.productId))}</td><td><span className="time-cell"><Clock3 size={14}/>{remaining(b.expiresAt)}</span><small>{date(b.expiresAt)}</small></td><td><Badge status={hours(b.expiresAt) < 12 ? 'red' : 'amber'}>{hours(b.expiresAt) < 12 ? 'Срочно' : 'Скоро истечёт'}</Badge></td></tr>)}</tbody></Table></div>}<div className="panel-foot"><ShieldCheck size={15}/> При заказе сначала расходуются партии с ближайшим сроком</div></section>
              <section className="panel hot-panel"><div className="hot-heading"><span className="flame-mark"><Flame size={23}/></span><Badge status="amber">ПОДСКАЗКА ДЛЯ СМЕНЫ</Badge></div><h2>Что предложить<br/>гостям сегодня</h2><p>Предложите гостям блюда, которые помогут использовать продукты вовремя.</p>{snapshot.recommendations[0] ? <div className="featured-dish"><span className="dish-visual"><UtensilsCrossed size={28}/></span><div><strong>{snapshot.recommendations[0].dishName}</strong><small>{snapshot.recommendations[0].reasons[0]?.productName} · {remaining(snapshot.recommendations[0].reasons[0].expiresAt)}</small></div><ArrowRight size={16} aria-hidden="true"/></div> : <div className="featured-dish">Пока нет продуктов в зоне риска</div>}<Button className="button hot-button" onClick={() => navigate('offers')}>Открыть предложения <ArrowRight size={17}/></Button></section>
            </div>
          </>}
          {page === 'stock' && <StockView s={snapshot} search={search} setSearch={setSearch} productName={productName} productUnit={productUnit} date={date} remaining={remaining} open={open}/>}
          {page==='deliveries'&&<div className="filter-pills" role="tablist" aria-label="Раздел поставок">{[['requests','Заявки на поставку'],['posted','Проведённые поставки']].map(([id,label])=><Button key={id} id={'delivery-tab-'+id} role="tab" aria-selected={deliveryTab===id} aria-controls={deliveryTab===id?'delivery-'+id:undefined} className={deliveryTab===id?'active':''} onClick={()=>{setDeliveryTab(id);const url=new URL(location.href);url.searchParams.set('tab',id);history.replaceState({},'',url);}}>{label}</Button>)}</div>}
          {page==='deliveries'&&deliveryTab==='requests'&&<div id="delivery-requests" role="tabpanel" aria-labelledby="delivery-tab-requests"><ManagerDeliveries s={snapshot}/></div>}
          {page==='procurement-requests'&&<ProcurementRequestsView manager products={snapshot.products.filter(p=>!p.archived)} timezone={snapshot.settings.timezone} preset={deliveryPreset}/>}
          {page==='accounts'&&session.role==='admin'&&<AccountManagementView/>}
          {page==='event-log'&&session.role==='admin'&&<EventLogView timezone={snapshot.settings.timezone}/>}
          {page === 'deliveries' && deliveryTab==='posted' && <section id="delivery-posted" role="tabpanel" aria-labelledby="delivery-tab-posted" className="panel"><PanelTitle title="Журнал поставок" subtitle="Каждая поставка сохраняет отдельные партии и сроки"/><History<Delivery> entity="deliveries" revision={snapshot.revision} initial={snapshot.deliveries} total={snapshot.totals.deliveries} render={rows => <div className="table-wrap"><Table className="operational-table"><thead><tr><th>Номер</th><th>ID</th><th>Создана</th><th>Поступила</th><th>Партий</th><th/></tr></thead><tbody>{rows.map(d => <tr key={d.id}><td><Button className="text-button" onClick={()=>setDetail({entity:'deliveries',id:d.id})}>{d.number}</Button></td><td className="mono">#{shortId(d.id)}</td><td>{date(d.createdAt)}</td><td>{date(d.receivedAt)}</td><td>{d.batchIds.length}</td><td><Button className="text-button" onClick={() => {navigate('stock'); setSearch(d.id);}}>Посмотреть партии <ArrowRight size={14}/></Button></td></tr>)}</tbody></Table></div>}/></section>}
          {(page==='menu'||page==='offers')&&<OfferManagement s={snapshot} notify={notify}/>}
          {page === 'menu' && <div className={activeDishes.length===0?'panel menu-empty-panel':undefined}><Toolbar search={search} setSearch={setSearch} placeholder="Найти блюдо…"><Button className="button secondary" onClick={() => open('dish')}><Plus size={17}/>Добавить блюдо</Button></Toolbar><div className="dish-grid">{snapshot.dishes.filter(d => !d.archived && filtered(d.name)).map(d => <article className="panel dish-card" key={d.id}><div className="dish-card-top"><span className="dish-glyph"><UtensilsCrossed/></span><Badge status={d.portions > 0 ? 'green' : 'red'}>{d.portions > 0 ? `${d.portions} порций` : 'Стоп-лист'}</Badge></div><small className="eyebrow">{d.category}</small><h2>{d.name}</h2><ul className="recipe">{d.ingredients.map(i => <li key={i.productId}><span>{productName(i.productId)}</span><strong>{qty(i.quantity, productUnit(i.productId))}</strong></li>)}</ul>{d.shortages.length > 0 && <p className="error-text">Не хватает: {d.shortages.map(x => x.productName).join(', ')}</p>}<div className="dish-card-actions"><Button className="text-button" onClick={()=>open('dish',{...d,id:crypto.randomUUID(),name:d.name+' · новая версия'})}>Новая версия</Button><Button className="text-button destructive" onClick={()=>{if(confirm('Архивировать блюдо? История сохранится.'))change(()=>api('/archive/dishes/'+encodeURIComponent(d.id),'POST'),'Блюдо архивировано');}}>Архивировать</Button><Button className="text-button" onClick={() => open('dish', d)}>Рецептура <Settings2 size={14}/></Button><Button className="button small primary" disabled={!d.portions || pending} onClick={() => open('order', undefined, d.id)}>В заказ <Plus size={15}/></Button></div></article>)}</div>{activeDishes.length === 0 && <Empty text="Добавьте первое блюдо и его ингредиенты"/>}</div>}
          {page==='orders'&&<OrderRequestsView s={snapshot} actorId={session.id} administrator={session.role==='admin'}/>}
          {page === 'orders' && <section className="panel"><PanelTitle title="Журнал заказов" subtitle="Принятые и отклонённые заказы с причинами · сначала последние"/><div className="tabs" role="group" aria-label="Статус в журнале заказов">{[['all','Все записи'],['accepted','Завершённые'],['rejected','Отклонённые']].map(([value,label])=><Button key={value} className={orderLogStatus===value?'selected':''} aria-pressed={orderLogStatus===value} onClick={()=>setOrderLogStatus(value)}>{label}</Button>)}</div><History<Order> key={orderLogStatus} status={orderLogStatus} entity="orders" revision={snapshot.revision} initial={snapshot.orders.filter(o=>orderLogStatus==='all'||o.status===orderLogStatus)} total={snapshot.totals.orders} render={rows => <div className="table-wrap"><Table className="operational-table"><thead><tr><th>Заказ</th><th>Блюда</th><th>Дата</th><th>Статус</th><th>Причины отказа</th></tr></thead><tbody>{rows.map(o => <tr key={o.id}><td><Button className="text-button" onClick={()=>setDetail({entity:'orders',id:o.id})}>#{shortId(o.id)}</Button></td><td>{o.items.map((i,j) => <div key={j}>{dishName(i.dishId)} <strong>× {i.portions}</strong></div>)}</td><td>{date(o.createdAt)}</td><td><Badge status={o.status === 'accepted' ? 'green' : 'red'}>{o.status === 'accepted' ? 'Принят' : 'Отклонён'}</Badge></td><td>{o.status === 'accepted' ? <span className="muted" aria-label="Нет причин отказа">—</span> : o.shortages.length ? o.shortages.map(x => <small className="order-shortage" key={x.productId}>{x.productName}: не хватает {qty(x.missing, x.unit)}</small>) : <span className="muted">Причина отказа не указана</span>}</td></tr>)}</tbody></Table></div>}/></section>}
          {page === 'stop' && <><div className="notice danger"><CircleAlert size={22}/><div><strong>{stop.length ? `${stop.length} блюд временно недоступны` : 'Все блюда доступны'}</strong><p>Проверка на одну порцию. После поставки доступность обновится автоматически.</p></div></div><div className="dish-grid">{stop.map(d => <section className="panel stop-card" key={d.id}><Badge status="red">В стоп-листе</Badge><h2>{d.name}</h2>{d.shortages.map(x => <div className="shortage-detail" key={x.productId}><strong>{x.productName}</strong><span>Нужно {qty(x.requested, x.unit)} · доступно {qty(x.available, x.unit)}</span><b>Дефицит {qty(x.missing, x.unit)}</b></div>)}<div className="stop-actions"><Button className="button primary" onClick={()=>navigate('procurement')}><Truck size={16}/>План закупок</Button><Button className="button secondary" disabled={pending} onClick={() => open('delivery')}><PackagePlus size={17}/>Пополнить склад</Button></div></section>)}</div></>}
          {page === 'offers' && <OffersView s={snapshot} date={date} onDetail={id=>setDetail({entity:'batches',id})} onOrder={items=>{open('order');setOrderPreset(items);}}/>}
          {page === 'analytics' && <AnalyticsView s={snapshot} dishName={dishName} navigate={navigate}/>}
          {page === 'expiry' && <section className="panel"><PanelTitle title="Ближайшие сроки" subtitle="Близкие сроки и просрочка до ручного списания"/><div className="filter-pills"><Button className={expiryFilter==='warning'?'active':''} onClick={()=>setExpiryFilter('warning')}>Истекают скоро</Button><Button className={expiryFilter==='expired'?'active':''} onClick={()=>setExpiryFilter('expired')}>Просрочены</Button></div><History<Batch> key={expiryFilter} entity="batches" status={expiryFilter} revision={snapshot.revision} initial={expiryFilter==='warning'?expiring:[]} total={expiryFilter==='warning'?warningCount:snapshot.totals.expiredBatches??0} emptyText="Нет партий в этой категории" render={rows=><div className="expiry-list">{rows.map(b=><div className={'expiry-entry '+(expiryFilter==='expired'?'expired-stock':'')} key={b.id}><Button className={'stop-preview expiry-row '+(expiryFilter==='expired'?'expired-stock':'')} key={b.id} onClick={()=>setDetail({entity:'batches',id:b.id})}><span className="expiry-product"><strong>{productName(b.productId)}</strong><small>Партия #{shortId(b.id)}</small></span><span><small>Остаток</small><strong>{qty(b.remainingQuantity,productUnit(b.productId))}</strong></span><span><small>Срок годности</small><time dateTime={b.expiresAt}>{date(b.expiresAt)}</time></span><span><small>До истечения</small><strong>{remaining(b.expiresAt)}</strong></span><ChevronRight size={20} aria-hidden="true"/></Button><WriteOffButton batch={b} s={snapshot}/></div>)}</div>}/></section>}
          {page === 'procurement' && <PlanningView s={snapshot} date={date} kind="procurement" demo={session.demo} onDraft={lines=>{if(lines.length){setDeliveryPreset(lines);navigate('procurement-requests');}}}/>}
          {page === 'forecast' && <PlanningView key="forecast" s={snapshot} date={date} kind="forecast" demo={session.demo} onDraft={lines=>{if(lines.length){setDeliveryPreset(lines);navigate('procurement-requests');}}}/>}
          {page === 'generator' && session.role==='admin' && session.demo && <GeneratorView s={snapshot} refresh={refresh} notify={notify}/>}
          <footer className="page-footer"><span><Leaf size={14}/> Флагман · каждый продукт имеет значение</span><span>Единый склад · точные остатки · контроль сроков</span></footer>
        </>}
      </div></main>
    </div>
    {toastMotion.present && visibleToast && <div className="toast-position"><div ref={toastRef} data-phase={toastMotion.phase} className={`toast ${visibleToast.error ? 'error' : ''}`} role="status">{visibleToast.error ? <CircleAlert size={19}/> : <Check size={19}/>}<span>{visibleToast.text}</span><Button disabled={!toast} className="icon-button" aria-label="Закрыть сообщение" onClick={() => setToast(null)}><X size={16}/></Button></div></div>}
    {detail&&<DetailsDialog key={`${detail.entity}:${detail.id}`} s={snapshot!} entity={detail.entity} id={detail.id} onClose={()=>setDetail(null)}/>}
    <WorkflowNotifications role="manager"/>
    {modal && snapshot && <OperationModal key={modalVersion} kind={modal} s={snapshot} editDish={editDish} presetDish={presetDish} orderPreset={orderPreset} deliveryPreset={deliveryPreset} onClose={() => {setModal(null);setPending(!!pendingIntent());}} onDone={text => {notify(text);void refresh();}}/>}
  </div>{loginAgain}</>;
}
const descriptions: Record<string,string> = { 'event-log':'Поставки, заказы, сроки годности и действия сотрудников в одном журнале.', accounts:'Аккаунты, API-ключи и видимость страниц для менеджеров.', stock: 'Остатки по продуктам и партиям. Сроки, которым нужно внимание.', deliveries: 'Принимайте продукты и сохраняйте происхождение каждой партии.', menu: 'Состав блюд и доступные порции по актуальному складу.', orders: 'Все блюда одного заказа проверяются и списываются вместе.', stop: 'Причины недоступности и ингредиенты для пополнения.', offers: 'Помогайте кухне использовать свежие продукты вовремя.', analytics: 'Потери, дефицит, закупки и ожидаемая доступность меню.', expiry: 'Проверьте сроки и используйте продукты вовремя.', procurement: 'Что заказать для следующей смены.', forecast: 'Какие блюда могут стать недоступными и когда.', generator: 'Воспроизводимый поток событий и управляемое время.' };
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

function ManagerDeliveries({s}:{s:Snapshot}){const[page,setPage]=useState(1);const list=useWorkflowResource<PageResult<DeliveryRequest>>('/delivery-requests?size=50&page='+page);return <><DeliveryRequestsList requests={list.data?.items??[]} products={s.products} manager timezone={s.settings.timezone} refresh={list.refresh} pagination={<Pagination page={page} total={list.data?.total??0} size={list.data?.size??50} onPage={setPage}/>}/>{list.error&&<p role="alert">{list.error}</p>}</>;}
