/**
 * useNetworkStatus - 监听 online/offline，同步到 uiStore
 * 所属：全局；§14.1 网络状态指示
 * 规范参考：UI_spec.md §14
 */
import { useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';

/**
 * 在 App 根或 AppShell 挂载一次即可；恢复在线时不弹 toast（§14.1）
 */
export function useNetworkStatus(): void {
  const setOnline = useUiStore((s) => s.setOnline);

  useEffect(() => {
    // 首屏以 navigator.onLine 为准（可能偶发不准，事件会纠正）
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOnline]);
}
