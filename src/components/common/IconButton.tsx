/**
 * IconButton - 纯图标按钮（32×32）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 IconButton
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

/**
 * IconButtonProps
 * @param aria-label - 无障碍名称（必填）
 * @param children - 图标节点（建议 20px）
 * @param spinning - 为 true 时图标旋转（刷新态）
 */
export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  children: ReactNode;
  spinning?: boolean;
}

export function IconButton({
  'aria-label': ariaLabel,
  children,
  spinning = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={[styles.root, spinning ? styles.spinning : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      {...rest}
    >
      <span className={styles.icon} aria-hidden="true">
        {children}
      </span>
    </button>
  );
}
