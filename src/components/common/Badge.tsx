/**
 * Badge - 数量/状态徽章
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 未单列；用于「全部 N」、事件标记等（§8.6 / §5）
 */
import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'drink'
  | 'talk'
  | 'away'
  | 'phone'
  | 'yawn'
  | 'gaze_off';

/**
 * BadgeProps
 * @param aria-label - 无障碍名称（必填，如「批注 12」）
 * @param tone - 语义色
 * @param children - 徽章内容（数字或短文案）
 * @param icon - 可选前置图标
 * @param soft - 浅底样式（accent-subtle 类）
 */
export interface BadgeProps {
  'aria-label': string;
  tone?: BadgeTone;
  children?: ReactNode;
  icon?: ReactNode;
  soft?: boolean;
  className?: string;
}

export function Badge({
  'aria-label': ariaLabel,
  tone = 'neutral',
  children,
  icon,
  soft = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={[
        styles.root,
        styles[`tone_${tone}`],
        soft ? styles.soft : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    >
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children != null ? <span className={styles.label}>{children}</span> : null}
    </span>
  );
}
