/**
 * Button - 通用按钮（主/次/文字/危险）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Button
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * ButtonProps
 * @param aria-label - 无障碍名称（必填，即使有可见文字也需提供）
 * @param variant - 视觉变体：主实心 / 描边次级 / 文字 / 危险
 * @param size - 高度档：sm 32 / md 36 / lg 40
 * @param leftIcon - 左侧图标节点
 * @param rightIcon - 右侧图标节点
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

export function Button({
  'aria-label': ariaLabel,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  children,
  className,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  const classNames = [
    styles.root,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classNames}
      aria-label={ariaLabel}
      disabled={disabled}
      {...rest}
    >
      {leftIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}
      {children ? <span className={styles.label}>{children}</span> : null}
      {rightIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </button>
  );
}
