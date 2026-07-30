/**
 * Input - 通用文本输入框
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Input
 */
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

/**
 * InputProps
 * @param aria-label - 无障碍名称（必填；若另有可见 label 可用 aria-labelledby，仍须提供本属性或等价命名）
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  'aria-label': string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { 'aria-label': ariaLabel, className, type = 'text', ...rest },
    ref,
  ) {
    const classNames = [styles.root, className].filter(Boolean).join(' ');

    return (
      <input
        ref={ref}
        type={type}
        className={classNames}
        aria-label={ariaLabel}
        {...rest}
      />
    );
  },
);
