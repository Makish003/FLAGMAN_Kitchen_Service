import {useLayoutEffect,useRef,useState} from 'react';

// A response belongs to the inputs that started it, even when fields remain editable.
export function useCalculation<T>(inputs:unknown[]) {
  const signature=JSON.stringify(inputs);
  const current=useRef(signature),version=useRef(0);
  if(current.current!==signature){current.current=signature;version.current++;}
  const mounted=useRef(false),running=useRef(false);
  const controller=useRef<AbortController|undefined>(undefined);
  const [result,setResult]=useState<T>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  useLayoutEffect(()=>{setResult(undefined);setError('');},[signature]);
  const run=async(calculate:(signal:AbortSignal)=>Promise<T>)=>{
    if(running.current)return;
    running.current=true;setBusy(true);setResult(undefined);setError('');
    const started=version.current,request=new AbortController();controller.current=request;
    try {const value=await calculate(request.signal);if(mounted.current&&version.current===started)setResult(value);}
    catch(e){if(mounted.current&&version.current===started&&!request.signal.aborted)setError((e as Error).message);}
    finally{running.current=false;if(mounted.current)setBusy(false);}
  };
  const invalidate=(clearResult=true)=>{version.current++;setError('');if(clearResult)setResult(undefined);};
  return {result,error,busy,run,invalidate};
}
