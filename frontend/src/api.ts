export class ApiError extends Error {
  constructor(message: string, public status: number, public uncertain = false) { super(message); }
}
type Pending = { path: string; key: string; body: unknown };
const storageKey = 'flagman.pending.v1';
export const pendingIntent = (): Pending | null => {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null'); } catch { return {path:'invalid',key:'invalid',body:null}; }
};
export const clearPending = () => localStorage.removeItem(storageKey);
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
  const old = pendingIntent();
  if (old && (old.path !== path || old.key !== key || JSON.stringify(old.body) !== JSON.stringify(body))) throw new Error('Сначала восстановите результат предыдущей операции. Её состав и ключ сохранены.');
  localStorage.setItem(storageKey, JSON.stringify({ path, body, key }));
  try { const result = await api<T>(path, 'POST', body, key); clearPending(); return result; }
  catch (error) { if (error instanceof ApiError && !error.uncertain && [400,403,409,413,415,422,429].includes(error.status)) clearPending(); throw error; }
}
export async function recoverPending(): Promise<any> {
  const intent = pendingIntent(); if (!intent) return;
  if (!['/orders','/deliveries'].includes(intent.path) || typeof intent.key !== 'string' || !intent.body) throw new Error('Не удалось прочитать незавершённую операцию. Проверьте журнал с администратором перед выходом.');
  const scope = intent.path === '/orders' ? 'order' : 'delivery';
  try { const result = await api(`/operations/${scope}/${encodeURIComponent(intent.key)}`); clearPending(); return result; }
  catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
  return durableOperation(intent.path, intent.body, intent.key);
}
