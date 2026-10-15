export class ApiError extends Error {
  constructor(message: string, public status: number, public uncertain = false) { super(message); }
}
type Pending = { actorId:string; path: string; key: string; body: unknown };
let actorId='',actorRole='';
export const setApiActor=(id:string,role='')=>{actorId=id;actorRole=role;};
const storageKey = (id=actorId,role=actorRole) => 'flagman.pending.v2.'+id+'.'+role;
export const pendingIntent = (): Pending | null => {
  try { return JSON.parse(localStorage.getItem(storageKey()) ?? 'null'); } catch { return {actorId,path:'invalid',key:'invalid',body:null}; }
};
const clearStoredIntent=(storage:string,key:string)=>{try{if(JSON.parse(localStorage.getItem(storage)??'null')?.key===key)localStorage.removeItem(storage);}catch{}};
export const clearPending = () => localStorage.removeItem(storageKey());
export async function api<T>(path: string, method = 'GET', body?: unknown, key?: string, signal?: AbortSignal): Promise<T> {
  const writing = method !== 'GET';
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetch('/api' + path, { method, signal: controller.signal, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Flagman', ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text(); let result: any = null;
      try { result = text ? JSON.parse(text) : null; } catch { throw new ApiError('Сервер вернул непонятный ответ. ' + (writing ? 'Проверьте результат операции.' : 'Повторите загрузку.'), response.status, writing); }
      if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('flagman:unauthorized'));
      if (!response.ok && !(response.status === 422 && result?.status === 'rejected')) {
        const message = response.status === 429 ? `Слишком много запросов. Повторите через ${response.headers.get('Retry-After') ?? '60'} с.` : result?.error ?? (response.status === 401 ? 'Сессия истекла. Войдите снова.' : 'Не удалось выполнить запрос');
        throw new ApiError(message + (result?.requestId ? ` Код: ${result.requestId}` : ''), response.status, writing && response.status >= 500);
      }
      if (writing && key && !result) throw new ApiError('Ответ операции пуст. Проверьте её результат.', response.status, true);
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!writing && attempt < 2 && (!(error instanceof ApiError) || error.status >= 500)) continue;
      if (error instanceof ApiError) throw error;
      throw new ApiError(writing ? 'Связь прервана. Результат операции неизвестен; восстановите его с прежним ключом.' : 'Нет связи с сервером. Повторите загрузку.', 0, writing);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
export async function durableOperation<T>(path: string, body: unknown, key: string): Promise<T> {
  if(!actorId)throw new Error("Сначала войдите в аккаунт");
  const capturedActor=actorId,capturedRole=actorRole,operationStorage=storageKey(capturedActor,capturedRole);
  const old = pendingIntent();
  if (old && (old.path !== path || old.key !== key || JSON.stringify(old.body) !== JSON.stringify(body))) throw new Error('Сначала восстановите результат предыдущей операции. Её состав и ключ сохранены.');
  localStorage.setItem(operationStorage, JSON.stringify({ actorId:capturedActor, path, body, key }));
  try { const result = await api<T>(path, 'POST', body, key); clearStoredIntent(operationStorage,key); return result; }
  catch (error) { if (error instanceof ApiError && !error.uncertain && [400,403,409,413,415,422,429].includes(error.status)) clearStoredIntent(operationStorage,key); throw error; }
}
export async function recoverPending(): Promise<any> {
  const capturedActor=actorId,capturedRole=actorRole,operationStorage=storageKey();
  const intent = pendingIntent(); if (!intent) return;
  if (intent.actorId!==actorId || !operationScope(intent.path) || typeof intent.key !== 'string' || !intent.body) throw new Error('Не удалось прочитать незавершённую операцию. Проверьте журнал с администратором перед выходом.');
  const scope = operationScope(intent.path);
  try { const result = await api(`/operations/${scope}/${encodeURIComponent(intent.key)}`); clearStoredIntent(operationStorage,intent.key); return result; }
  catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
  if(actorId!==capturedActor||actorRole!==capturedRole)throw new Error("Аккаунт изменился во время восстановления");
  return durableOperation(intent.path, intent.body, intent.key);
}

function operationScope(path:string){if(['/orders','/order-requests'].includes(path))return 'order';if(['/deliveries','/delivery-requests'].includes(path))return 'delivery';if(path==='/procurement-requests')return 'procurement';return ({'supplier-response':'procurement-response','cancel':'procurement-cancel','acceptance':'delivery-acceptance','decision':'order-decision','write-off':'write-off'} as Record<string,string>)[path.split('/').at(-1)??''];}
