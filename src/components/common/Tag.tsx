/**
 * Tag - 可移除/静态标签（文件类型、自定义标签、离线胶囊等）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 未单列；对齐 §14 离线胶囊与图谱标签用法
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Tag.module.css';

export type TagTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

/**
 * TagProps
 * @param aria-label - 标签无障碍名称（必填）
 * @param children - 标签文案
 * @param tone - 语义色
 * @param icon - 可选前置图标（如 cloud-off）
 * @param onRemove - 传入则显示移除按钮
 * @param removeAriaLabel - 移除按钮 aria-label（有 onRemove 时必填）
 */
export interface TagProps {
  'aria-label': string;
  children: ReactNode;
  tone?: TagTone;
  icon?: ReactNode;
  onRemove?: () => void;
  removeAriaLabel?: string;
  className?: string;
}

export function Tag({
  'aria-label': ariaLabel,
  children,
  tone = 'neutral',
  icon,
  onRemove,
  removeAriaLabel,
  className,
}: TagProps) {
  return (
    <span
      className={[styles.root, styles[`tone_${tone}`], className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    >
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          aria-label={removeAriaLabel ?? `移除${ariaLabel}`}
          onClick={onRemove}
        >
          <X size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
