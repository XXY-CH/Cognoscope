/**
 * FocusSessionList - 按时间顺序的阅读会话列表（实时数据）
 * 所属页面：B · 个人仪表盘
 */
import { useEffect, useRef } from 'react';
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

function avgSamples(samples: { value: number }[]): number {
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((s, x) => s + x.value, 0) / samples.length);
}

function hasMonitorData(s: ReadingSession): boolean {
  return s.focusSamples.length > 0 || s.fatigueSamples.length > 0;
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

/** FocusSessionList - 从 sessionStore 读取真实会话，monitor 数据自动丰富列 */
export function FocusSessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const range = useSessionStore((s) => s.range);
  const setRange = useSessionStore((s) => s.setRange);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadSessions();
  }, [loadSessions]);
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

  // 存在 monitor 数据时展示富列，否则缩略
  const rich = sessions.some(hasMonitorData);

  if (rich) {
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
                <th scope="col">疲劳度</th>
                <th scope="col">分心事件</th>
                <th scope="col">综合</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const focusAvg = avgSamples(session.focusSamples);
                const fatigueAvg = avgSamples(session.fatigueSamples);
                const distCount = activeDistractions(session.distractions).length;
                const lpm = session.durationSec > 0
                  ? session.linesRead / (session.durationSec / 60)
                  : 0;
                const score = Math.round(
                  focusAvg * 0.5 +
                  (100 - fatigueAvg) * 0.25 +
                  Math.min(100, lpm * 5) * 0.25,
                );
                return (
                  <tr key={session.id}>
                    <th scope="row" className={styles.timeCell}>
                      {timeRange(session)}
                    </th>
                    <td>{formatDurationHms(session.durationSec)}</td>
                    <td>{formatLines(session.linesRead)}</td>
                    <td>{focusAvg || '—'}</td>
                    <td>{fatigueAvg || '—'}</td>
                    <td>{distCount > 0 ? distractionSummary(session) : '—'}</td>
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

  // 无 monitor 数据：缩略视图
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
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <th scope="row" className={styles.timeCell}>
                  {timeRange(session)}
                </th>
                <td>{formatDurationHms(session.durationSec)}</td>
                <td>{formatLines(session.linesRead)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.subtitle}>启动 Python monitor 后自动丰富专注/疲劳/分心数据</p>
    </section>
  );
}
