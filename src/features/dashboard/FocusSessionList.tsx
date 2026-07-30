/**
 * FocusSessionList - 按时间顺序的阅读会话列表（实时数据）
 * 所属页面：B · 个人仪表盘
 */
import { useEffect } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import {
  activeDistractions,
  DISTRACTION_LABELS,
  formatDurationHms,
  formatLines,
  type SessionRange,
} from '../../utils/dashboardMetrics';
import type { DistractionKind, ReadingSession } from '../../types';
import styles from './FocusSessionList.module.css';

function avgFocus(session: ReadingSession): number {
  const samples = session.focusSamples;
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((s, x) => s + x.value, 0) / samples.length);
}

function distractionSummary(session: ReadingSession): string {
  const active = activeDistractions(session.distractions);
  if (active.length === 0) return '—';
  const byKind = new Map<DistractionKind, number>();
  for (const d of active) {
    byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);
  }
  return [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${DISTRACTION_LABELS[k]}×${c}`)
    .join(' · ');
}

function timeRange(session: ReadingSession): string {
  const start = new Date(session.startedAt);
  const end = session.endedAt ? new Date(session.endedAt) : null;
  const dateStr = `${start.getMonth() + 1}/${start.getDate()}`;
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  if (!end) return `${dateStr} ${startTime} — 进行中`;
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${dateStr} ${startTime} — ${endTime}`;
}

/** FocusSessionList - 从 sessionStore 读取真实会话数据 */
export function FocusSessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const status = useSessionStore((s) => s.status);
  const range = useSessionStore((s) => s.range);
  const setRange = useSessionStore((s) => s.setRange);

  useEffect(() => {
    if (status === 'idle') void loadSessions();
  }, [status, loadSessions]);

  const ranges: { key: SessionRange; label: string }[] = [
    { key: 'recent7', label: '近 7 天' },
    { key: 'month', label: '近 30 天' },
    { key: 'all', label: '全部' },
  ];

  if (sessions.length === 0) {
    return (
      <section className={styles.root} aria-label="专注会话">
        <div className={styles.header}>
          <h2 className={styles.title}>专注会话</h2>
          <p className={styles.subtitle}>暂无会话数据，打开论文开始阅读</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-label="专注会话指标">
      <div className={styles.header}>
        <h2 className={styles.title}>专注会话</h2>
        <nav className={styles.rangeTabs} aria-label="时间范围">
          {ranges.map((r) => (
            <button
              key={r.key}
              className={range === r.key ? styles.rangeActive : styles.rangeTab}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </nav>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">会话时间</th>
              <th scope="col">时长</th>
              <th scope="col">阅读行数</th>
              <th scope="col">专注均分</th>
              <th scope="col">分心事件</th>
              <th scope="col">综合</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const focusAvg = avgFocus(session);
              const score =
                session.durationSec > 0
                  ? Math.round(
                      focusAvg * 0.6 +
                        Math.min(100, (session.linesRead / Math.max(1, session.durationSec / 60)) * 2) * 0.4,
                    )
                  : 0;
              return (
                <tr key={session.id}>
                  <th scope="row" className={styles.timeCell}>
                    {timeRange(session)}
                  </th>
                  <td>{formatDurationHms(session.durationSec)}</td>
                  <td>{formatLines(session.linesRead)}</td>
                  <td>{focusAvg}</td>
                  <td>{distractionSummary(session)}</td>
                  <td className={styles.scoreCell}>{score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
