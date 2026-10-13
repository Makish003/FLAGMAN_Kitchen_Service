import {useLayoutEffect,useRef,useState} from 'react';
import {BarChart3} from 'lucide-react';
import {Button,PanelTitle} from './components';
import {counted,number} from './format';
import type {Analytics} from './types';

export function OrdersChart({analytics,compact=false,selectedDays,onSelectDays}:{analytics:Analytics;compact?:boolean;selectedDays?:string[]|null;onSelectDays?:(days:string[]|null)=>void}) {
  const days=analytics.daily;
  const [localDays,setLocalDays]=useState<string[]|null>(null);
  const selection=onSelectDays?selectedDays??null:localDays;
  const plot=useRef<HTMLDivElement>(null);
  const [plotWidth,setPlotWidth]=useState(560);
  const [anchor,setAnchor]=useState('');
  const [rangeMode,setRangeMode]=useState(false),[rangeStart,setRangeStart]=useState('');
  const isSelected=(day:string)=>selection===null||selection.includes(day);
  const changeSelection=onSelectDays??setLocalDays;
  useLayoutEffect(()=>{
    const element=plot.current;
    if(!element)return;
    setPlotWidth(element.getBoundingClientRect().width);
    const observer=new ResizeObserver(entries=>setPlotWidth(entries[0].contentRect.width));
    observer.observe(element);
    return()=>observer.disconnect();
  },[days.length]);
  function select(day:string,range=false){
    const next=new Set(selection??[]);
    if(rangeMode&&!rangeStart){
      next.add(day);setRangeStart(day);setAnchor(day);changeSelection([...next].sort());return;
    }
    const from=rangeMode?rangeStart:anchor;
    if((rangeMode||range)&&from&&days.some(d=>d.day===from)){
      const start=from<day?from:day,end=from<day?day:from;
      days.filter(d=>d.day>=start&&d.day<=end).forEach(d=>next.add(d.day));
      if(rangeMode){setRangeMode(false);setRangeStart('');}
    }else{if(next.has(day))next.delete(day);else next.add(day);setAnchor(day);}
    changeSelection([...next].sort());
  }
  const chosen=days.filter(d=>isSelected(d.day));
  const max=Math.max(1,...days.flatMap(d=>[d.accepted,d.rejected]));
  const ceiling=Math.max(2,Math.ceil(max/Math.pow(10,Math.floor(Math.log10(max))))*Math.pow(10,Math.floor(Math.log10(max))));
  const width=Math.max(1,plotWidth),left=36,right=16,top=16,bottom=172;
  const x=(i:number)=>days.length===1?(width+left-right)/2:left+i*(width-left-right)/(days.length-1);
  const y=(value:number)=>bottom-value/ceiling*(bottom-top);
  const points=(kind:'accepted'|'rejected')=>days.map((d,i)=>x(i)+','+y(d[kind])).join(' ');
  const label=(d:typeof days[number])=>d.day+': '+d.accepted+' принято, '+d.rejected+' отклонено';
  return <section className="report-section chart-panel"><PanelTitle title="Заказы по дням" subtitle={rangeMode?(rangeStart?'Теперь выберите последний день диапазона':'Выберите первый день диапазона'):compact?'Последние '+counted(days.length,'день','дня','дней'):'Клик — выбор дня · Shift + клик — диапазон'}/>
    <div className="chart-selection-tools"><Button className="button secondary" onClick={()=>{setAnchor('');setRangeMode(false);setRangeStart('');changeSelection(null);}}>Все дни</Button><Button className="button secondary" onClick={()=>{setAnchor('');setRangeMode(false);setRangeStart('');changeSelection([]);}}>Снять выделение</Button><Button className="button secondary" aria-label="Выбрать диапазон" aria-pressed={rangeMode} onClick={()=>{setRangeMode(!rangeMode);setRangeStart('');}}>Диапазон</Button></div>
    {days.length>0?<><div className="chart-legend"><span><i className="green-dot"/>Принято</span><span><i className="red-dot"/>Отклонено</span></div>
      <div className="chart" tabIndex={0} role="region" aria-label="Заказы по дням"><div ref={plot} className="orders-plot" style={{minWidth:Math.max(280,days.length*44+48)}}>
        <svg className="orders-lines" viewBox={'0 0 '+width+' 194'} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Выбор дней на графике">
          {[0,ceiling/2,ceiling].map(tick=><g key={tick}><line className="orders-gridline" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="orders-axis" x={0} y={y(tick)+4}>{number(tick)}</text></g>)}
          {days.map((d,i)=>isSelected(d.day)&&<line key={d.day} className="orders-selection" x1={x(i)} x2={x(i)} y1={top} y2={bottom}/>)}
          <polyline className="orders-line accepted" points={points('accepted')}/><polyline className="orders-line rejected" points={points('rejected')}/>
          {days.map((d,i)=><g key={d.day} className={'orders-day'+(isSelected(d.day)?' selected':'')} data-day={d.day} data-accepted={d.accepted} data-rejected={d.rejected} role="button" tabIndex={0} aria-label={label(d)} aria-pressed={!!isSelected(d.day)} onClick={e=>select(d.day,e.shiftKey)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(d.day,e.shiftKey);}}}><title>{label(d)}</title>{(['accepted','rejected'] as const).map(kind=><g key={kind}><circle className="orders-hit" cx={x(i)} cy={y(d[kind])} r={12}/><circle className={'orders-point '+kind} cx={x(i)} cy={y(d[kind])} r={isSelected(d.day)?5:3}/></g>)}</g>)}
        </svg><div className="chart-dates">{days.map((d,i)=><Button className="chart-column" style={{left:x(i)/width*100+'%'}} key={d.day} aria-pressed={!!isSelected(d.day)} aria-label={label(d)} onClick={e=>select(d.day,e.shiftKey)}><b>{d.accepted+d.rejected}</b><small>{d.day.slice(8,10)}.{d.day.slice(5,7)}<br/>{d.day.slice(0,4)}</small></Button>)}</div>
      </div></div>
      <div className="chart-readout" aria-live="polite"><span>{chosen.length===1?chosen[0].day.split('-').reverse().join('.'):counted(chosen.length,'день','дня','дней')}</span><span className="green-text"><strong>{number(chosen.reduce((sum,d)=>sum+d.accepted,0))}</strong> принято</span><span className="error-text"><strong>{number(chosen.reduce((sum,d)=>sum+d.rejected,0))}</strong> отклонено</span></div>
    </>:<div className="report-empty"><BarChart3 size={28}/><div><strong>За выбранный период заказов нет</strong><p>Нет принятых или отклонённых заказов.</p></div></div>}
  </section>;
}
