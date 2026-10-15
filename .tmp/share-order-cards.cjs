const fs=require('fs');
const p='frontend/src/WaiterView.tsx';let s=fs.readFileSync(p,'utf8');const start=s.indexOf('  {history.data?.items.map(o=>');const end=s.indexOf('\n </div>',start);
let card=s.slice(start,end);let body=card.slice(card.indexOf('<article'),card.lastIndexOf('</article>')+10);
body=body.replace(' key={o.id}','');const a=body.indexOf("   {o.status==='ready'");body=body.slice(0,a)+`   {actions&&<footer className="waiter-order-actions">{actions}</footer>}\n  </article>`;
body=body.replace('   <div className="waiter-order-summary">',`   {(o.authorName||o.createdAt)&&<div className="order-request-meta">{o.authorName&&<span>Официант: <strong>{o.authorName}</strong></span>}{o.createdAt&&<time dateTime={o.createdAt}>{new Date(o.createdAt).toLocaleString('ru-RU',{timeZone:timezone})}</time>}</div>}\n   <div className="waiter-order-summary">`);
fs.writeFileSync('frontend/src/OrderRequestCard.tsx',`import type {ReactNode} from 'react';\nimport {number,qty} from './format';\nimport {WorkflowStatus} from './workflowUi';\nimport type {OrderRequest} from './workflowTypes';\n\nexport function OrderRequestCard({order:o,dishes=[],timezone='Europe/Moscow',actions}:{order:OrderRequest;dishes?:{id:string;name:string}[];timezone?:string;actions?:ReactNode}){\n return ${body};\n}\n`);
s=s.slice(0,start)+`  {history.data?.items.map(o=><OrderRequestCard key={o.id} order={o} dishes={dishes} actions={o.status==='ready'?<Button className="button primary" disabled={busy} onClick={()=>run('/order-requests/'+o.id+'/serve',{expectedVersion:o.version})}>Подтвердить выдачу</Button>:undefined}/>)} `+s.slice(end);
s=s.replace("import {number,qty} from './format';\nimport {WorkflowStatus} from './workflowUi';","import {OrderRequestCard} from './OrderRequestCard';");fs.writeFileSync(p,s);
const q='frontend/src/OrderRequestsView.tsx';s=fs.readFileSync(q,'utf8').replace("import {qty} from './format';\nimport {WorkflowStatus} from './workflowUi';","import {OrderRequestCard} from './OrderRequestCard';");const begin=s.indexOf('   {items.map(o=>');const finish=s.indexOf('</section>;})}',begin);
s=s.slice(0,begin)+`   <div className="waiter-orders">{items.map(o=><OrderRequestCard key={o.id} order={o} dishes={dishes} timezone={timezone} actions={<>
    {!kitchen&&o.status==='ready'&&(administrator||o.authorId===actorId)&&<Button className="button primary" disabled={busy} onClick={()=>run('/order-requests/'+o.id+'/serve',{expectedVersion:o.version})}>Подтвердить выдачу</Button>}
    {(kitchen||administrator)&&o.status==='submitted'&&<>
     <Button className="button secondary" disabled={busy} onClick={()=>setSelected(o)}>Отклонить заказ</Button>
     <Button className="button primary" disabled={busy} onClick={()=>run('/order-requests/'+o.id+'/decision',{expectedVersion:o.version,decision:'accept'})}>Готово</Button>
    </>}
   </>}/> )}</div>`+s.slice(finish);
// Avoid an empty footer for orders without permitted actions.
s=s.replace('actions={<>','actions={(!kitchen&&o.status===\'ready\'&&(administrator||o.authorId===actorId)||(kitchen||administrator)&&o.status===\'submitted\')?< >').replace('</>}/> )}', '</>:undefined}/> )}');
fs.writeFileSync(q,s);
const files=[p,q,'frontend/src/OrderRequestCard.tsx','frontend/src/styles.scss'];for(const f of files){s=fs.readFileSync(f,'utf8').replaceAll('waiter-orders','order-request-grid').replaceAll('waiter-order-','order-request-');fs.writeFileSync(f,s);}
s=fs.readFileSync('frontend/src/styles.scss','utf8').replace('.order-request-actions { display: flex; justify-content: flex-end;','.order-request-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: flex-end;');s+='\n.order-request-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4) 0; color: var(--semantic-text-secondary); font-size: var(--type-small); overflow-wrap: anywhere; }\n.order-request-meta > * { min-width: 0; }\n';fs.writeFileSync('frontend/src/styles.scss',s);
