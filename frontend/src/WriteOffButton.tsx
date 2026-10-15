import {useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,Dialog} from './components';
import {useDialog} from './motion/useDialog';
import {durableOperation} from './api';
import {qty,shortId} from './format';
import type {Batch,Snapshot} from './types';

export function WriteOffButton({batch,s,onWrittenOff}:{batch:Batch;s:Snapshot;onWrittenOff?:()=>Promise<void>}) {
  const [expanded,setExpanded]=useState(false);
  if(batch.remainingQuantity<=0)return null;
  return <div className="write-off-action"><Button type="button" className="button secondary destructive" onClick={()=>setExpanded(true)}>Списать товар</Button>{expanded&&createPortal(<WriteOffDialog batch={batch} s={s} onWrittenOff={onWrittenOff} onClose={()=>setExpanded(false)}/>,document.body)}</div>;
}

function WriteOffDialog({batch,s,onWrittenOff,onClose}:{batch:Batch;s:Snapshot;onWrittenOff?:()=>Promise<void>;onClose:()=>void}) {
  const [busy,setBusy]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState('');
  const {ref,phase,closing,requestClose}=useDialog(onClose,busy);
  const titleId=useId();
  const product=s.products.find(p=>p.id===batch.productId);
  return <Dialog ref={ref} data-phase={phase} className="operation-modal workflow-modal" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();e.stopPropagation();requestClose();}}>
    <div className="modal-header"><h2 id={titleId}>Списать товар</h2><Button type="button" className="button secondary" disabled={busy||closing} onClick={()=>requestClose()}>Закрыть</Button></div>
    <div className="modal-body">
      <p>Списать весь остаток: {product?.name??batch.productId}, партия #{shortId(batch.id)} — <strong>{qty(batch.remainingQuantity,product?.unit??'')}</strong>.</p>
      <label>Причина списания<textarea className="rejection-comment" required autoFocus disabled={busy||closing} rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error&&<p role="alert">{error}</p>}
    </div>
    <div className="modal-footer"><Button type="button" className="button secondary" disabled={busy||closing} onClick={()=>requestClose()}>Отмена</Button><Button type="button" className="button primary destructive" disabled={busy||closing||!reason.trim()} onClick={async()=>{
      if(busy||!reason.trim())return;
      setBusy(true);setError('');
      try {
        await durableOperation('/batches/'+encodeURIComponent(batch.id)+'/write-off',{reason:reason.trim()},crypto.randomUUID());
        requestClose(true);await onWrittenOff?.();
      } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
    }}>{busy?'Списываем…':'Подтвердить списание'}</Button></div>
  </Dialog>;
}
