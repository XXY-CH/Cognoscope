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
import { chatCompletion, type ChatMessage } from '../../../services/aiApi';
import styles from './QAPanel.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  quote?: string;
}

/**
 * QAPanel - 离线时输入禁用；划词「提问」写入引用块，可手动移除
 */
export function QAPanel() {
  const isOnline = useUiStore((s) => s.isOnline);
  const pendingQaQuote = useReaderStore((s) => s.pendingQaQuote);
  const setPendingQaQuote = useReaderStore((s) => s.setPendingQaQuote);
  const activeFileId = useReaderStore((s) => s.fileId);
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 划词提问：填入引用块并聚焦输入框（§8.7）
  useEffect(() => {
    if (!pendingQaQuote) return;
    setQuote(pendingQaQuote);
    setPendingQaQuote(null);
    inputRef.current?.focus();
  }, [pendingQaQuote, setPendingQaQuote]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const question = draft.trim();
    if (!question || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: question,
      quote: quote || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setQuote(null);
    setLoading(true);
    setError(null);

    try {
      const chatMessages: ChatMessage[] = [
        {
          role: 'system',
          content: `你是一个学术助手，帮助用户理解文档内容。${quote ? `用户引用了以下文本：\n"${quote}"` : ''}`,
        },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user', content: question },
      ];

      const response = await chatCompletion({
        messages: chatMessages,
        temperature: 0.7,
      });

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.content },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败';
      setError(message);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root} aria-label="AI 问答">
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <EmptyState
            aria-label="问答空状态"
            icon={<MessageCircle strokeWidth={1.5} />}
            title="向 AI 提问"
            description="或选中文字后点击「提问」"
          />
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`${styles.message} ${styles[`message--${msg.role}`]}`}
              >
                {msg.quote && (
                  <blockquote className={styles.messageQuote}>
                    {msg.quote}
                  </blockquote>
                )}
                <div className={styles.messageContent}>{msg.content}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
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
            disabled={!isOnline || loading}
            placeholder={
              isOnline ? (loading ? 'AI 思考中...' : '输入问题…') : '离线状态下暂不可用'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            aria-label="发送问题"
            variant="primary"
            size="sm"
            disabled={!isOnline || !draft.trim() || loading}
            onClick={() => void handleSend()}
          >
            {loading ? '...' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  );
}
