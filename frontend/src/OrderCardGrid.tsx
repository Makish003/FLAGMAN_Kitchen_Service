import {Children,useLayoutEffect,useRef,useState} from 'react';
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
