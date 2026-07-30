/**
 * qaStore - 按文件隔离的 AI 问答消息（内存态，尚未落库）
 * 所属：E · 阅读界面 > SidePanel > QAPanel
 * 规范参考：UI_spec.md §8.6 / §9 QaMessage
 *
 * 每次提问统一带文献全文；有划词时在 user 侧重点指出选中片段。
 */
import { create } from 'zustand';
import type { FileNode, QaMessage } from '../types';
import { streamChatCompletion } from '../utils/aiChat';
import { createId } from '../utils/id';
import { loadDocumentTranscript } from '../utils/loadDocumentTranscript';
import { buildQaSystemPrompt, toApiChatMessages } from '../utils/qaPrompt';
import type { AiSettingsDraft } from './uiStore';

interface TranscriptCache {
  text: string;
  truncated: boolean;
}

interface QaState {
  fileId: string | null;
  messages: QaMessage[];
  sending: boolean;
  /** 当前文件文字稿缓存，避免每轮重复抽取 */
  transcript: TranscriptCache | null;
  ensureFile: (fileId: string) => void;
  clear: () => void;
  /**
   * 发送提问：始终附带全文 system；quotedText 有值时重点指出该片段
   */
  send: (input: {
    content: string;
    quotedText: string | null;
    quotedPage?: number | null;
    file: FileNode;
    settings: AiSettingsDraft;
  }) => Promise<void>;
}

export const useQaStore = create<QaState>((set, get) => ({
  fileId: null,
  messages: [],
  sending: false,
  transcript: null,

  ensureFile: (fileId) => {
    if (get().fileId === fileId) return;
    // 换文件时清空对话与文字稿缓存
    set({ fileId, messages: [], sending: false, transcript: null });
  },

  clear: () =>
    set({ fileId: null, messages: [], sending: false, transcript: null }),

  send: async ({
    content,
    quotedText,
    quotedPage = null,
    file,
    settings,
  }) => {
    const fileId = get().fileId;
    const trimmed = content.trim();
    if (!fileId || file.id !== fileId || !trimmed || get().sending) return;

    const now = new Date().toISOString();
    const userMsg: QaMessage = {
      id: createId('qa'),
      fileId,
      role: 'user',
      content: trimmed,
      quotedText,
      quotedPage,
      createdAt: now,
      status: 'done',
    };
    const assistantId = createId('qa');
    const assistantMsg: QaMessage = {
      id: assistantId,
      fileId,
      role: 'assistant',
      content: '',
      quotedText: null,
      quotedPage: null,
      createdAt: now,
      status: 'streaming',
    };

    set({
      sending: true,
      messages: [...get().messages, userMsg, assistantMsg],
    });

    try {
      // 懒加载全文，同文件复用缓存
      let transcript = get().transcript;
      if (!transcript) {
        const loaded = await loadDocumentTranscript(file);
        transcript = { text: loaded.text, truncated: loaded.truncated };
        // 若期间已切换文件，丢弃结果
        if (get().fileId !== fileId) return;
        set({ transcript });
      }

      const systemPrompt = buildQaSystemPrompt({
        fileName: file.name,
        transcript: transcript.text,
        transcriptTruncated: transcript.truncated,
        answerLanguage: settings.answerLanguage,
        autoCite: settings.autoCite,
      });

      const history = get()
        .messages.filter(
          (m) =>
            m.id !== assistantId &&
            m.status === 'done' &&
            (m.role === 'user' || m.role === 'assistant') &&
            m.content.trim(),
        )
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          quotedText: m.quotedText,
        }));

      const apiMessages = toApiChatMessages(systemPrompt, history);

      await streamChatCompletion({
        settings: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
        },
        messages: apiMessages,
        onDelta: (delta) => {
          set({
            messages: get().messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta, status: 'streaming' }
                : m,
            ),
          });
        },
      });

      set({
        sending: false,
        messages: get().messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                status: m.content.trim() ? 'done' : 'error',
                content: m.content.trim()
                  ? m.content
                  : '未收到模型回复，请检查接口与模型配置',
              }
            : m,
        ),
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'AI 请求失败，请稍后重试';
      set({
        sending: false,
        messages: get().messages.map((m) =>
          m.id === assistantId
            ? { ...m, status: 'error', content: message }
            : m,
        ),
      });
    }
  },
}));
