/**
 * SearchInput - 带搜索图标与清空的输入框
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 SearchInput
 */
import { forwardRef, useRef } from 'react';
import type { InputHTMLAttributes, KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import styles from './SearchInput.module.css';

/**
 * SearchInputProps
 * @param aria-label - 无障碍名称（必填）
 * @param onClear - 清空回调；不传则仅触发 onChange('')
 */
export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  'aria-label': string;
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      'aria-label': ariaLabel,
      value,
      onChange,
      onClear,
      onKeyDown,
      className,
      ...rest
    },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);

    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    const hasValue = String(value ?? '').length > 0;

    const clear = () => {
      // 优先走受控清空；同时让原生 input 失焦前保持可继续输入
      onClear?.();
      if (!onClear && onChange) {
        const target = innerRef.current;
        if (target) {
          const native = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          );
          native?.set?.call(target, '');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      innerRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      // Esc 清空（§3 SearchInput）
      if (event.key === 'Escape' && hasValue) {
        event.preventDefault();
        clear();
      }
      onKeyDown?.(event);
    };

    return (
      <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
        <Search
          className={styles.searchIcon}
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <input
          ref={setRefs}
          type="search"
          className={styles.input}
          aria-label={ariaLabel}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          {...rest}
        />
        {hasValue ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="清空搜索"
            onClick={clear}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  },
);
