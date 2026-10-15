import {Badge} from './components';
import {workflowStatus} from './workflowHooks';

export function WorkflowStatus({status}:{status:string}) {
  const tone=status==='submitted'||status==='partially_accepted'?'amber':status==='accepted'?'green':status==='rejected'?'red':'neutral';
  return <Badge status={tone}>{workflowStatus(status)}</Badge>;
}
