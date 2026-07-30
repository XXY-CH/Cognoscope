/**
 * Dialog - 模态对话框（确认 440 / 表单 600）
 * 所属：通用组件库
 * 规范参考：UI_spec.md §3 Dialog / §11 focus trap
 */
import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from './Button';
import styles from './Dialog.module.css';

export type DialogSize = 'confirm' | 'form';

/**
 * DialogProps
 * @param open - 是否打开
 * @param onClose - 关闭回调（遮罩 / Esc / 关闭按钮）
 * @param title - 标题文案
 * @param aria-label - 对话框无障碍名称（必填；可与 title 相同）
 * @param size - confirm 440 / form 600
 * @param children - 内容区
 * @param footer - 底部按钮组；不传则不渲染 footer
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  'aria-label': string;
  size?: DialogSize;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  'aria-label': ariaLabel,
  size = 'confirm',
  children,
  footer,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return (
    <div className={styles.root} role="presentation">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="关闭对话框"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={[
          styles.panel,
          size === 'form' ? styles.sizeForm : styles.sizeConfirm,
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button
            aria-label="关闭对话框"
            variant="ghost"
            size="sm"
            className={styles.close}
            onClick={onClose}
          >
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </header>

        <div className={styles.body}>{children}</div>

        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}
