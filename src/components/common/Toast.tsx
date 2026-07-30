/**
 * Toast - 单条提示 + 右下角堆叠容器
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Toast
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useToastStore, type ToastItem } from '../../stores/toastStore';
import styles from './Toast.module.css';

/**
 * ToastItemViewProps
 * @param item - 单条 toast 数据
 * @param aria-label - 该条提示的无障碍名称（必填）
 */
interface ToastItemViewProps {
  item: ToastItem;
  'aria-label': string;
}

function ToastItemView({
  item,
  'aria-label': ariaLabel,
}: ToastItemViewProps) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    // 到期自动消失
    const timer = window.setTimeout(() => {
      dismiss(item.id);
    }, item.durationMs);
    return () => window.clearTimeout(timer);
  }, [dismiss, item.durationMs, item.id]);

  return (
    <div
      className={[styles.item, styles[`tone_${item.tone}`]].join(' ')}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <p className={styles.message}>{item.message}</p>
      <div className={styles.actions}>
        {item.actionLabel && item.onAction ? (
          <button
            type="button"
            className={styles.actionBtn}
            aria-label={item.actionLabel}
            onClick={() => {
              item.onAction?.();
              dismiss(item.id);
            }}
          >
            {item.actionLabel}
          </button>
        ) : null}
        {item.closable ? (
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="关闭提示"
            onClick={() => dismiss(item.id)}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ToastViewport - 挂在应用根部，右下角堆叠展示
 * @param aria-label - 区域无障碍名称（必填）
 */
export interface ToastViewportProps {
  'aria-label': string;
}

export function ToastViewport({
  'aria-label': ariaLabel,
}: ToastViewportProps) {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className={styles.viewport} aria-label={ariaLabel} role="region">
      {toasts.map((item) => (
        <ToastItemView
          key={item.id}
          item={item}
          aria-label={item.message}
        />
      ))}
    </div>
  );
}
