/**
 * Skeleton - 加载骨架屏（微光动画）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Skeleton
 */
import styles from './Skeleton.module.css';

export type SkeletonVariant = 'rect' | 'text' | 'circle' | 'table';

/**
 * SkeletonProps
 * @param aria-label - 加载状态无障碍说明（必填）
 * @param variant - rect 默认块 / text 文本行 / circle 圆形 / table 6 行表格骨架
 * @param lines - text 变体行数；table 固定 6 行
 * @param className - 额外 class（用于控制宽高）
 */
export interface SkeletonProps {
  'aria-label': string;
  variant?: SkeletonVariant;
  lines?: number;
  className?: string;
}

export function Skeleton({
  'aria-label': ariaLabel,
  variant = 'rect',
  lines = 3,
  className,
}: SkeletonProps) {
  if (variant === 'table') {
    // 表格加载约定显示 6 行骨架
    return (
      <div
        className={[styles.table, className].filter(Boolean).join(' ')}
        role="status"
        aria-busy="true"
        aria-label={ariaLabel}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={styles.tableRow}>
            <span className={[styles.block, styles.shimmer].join(' ')} />
            <span className={[styles.block, styles.shimmer, styles.short].join(' ')} />
            <span className={[styles.block, styles.shimmer, styles.short].join(' ')} />
            <span className={[styles.block, styles.shimmer, styles.tiny].join(' ')} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div
        className={[styles.textGroup, className].filter(Boolean).join(' ')}
        role="status"
        aria-busy="true"
        aria-label={ariaLabel}
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={[
              styles.block,
              styles.shimmer,
              styles.textLine,
              i === lines - 1 ? styles.short : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
    );
  }

  return (
    <span
      className={[
        styles.block,
        styles.shimmer,
        variant === 'circle' ? styles.circle : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    />
  );
}
