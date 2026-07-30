/**
 * FocusSessionList - 专注会话表（monitor/analyze.py 六维指标）
 * 所属页面：B · 个人仪表盘
 * 规范参考：HANDOFF.md §1.3；算法对齐 monitor/analyze.py
 */
import {
  ENG_STATE_LABELS,
  formatPerMin,
  formatPercent,
  formatPoseStd,
} from '../../utils/sessionAnalyze';
import type { SessionFocusAnalysis } from '../../types';
import type { SessionRange } from '../../utils/dashboardMetrics';
import { formatDurationHms } from '../../utils/dashboardMetrics';
import styles from './FocusSessionList.module.css';

interface FocusSessionListProps {
  analyses: SessionFocusAnalysis[];
  range: SessionRange;
  monitorStatus: 'idle' | 'loading' | 'ready' | 'offline' | 'error';
  onRangeChange: (range: SessionRange) => void;
}

function timeRange(a: SessionFocusAnalysis): string {
  if (!a.startedAt) return a.sessionId;
  const start = new Date(a.startedAt);
  const end = a.endedAt ? new Date(a.endedAt) : null;
  const dateStr = `${start.getMonth() + 1}/${start.getDate()}`;
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  if (!end) return `${dateStr} ${startTime}`;
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${dateStr} ${startTime} — ${endTime}`;
}

/**
 * FocusSessionList - 展示 analyze.py 产出的注视/分心/姿态/投入/综合分
 */
export function FocusSessionList({
  analyses,
  range,
  monitorStatus,
  onRangeChange,
}: FocusSessionListProps) {
  const ranges: { key: SessionRange; label: string }[] = [
    { key: 'recent7', label: '近 7 天' },
    { key: 'month', label: '近 30 天' },
    { key: 'all', label: '全部' },
  ];

  const subtitle =
    monitorStatus === 'loading'
      ? '正在拉取 monitor 分析…'
      : monitorStatus === 'offline'
        ? 'Python monitor 未连接，请启动 monitor/server.py'
        : analyses.length === 0
          ? '暂无检测会话。打开论文阅读后将自动记录'
          : '指标来自 monitor/analyze.py（注视 · 姿态 · 分心 · 投入 · 综合分）';

  return (
    <section className={styles.root} aria-label="专注会话指标">
      <div className={styles.header}>
        <h2 className={styles.title}>专注会话</h2>
        <p className={styles.subtitle}>{subtitle}</p>
        <nav className={styles.rangeTabs} aria-label="时间范围">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              className={
                range === r.key ? styles.rangeActive : styles.rangeTab
              }
              onClick={() => onRangeChange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </nav>
      </div>

      {analyses.length === 0 ? null : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">会话时间</th>
                <th scope="col">时长</th>
                <th scope="col">注视中心</th>
                <th scope="col">分心密度</th>
                <th scope="col">头部姿态 σ</th>
                <th scope="col">分心占比</th>
                <th scope="col">投入状态</th>
                <th scope="col">综合评分</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.sessionId}>
                  <th scope="row" className={styles.timeCell}>
                    {timeRange(a)}
                  </th>
                  <td>{formatDurationHms(Math.round(a.durationSec))}</td>
                  <td>{formatPercent(a.gazeRatio)}</td>
                  <td>{formatPerMin(a.eventsPerMin)}</td>
                  <td>{formatPoseStd(a.yawStd, a.pitchStd)}</td>
                  <td>{formatPercent(a.distractRatio)}</td>
                  <td>
                    {a.engDominant
                      ? (ENG_STATE_LABELS[a.engDominant] ?? a.engDominant)
                      : '—'}
                  </td>
                  <td className={styles.scoreCell}>
                    {a.focusScore !== null ? a.focusScore : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
