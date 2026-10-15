const fs=require('fs');
fs.writeFileSync('frontend/src/OrderCardGrid.tsx',`import {Children,useLayoutEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';

// Distribute successive orders left to right; each column keeps its own vertical flow.
export function OrderCardGrid({children}:{children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 const [columns,setColumns]=useState(1);
 useLayoutEffect(()=>{
  const element=ref.current;
  if(!element)return;
  const resize=()=>{
   const gap=parseFloat(getComputedStyle(element).columnGap)||0;
   const minWidth=24*parseFloat(getComputedStyle(document.documentElement).fontSize);
   setColumns(Math.max(1,Math.min(3,Math.floor((element.clientWidth+gap)/(minWidth+gap)))));
  };
  resize();
  const observer=new ResizeObserver(resize);
  observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 const cards=Children.toArray(children);
 return <div ref={ref} className="order-request-grid" style={{gridTemplateColumns:'repeat('+columns+',minmax(0,1fr))'}}>
  {Array.from({length:columns},(_,column)=><div className="order-request-column" key={column}>{cards.filter((_,index)=>index%columns===column)}</div>)}
 </div>;
}

export function newestFirst<T extends {createdAt?:string}>(items:readonly T[]):T[]{
 const timestamp=(item:T)=>{const time=Date.parse(item.createdAt??'');return Number.isFinite(time)?time:0;};
 return [...items].sort((a,b)=>timestamp(b)-timestamp(a));
}
`);
for(const p of ['frontend/src/WaiterView.tsx','frontend/src/OrderRequestsView.tsx']){
 let s=fs.readFileSync(p,'utf8');s="import {OrderCardGrid,newestFirst} from './OrderCardGrid';\n"+s;
 s=s.replace('<div className="order-request-grid">','<OrderCardGrid>');
 if(p.includes('WaiterView')){s=s.replace('history.data?.items.map(o=>','newestFirst(history.data?.items??[]).map(o=>');s=s.replace('\n </div>','\n </OrderCardGrid>');}
 else{s=s.replace('orderGroups.flatMap(([value])=>list.data?.items.filter(o=>o.status===value)??[]).map(o=>','newestFirst(list.data?.items??[]).map(o=>');s=s.replace('</>:undefined}/>)}</div>','</>:undefined}/>)}</OrderCardGrid>');s=s.replace('Ожидающие заказы — сначала самые ранние, завершённые — сначала последние.','Новые заказы — слева, более ранние — справа.');}
 fs.writeFileSync(p,s);
}
const css='frontend/src/styles.scss';let s=fs.readFileSync(css,'utf8');s=s.replace('.order-request-grid { columns: 24rem 3; column-gap: var(--space-4); }','.order-request-grid { display: grid; gap: var(--space-4); align-items: start; }\n.order-request-column { min-width: 0; display: flow-root; }\n.order-request-column > .order-request-card:last-child { margin-bottom: 0; }');fs.writeFileSync(css,s);
const api='backend/WorkflowEndpoints.cs';s=fs.readFileSync(api,'utf8');const a=s.indexOf('  // Sort before pagination:');const b=s.indexOf('  return List(rows.Select',a);if(a<0||b<0)throw Error('Sort block not found');s=s.slice(0,a)+'  // Keep chronological order consistent across roles and pagination.\n  rows=rows.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id);\n'+s.slice(b);fs.writeFileSync(api,s);
