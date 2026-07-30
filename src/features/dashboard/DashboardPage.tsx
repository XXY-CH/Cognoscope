/**
 * DashboardPage - 个人仪表盘主页面
 * 所属页面：B · 个人仪表盘
 * 规范参考：UI_spec.md §5；HANDOFF.md；分析对齐 monitor/analyze.py
 */
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  selectFilteredAnalyses,
  selectFilteredSessions,
  useSessionStore,
} from '../../stores/sessionStore';
import { FocusSessionList } from './FocusSessionList';
import { MetricCards } from './MetricCards';
import { ReadingHeatmap } from './ReadingHeatmap';
import styles from './DashboardPage.module.css';

/**
 * DashboardPage - 指标卡 → 热力图 → 专注会话（analyze.py 六维）
 */
export function DashboardPage() {
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const loadMonitorAnalyses = useSessionStore((s) => s.loadMonitorAnalyses);
  const status = useSessionStore((s) => s.status);
  const monitorStatus = useSessionStore((s) => s.monitorStatus);
  const range = useSessionStore((s) => s.range);
  const setRange = useSessionStore((s) => s.setRange);

  const sessions = useSessionStore(
    useShallow((s) => selectFilteredSessions(s)),
  );
  const allSessions = useSessionStore(useShallow((s) => s.sessions));
  const monitorMetas = useSessionStore(useShallow((s) => s.monitorMetas));
  const analyses = useSessionStore(
    useShallow((s) => selectFilteredAnalyses(s)),
  );

  useEffect(() => {
    void loadSessions();
    void loadMonitorAnalyses();
  }, [loadSessions, loadMonitorAnalyses]);

  if (status === 'loading' && sessions.length === 0 && allSessions.length === 0) {
    return (
      <div className={styles.root}>
        <p className={styles.status} role="status" aria-live="polite">
          加载仪表盘…
        </p>
      </div>
    );
  }

  if (status === 'error' && allSessions.length === 0 && analyses.length === 0) {
    return (
      <div className={styles.root}>
        <p className={styles.status} role="alert">
          会话数据加载失败，请刷新重试
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <MetricCards sessions={sessions} />
      <ReadingHeatmap sessions={allSessions} monitorMetas={monitorMetas} />
      <FocusSessionList
        analyses={analyses}
        range={range}
        monitorStatus={monitorStatus}
        onRangeChange={setRange}
      />
    </div>
  );
}
