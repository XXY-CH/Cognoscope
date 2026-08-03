/**
 * sourceInvalidationEvents - 文件生命周期完成后通知内存投影刷新。
 * 仅传递来源 id，不承载或复制任何证据事实。
 */
type SourceInvalidationListener = (fileIds: string[]) => void;

const listeners = new Set<SourceInvalidationListener>();
const CHANNEL_NAME = 'xuesen-source-invalidation';
let channel: BroadcastChannel | null = null;

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

function notify(fileIds: string[]): void {
  if (fileIds.length === 0) return;
  for (const listener of listeners) listener(fileIds);
}

function ensureChannel(): void {
  if (
    channel ||
    typeof window === 'undefined' ||
    typeof BroadcastChannel === 'undefined'
  ) {
    return;
  }
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    notify(normalizeIds(event.data));
  });
}

export function subscribeSourceInvalidation(
  listener: SourceInvalidationListener,
): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSourceInvalidation(fileIds: string[]): void {
  const ids = normalizeIds(fileIds);
  if (ids.length === 0) return;
  ensureChannel();
  notify(ids);
  channel?.postMessage(ids);
}
