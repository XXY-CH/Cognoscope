/**
 * QAPanel - AI 问答区
 * 所属页面：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.6 / §14.2（离线禁用）
 */
import { MessageCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState, IconButton } from '../../../components/common';
import { useReaderStore } from '../../../stores/readerStore';
import { useUiStore } from '../../../stores/uiStore';
import styles from './QAPanel.module.css';

/**
 * QAPanel - 离线时输入禁用；划词「提问」写入引用块，可手动移除
 */
export function QAPanel() {
  const isOnline = useUiStore((s) => s.isOnline);
  const pendingQaQuote = useReaderStore((s) => s.pendingQaQuote);
  const setPendingQaQuote = useReaderStore((s) => s.setPendingQaQuote);
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 划词提问：填入引用块并聚焦输入框（§8.7）
  useEffect(() => {
    if (!pendingQaQuote) return;
    setQuote(pendingQaQuote);
    setPendingQaQuote(null);
    inputRef.current?.focus();
  }, [pendingQaQuote, setPendingQaQuote]);

  return (
    <div className={styles.root} aria-label="AI 问答">
      <div className={styles.messages}>
        <EmptyState
          aria-label="问答空状态"
          icon={<MessageCircle strokeWidth={1.5} />}
          title="向 AI 提问"
          description="或选中文字后点击「提问」。问答功能将在后续步骤接入。"
        />
      </div>

      <div className={styles.composer}>
        {quote ? (
          <div className={styles.quoteRow}>
            <blockquote className={styles.quote} cite="selection">
              {quote}
            </blockquote>
            <IconButton
              aria-label="移除引用"
              className={styles.quoteRemove}
              onClick={() => setQuote(null)}
            >
              <X size={16} strokeWidth={1.5} />
            </IconButton>
          </div>
        ) : null}
        <div className={styles.row}>
          <textarea
            ref={inputRef}
            className={styles.input}
            aria-label="问题输入"
            rows={1}
            value={draft}
            disabled={!isOnline}
            placeholder={
              isOnline ? '输入问题…' : '离线状态下暂不可用'
            }
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            aria-label="发送问题"
            variant="primary"
            size="sm"
            disabled={!isOnline || !draft.trim()}
            onClick={() => {
              setDraft('');
              setQuote(null);
            }}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
