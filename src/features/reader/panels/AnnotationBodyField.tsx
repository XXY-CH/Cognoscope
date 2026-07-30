/**
 * AnnotationBodyField - 批注正文输入（兼容中文 IME）
 * 所属页面：E · 阅读界面 > AnnotationPanel
 * 规范参考：UI_spec.md §8.6
 *
 * 组字期间只用本地 state，避免受控 value 回写打断输入法
 */
import { useEffect, useRef, useState } from 'react';
import styles from './AnnotationPanel.module.css';

/**
 * AnnotationBodyFieldProps
 * @param annotationId - 批注 id
 * @param body - 已持久化的正文（外部变更时在非编辑态同步）
 * @param onCommit - 组字结束 / 失焦时写回 store
 * @param autoFocus - 划词新建后自动聚焦
 */
export interface AnnotationBodyFieldProps {
  annotationId: string;
  body: string;
  onCommit: (id: string, body: string) => void;
  autoFocus?: boolean;
}

/**
 * 本地草稿 + composition 守卫；不在组字过程中把中间态写进 Zustand
 */
export function AnnotationBodyField({
  annotationId,
  body,
  onCommit,
  autoFocus = false,
}: AnnotationBodyFieldProps) {
  const [draft, setDraft] = useState(body);
  const composingRef = useRef(false);
  const focusedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 外部正文变化时：仅在非编辑态同步，避免覆盖正在输入的拼音
  useEffect(() => {
    if (focusedRef.current || composingRef.current) return;
    setDraft(body);
  }, [body]);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
  }, [autoFocus]);

  const commit = (next: string) => {
    if (next === body) return;
    onCommit(annotationId, next);
  };

  return (
    <textarea
      ref={textareaRef}
      className={styles.body}
      aria-label="批注正文"
      rows={1}
      value={draft}
      placeholder="写下批注…"
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        const next = e.currentTarget.value;
        setDraft(next);
        // 组字结束再落库，避免半成品拼音被受控回写
        commit(next);
      }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        // 组字中不写 store：兼用 flag 与原生 isComposing（部分 IME 更可靠）
        const native = e.nativeEvent as InputEvent;
        if (composingRef.current || native.isComposing) return;
        commit(next);
      }}
      onBlur={() => {
        focusedRef.current = false;
        composingRef.current = false;
        commit(draft);
      }}
    />
  );
}
