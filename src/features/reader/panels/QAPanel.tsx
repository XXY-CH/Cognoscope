/**
 * QAPanel - AI 问答区
 * 所属页面：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.6 / §14.2（离线禁用）
 *
 * 统一提交文献全文；有划词引用时在提问中重点指出选中片段。
 */
import { MessageCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, EmptyState, IconButton, toast } from '../../../components/common';
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
  const send = useQaStore((s) => s.send);
  const sending = useQaStore((s) => s.sending);
  const messages = useQaStore(useShallow((s) => s.messages));
  const aiSettings = useUiStore((s) => s.aiSettings);
  const files = useFileStore(useShallow((s) => s.files));

  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeFile =
    fileId != null
      ? files.find((f) => f.id === fileId && f.deletedAt === null) ?? null
      : null;

  // 按当前阅读文件切换独立对话
  useEffect(() => {
    if (!fileId) return;
    ensureFile(fileId);
  }, [fileId, ensureFile]);

  // 划词提问：填入引用块并聚焦输入框（§8.7）
  useEffect(() => {
    if (!pendingQaQuote) return;
    setQuote(pendingQaQuote);
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
    isOnline && !sending && Boolean(draft.trim()) && Boolean(activeFile);

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
    // 全文在 store 内装入 system；选中片段在 API user 中重点指出
    await send({
      content,
      quotedText,
      quotedPage: null,
      file: activeFile,
      settings: aiSettings,
    });
  };

  return (
    <div className={styles.root} aria-label="AI 问答">
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
                <p className={styles.bubbleText}>
                  {m.content ||
                    (m.status === 'streaming' ? '思考中…' : '')}
                </p>
                {m.status === 'error' ? (
                  <p className={styles.bubbleError} role="alert">
                    请求失败
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
            disabled={!isOnline || sending}
            placeholder={
              isOnline
                ? quote
                  ? '针对选中片段提问（仍附带全文）…'
                  : '输入问题（将附带文献全文）…'
                : '离线状态下暂不可用'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter 发送（§8 快捷键）
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            aria-label="发送问题"
            variant="primary"
            size="sm"
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            {sending ? '…' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  );
}
