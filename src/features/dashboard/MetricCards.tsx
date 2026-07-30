/**
 * MetricCards - 专注时长 / 阅读行数指标卡
 * 所属页面：B · 个人仪表盘
 * 规范参考：UI_spec.md §5.3
 */
import { BookOpen, Timer } from 'lucide-react';
import type { ReadingSession } from '../../types';
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
  // 无数据时给默认高度，避免 Math.max 空数组与空白条
  const series = values.length > 0 ? values : [0];
  const max = Math.max(...series, 1);
  const toneClass =
    tone === 'focus' ? styles.sparkFocus : styles.sparkReading;

  return (
    <div
      className={[styles.spark, toneClass].join(' ')}
      role="img"
      aria-label={label}
    >
      {series.map((v, i) => (
        <span
          key={i}
          className={styles.sparkBar}
          data-level={Math.min(4, Math.round((v / max) * 4))}
        />
      ))}
    </div>
  );
}

interface MetricCardsProps {
  sessions: ReadingSession[];
}

/** MetricCards - 由 DashboardPage 注入已按范围过滤的会话 */
export function MetricCards({ sessions }: MetricCardsProps) {
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
        <p className={styles.value}>
          {formatDurationHms(metrics.focusDurationSec)}
        </p>
        <p className={styles.sub}>
          较上次 {focusDeltaSign}
          {metrics.focusDeltaMin} 分钟
        </p>
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
        <p className={styles.value}>
          {formatLines(metrics.linesRead)} 行
        </p>
        <p className={styles.sub}>
          较上次 {linesDeltaSign}
          {formatLines(Math.abs(metrics.linesDelta))} 行
        </p>
        <MiniSpark
          values={metrics.sparkLines}
          tone="reading"
          label="近 7 次阅读行数趋势"
        />
      </article>
    </div>
  );
}
