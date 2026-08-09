/**
 * QAPanel - AI 问答区
 * 所属页面：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.6 / §14.2（离线禁用）
 *
 * 统一提交文献全文；有划词引用时在提问中重点指出选中片段。
 */
import { MessageCircle, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, EmptyState, IconButton, toast } from '../../../components/common';
import { FormattedMessage } from '../../../components/common/FormattedMessage';
import { useFileStore } from '../../../stores/fileStore';
import { useQaStore } from '../../../stores/qaStore';
import { useReaderStore } from '../../../stores/readerStore';
import { useUiStore } from '../../../stores/uiStore';
import styles from './QAPanel.module.css';

/**
 * QAPanel - 离线禁用；划词「提问」写入引用块；发送时附带全文并标出重点
 */
export function QAPanel() {
  const isOnline = useUiStore((s) => s.isOnline);
  const fileId = useReaderStore((s) => s.fileId);
  const pendingQaQuote = useReaderStore((s) => s.pendingQaQuote);
  const setPendingQaQuote = useReaderStore((s) => s.setPendingQaQuote);
  const ensureFile = useQaStore((s) => s.ensureFile);
  const stop = useQaStore((s) => s.stop);
  const send = useQaStore((s) => s.send);
  const sending = useQaStore((s) => s.sending);
  const loading = useQaStore((s) => s.loading);
  const errorMessage = useQaStore((s) => s.errorMessage);
  const messages = useQaStore(useShallow((s) => s.messages));
  const aiSettings = useUiStore((s) => s.aiSettings);
  const files = useFileStore(useShallow((s) => s.files));

  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const [quotePage, setQuotePage] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeFile =
    fileId != null
      ? files.find((f) => f.id === fileId && f.deletedAt === null) ?? null
      : null;

  // 按当前阅读文件切换独立对话
  useEffect(() => {
    setDraft('');
    setQuote(null);
    setQuotePage(null);
    if (!fileId) return;
    void ensureFile(fileId);
    return () => {
      if (useQaStore.getState().fileId === fileId) {
        useQaStore.getState().stop();
      }
    };
  }, [fileId, ensureFile]);

  // 划词提问：填入引用块并聚焦输入框（§8.7）
  useEffect(() => {
    if (!pendingQaQuote) return;
    setQuote(pendingQaQuote.text);
    setQuotePage(pendingQaQuote.page);
    setPendingQaQuote(null);
    inputRef.current?.focus();
  }, [pendingQaQuote, setPendingQaQuote]);

  // 新消息到达时滚到底部
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const canSend =
    isOnline &&
    aiSettings.apiKey.trim().length > 0 &&
    !sending &&
    !loading &&
    Boolean(draft.trim()) &&
    Boolean(activeFile);

  const handleSend = async () => {
    if (!canSend || !activeFile) return;
    if (!aiSettings.apiKey.trim()) {
      toast.error('请先在设置中填写 API Key');
      return;
    }
    const content = draft.trim();
    const quotedText = quote;
    setDraft('');
    setQuote(null);
    const quotedPage = quotePage;
    setQuotePage(null);
    // 全文在 store 内装入 system；选中片段在 API user 中重点指出
    await send({
      content,
      quotedText,
      quotedPage,
      file: activeFile,
      settings: aiSettings,
    });
  };

  return (
    <div className={styles.root} aria-label="AI 问答">
      <div className={styles.status} aria-live="polite">
        {loading ? '正在恢复本文件的问答…' : null}
        {!loading && !isOnline ? '离线状态下保留历史，暂不能发起新问答' : null}
        {!loading && isOnline && !aiSettings.apiKey.trim() ? '请先配置 API Key' : null}
        {errorMessage ? errorMessage : null}
      </div>
      <div ref={listRef} className={styles.messages}>
        {messages.length === 0 ? (
          <EmptyState
            aria-label="问答空状态"
            icon={<MessageCircle strokeWidth={1.5} />}
            title="向 AI 提问"
            description="将附带文献全文。选中文字后提问时，会重点标出该片段。"
          />
        ) : (
          <ul className={styles.list}>
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === 'user' ? styles.bubbleUser : styles.bubbleAi
                }
              >
                {m.role === 'user' && m.quotedText ? (
                  <blockquote className={styles.bubbleQuote}>
                    {m.quotedText}
                  </blockquote>
                ) : null}
                <div className={styles.bubbleText}>
                  {m.content ? (
                    <FormattedMessage content={m.content} />
                  ) : m.status === 'streaming' ? (
                    '思考中…'
                  ) : null}
                </div>
                {m.status === 'error' ? (
                  <p className={styles.bubbleError} role="alert">
                    本次问答未完成
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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
              onClick={() => {
                setQuote(null);
                setQuotePage(null);
              }}
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
            disabled={!isOnline || sending || loading || !aiSettings.apiKey.trim()}
            placeholder={
              !isOnline
                ? '离线状态下暂不可用'
                : !aiSettings.apiKey.trim()
                  ? '请先在设置中配置 API Key'
                  : quote
                    ? '针对选中片段提问（仍附带全文）…'
                    : '输入问题（将附带文献全文）…'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 普通 Enter 发送；Shift+Enter 保留换行，IME 组字期间不抢回车。
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          {sending ? (
            <IconButton aria-label="停止生成" onClick={stop}>
              <Square size={16} strokeWidth={1.5} />
            </IconButton>
          ) : (
            <Button
              aria-label="发送问题"
              variant="primary"
              size="sm"
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
