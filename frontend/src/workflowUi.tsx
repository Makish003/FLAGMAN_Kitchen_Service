import {Badge} from './components';
import {workflowStatus} from './workflowHooks';

export function WorkflowStatus({status,order=false}:{status:string;order?:boolean}) {
  const tone=status==='submitted'||status==='partially_accepted'?'amber':status==='accepted'||status==='ready'||status==='served'?'green':status==='rejected'?'red':'neutral';
  return <Badge status={tone}>{order&&status==='submitted'?'Ожидает приготовления':workflowStatus(status)}</Badge>;
}
