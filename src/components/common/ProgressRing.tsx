/**
 * ProgressRing - 环形进度（专注度 / 疲劳度）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 ProgressRing
 */
import styles from './ProgressRing.module.css';

export type ProgressRingTone = 'focus' | 'fatigue' | 'accent' | 'success';

/**
 * ProgressRingProps
 * @param aria-label - 环形图无障碍名称（必填，如「专注度 86」）
 * @param value - 0–100 的进度值
 * @param tone - 环颜色语义
 * @param label - 中心下方可选小标签
 */
export interface ProgressRingProps {
  'aria-label': string;
  value: number;
  tone?: ProgressRingTone;
  label?: string;
}

/** 将 value 钳制到 0–100 */
function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** SVG viewBox 坐标系（与 --progress-ring-size / --progress-ring-stroke 对齐） */
const RING_VIEWBOX = 88;
const RING_STROKE = 8;

export function ProgressRing({
  'aria-label': ariaLabel,
  value,
  tone = 'focus',
  label,
}: ProgressRingProps) {
  const percent = clampPercent(value);
  const radius = (RING_VIEWBOX - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className={styles.root} role="img" aria-label={ariaLabel}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`}
        aria-hidden="true"
      >
        <circle
          className={styles.track}
          cx={RING_VIEWBOX / 2}
          cy={RING_VIEWBOX / 2}
          r={radius}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <circle
          className={[styles.indicator, styles[`tone_${tone}`]].join(' ')}
          cx={RING_VIEWBOX / 2}
          cy={RING_VIEWBOX / 2}
          r={radius}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className={styles.center}>
        <span className={styles.value}>{Math.round(percent)}</span>
        {label ? <span className={styles.label}>{label}</span> : null}
      </div>
    </div>
  );
}
