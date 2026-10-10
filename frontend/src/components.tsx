import React, {useState,useEffect,useRef,useId} from 'react';
import { Activity, ArrowDownLeft, ArrowRight, BarChart3, Bell, Boxes, Check, ChevronLeft, ChevronRight, Clock3, ChevronDown, Flame, LayoutDashboard, Leaf, LogOut, Menu, PackagePlus, Plus, Search, Settings2, ShieldCheck, ShoppingBasket, SlidersHorizontal, Truck, UtensilsCrossed, X, CircleAlert, Radio, Play, Square, TrendingUp } from 'lucide-react';
import {api} from './api';
export function Button(props:React.ComponentProps<'button'>) { return <button {...props}/>; }
export function Input(props:React.ComponentProps<'input'>) { return <input {...props}/>; }
export function Combobox({children,value,onChange,disabled,required,...props}:React.ComponentProps<'select'>) {
  const options = React.Children.toArray(children).filter(React.isValidElement).map(child => {
    const option = child as React.ReactElement<React.ComponentProps<'option'>>;
    return {value:String(option.props.value ?? ''),label:React.Children.toArray(option.props.children).join(''),disabled:!!option.props.disabled};
  });
  const selected=options.findIndex(o=>o.value===String(value));
  const [expanded,setExpanded]=useState(false); const [active,setActive]=useState(Math.max(0,selected));
  const [label,setLabel]=useState(props['aria-label']);const input=useRef<HTMLInputElement>(null);const container=useRef<HTMLSpanElement>(null);const id=useId();const typed=useRef({text:'',at:0});
  useEffect(()=>{const parent=input.current?.closest('label');if(parent&&!props['aria-label'])setLabel([...parent.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim());},[props['aria-label']]);
  useEffect(()=>{if(!expanded)return;const close=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node))setExpanded(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[expanded]);
  useEffect(()=>{if(expanded)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[expanded,active,id]);
  const choose=(index:number)=>{const option=options[index];if(!option||option.disabled)return;onChange?.({target:{value:option.value},currentTarget:{value:option.value}} as React.ChangeEvent<HTMLSelectElement>);setExpanded(false);input.current?.focus();};
  const open=()=>{if(disabled)return;setActive(Math.max(0,selected));setExpanded(true);};
  const move=(direction:number)=>{let index=active;for(let i=0;i<options.length;i++){index=(index+direction+options.length)%options.length;if(!options[index].disabled){setActive(index);break;}}};
  return <span className="select-control" ref={container}><input ref={input} id={props.id} name={props.name} role="combobox" aria-label={label} aria-required={required} aria-expanded={expanded} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-activedescendant={expanded?`${id}-${active}`:undefined} readOnly disabled={disabled} value={options[selected]?.label??'Выберите значение'} onClick={()=>expanded?setExpanded(false):open()} onBlur={()=>setExpanded(false)} onKeyDown={e=>{
    if(e.key==='Escape'&&expanded){e.preventDefault();e.stopPropagation();setExpanded(false);}
    else if(e.key==='Tab')setExpanded(false);
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();expanded?choose(active):open();}
    else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!expanded)open();else if(e.key==='Home')setActive(options.findIndex(o=>!o.disabled));else if(e.key==='End')setActive(options.length-1-[...options].reverse().findIndex(o=>!o.disabled));else move(e.key==='ArrowDown'?1:-1);}
    else if(e.key.length===1){e.preventDefault();const now=Date.now();typed.current={text:(now-typed.current.at<700?typed.current.text:'')+e.key.toLocaleLowerCase('ru'),at:now};const index=options.findIndex(o=>!o.disabled&&o.label.toLocaleLowerCase('ru').startsWith(typed.current.text));if(index>=0){setExpanded(true);setActive(index);}}
  }}/><ChevronDown size={18} aria-hidden="true"/>{expanded&&<span id={`${id}-list`} role="listbox" aria-label={label} className="select-options">{options.map((option,index)=><span key={option.value} id={`${id}-${index}`} role="option" data-value={option.value} aria-selected={index===selected} aria-disabled={option.disabled||undefined} className={index===active?'highlighted':''} onPointerDown={e=>e.preventDefault()} onPointerMove={()=>setActive(index)} onClick={()=>choose(index)}>{option.label}{index===selected&&<Check size={16} aria-hidden="true"/>}</span>)}</span>}</span>;
}
export function Table(props:React.ComponentProps<'table'>) { return <table {...props}/>; }
export const Dialog=React.forwardRef<HTMLDialogElement,React.ComponentProps<'dialog'>>((props,ref)=><dialog ref={ref} {...props}/>);
export function LoadingState({text='Загружаем…'}:{text?:string}) { return <div className="skeleton" role="status"><Activity className="spin"/>{text}</div>; }
export function ErrorState({text,retry}:{text:string;retry?:()=>void}) { return <div className="notice danger" role="alert">{text}{retry&&<Button onClick={retry}>Повторить</Button>}</div>; }
export function Pagination({page,total,size,onPage}:{page:number;total:number;size:number;onPage:(page:number)=>void}) {
  return <div className="pagination"><span>{total} записей · страница {page} из {Math.max(1,Math.ceil(total/size))}</span><div><Button className="icon-button" disabled={page===1} aria-label="Предыдущая страница" onClick={()=>onPage(page-1)}><ChevronLeft size={18}/></Button><Button className="icon-button" disabled={page*size>=total} aria-label="Следующая страница" onClick={()=>onPage(page+1)}><ChevronRight size={18}/></Button></div></div>;
}
export function Badge({ status, children }: { status: string; children: React.ReactNode }) { return <span className={`badge ${status}`}>{children}</span>; }
export function Empty({ text, action }: {text: string; action?: React.ReactNode}) { return <div className="empty"><Boxes size={32}/><p>{text}</p>{action}</div>; }
export function Metric({icon,label,value,detail,tone}: {icon:React.ReactNode;label:string;value:number;detail:string;tone:string}) { return <article className="metric"><div className="metric-head"><span>{label}</span><i className={tone}>{icon}</i></div><strong>{value}</strong><small>{detail}</small></article>; }
export function PanelTitle({icon,title,subtitle,action}: {icon?:React.ReactNode;title:string;subtitle?:string;action?:React.ReactNode}) { return <div className="panel-title"><div><h2>{icon}{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>; }
export function Toolbar({search,setSearch,placeholder,children}: {search:string;setSearch:(v:string)=>void;placeholder:string;children?:React.ReactNode}) { return <div className="toolbar"><label className="search"><Search size={18}/><input aria-label={placeholder} placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)}/></label><div>{children}</div></div>; }
export function History<T>({entity,revision,initial,total,render}: {entity:string;revision:number;initial:T[];total:number;render:(rows:T[])=>React.ReactNode}) {
  const [query,setQuery]=useState('');const [count,setCount]=useState(total); const [page,setPage] = useState(1); const [rows,setRows] = useState(initial.slice(0,20)); const [error,setError] = useState('');
  useEffect(() => { let active = true; api<{items:T[];total:number}>(`/history/${entity}?page=${page}&size=20&q=${encodeURIComponent(query)}`).then(r => {if(active) {setRows(r.items); setCount(r.total); setError('');}}).catch(e => {if(active)setError(e.message);}); return () => {active=false;}; },[entity,revision,page,query]);
  return <><div className="history-toolbar"><label className="search"><Search size={18} aria-hidden="true"/><Input aria-label="Поиск по всей истории" placeholder="Поиск по всей истории…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label></div>{error && <p className="error-text" role="alert">{error}</p>}{rows.length ? render(rows) : <Empty text="В журнале пока нет записей"/>}<Pagination page={page} total={count} size={20} onPage={setPage}/></>;
}
