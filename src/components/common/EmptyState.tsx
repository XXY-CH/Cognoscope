/**
 * EmptyState - 空状态占位
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 EmptyState
 */
import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './EmptyState.module.css';

/**
 * EmptyStateProps
 * @param aria-label - 区域无障碍名称（必填）
 * @param icon - 64px 插画/图标节点
 * @param title - 主文案
 * @param description - 辅助说明
 * @param actionLabel - 主操作按钮文案
 * @param onAction - 主操作回调
 * @param actionAriaLabel - 主操作按钮 aria-label（必填当有 action）
 */
export interface EmptyStateProps {
  'aria-label': string;
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionAriaLabel?: string;
}

export function EmptyState({
  'aria-label': ariaLabel,
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionAriaLabel,
}: EmptyStateProps) {
  return (
    <div className={styles.root} role="status" aria-label={ariaLabel}>
      {icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className={styles.title}>{title}</h3>
      {description ? (
        <p className={styles.description}>{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          aria-label={actionAriaLabel ?? actionLabel}
          variant="primary"
          size="md"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
