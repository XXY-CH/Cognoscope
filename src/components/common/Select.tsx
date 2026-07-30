/**
 * Select - 通用下拉选择
 * 所属：通用组件库
 * 规范参考：对齐 UI_spec.md §3 Input 规格；§3 未单列 Select
 */
import { forwardRef } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * SelectProps
 * @param aria-label - 无障碍名称（必填）
 * @param options - 选项列表；也可用 children 传入原生 <option>
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  'aria-label': string;
  options?: SelectOption[];
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      'aria-label': ariaLabel,
      options,
      children,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    const classNames = [styles.select, className].filter(Boolean).join(' ');

    return (
      <div
        className={[styles.wrap, disabled ? styles.wrapDisabled : '']
          .filter(Boolean)
          .join(' ')}
      >
        <select
          ref={ref}
          className={classNames}
          aria-label={ariaLabel}
          disabled={disabled}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                >
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          className={styles.chevron}
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    );
  },
);
