/**
 * MetricCards - 专注时长 / 阅读行数指标卡（实时数据）
 * 所属页面：B · 个人仪表盘
 * 规范参考：UI_spec.md §5.3
 */
import { useEffect, useRef } from 'react';
import { BookOpen, Timer } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import {
  formatDurationHms,
  formatLines,
  summarizeMetrics,
} from '../../utils/dashboardMetrics';
import styles from './MetricCards.module.css';

type SparkTone = 'focus' | 'reading';

function MiniSpark({
  values,
  tone,
  label,
}: {
  values: number[];
  tone: SparkTone;
  label: string;
}) {
  const max = Math.max(...values, 1);
  const toneClass =
    tone === 'focus' ? styles.sparkFocus : styles.sparkReading;

  return (
    <div
      className={[styles.spark, toneClass].join(' ')}
      role="img"
      aria-label={label}
    >
      {values.map((v, i) => (
        <span
          key={i}
          className={styles.sparkBar}
          data-level={Math.min(4, Math.round((v / max) * 4))}
        />
      ))}
    </div>
  );
}

export function MetricCards() {
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadSessions();
  }, [loadSessions]);

  const metrics = summarizeMetrics(sessions);
  const focusDeltaSign = metrics.focusDeltaMin >= 0 ? '+' : '';
  const linesDeltaSign = metrics.linesDelta >= 0 ? '+' : '';

  return (
    <div className={styles.grid} aria-label="关键指标">
      <article className={styles.card}>
        <Timer
          className={[styles.icon, styles.sparkFocus].join(' ')}
          size={32}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className={styles.caption}>专注时长</p>
        <p className={styles.value}>{formatDurationHms(metrics.focusDurationSec)}</p>
        <p className={styles.sub}>较上次 {focusDeltaSign}{metrics.focusDeltaMin} 分钟</p>
        <MiniSpark
          values={metrics.sparkFocus}
          tone="focus"
          label="近 7 次专注趋势"
        />
      </article>

      <article className={styles.card}>
        <BookOpen
          className={[styles.icon, styles.sparkReading].join(' ')}
          size={32}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className={styles.caption}>阅读行数</p>
        <p className={styles.value}>{formatLines(metrics.linesRead)} 行</p>
        <p className={styles.sub}>较上次 {linesDeltaSign}{formatLines(Math.abs(metrics.linesDelta))} 行</p>
        <MiniSpark
          values={metrics.sparkLines}
          tone="reading"
          label="近 7 次阅读行数趋势"
        />
      </article>
    </div>
  );
}
