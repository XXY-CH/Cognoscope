/**
 * useMonitorStatus - 轮询 Python monitor 检测状态（无浏览器摄像头）
 * 所属：E · 阅读界面顶栏 / 底栏状态指示
 * 摄像头由 monitor/server.py 打开，前端只读状态
 */
import { useEffect, useState } from 'react';
import { getDetectionStatus } from '../utils/monitorApi';

export type MonitorUiStatus = 'running' | 'idle' | 'offline';

/**
 * 每隔 intervalMs 查询 /api/detect/status
 * @param enabled - 为 false 时不轮询（例如组件未挂载到阅读页）
 */
export function useMonitorStatus(
  enabled = true,
  intervalMs = 2000,
): MonitorUiStatus {
  const [status, setStatus] = useState<MonitorUiStatus>('idle');

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const tick = async () => {
      const s = await getDetectionStatus();
      if (cancelled) return;
      if (!s.reachable) {
        setStatus('offline');
        return;
      }
      setStatus(s.running ? 'running' : 'idle');
    };

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);

  return status;
}
