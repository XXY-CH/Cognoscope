/**
 * qaStore - 按文件隔离且持久化的 AI 问答消息。
 * 所属：E · 阅读界面 > SidePanel > QAPanel
 * 规范参考：UI_spec.md §8.6 / §9 QaMessage
 *
 * 流式请求只影响当前 file/request generation；切换文件或停止请求不会让旧响应污染新会话。
 */
import { create } from 'zustand';
import type { FileNode, QaMessage } from '../types';
import * as qaMessagesDb from '../db/qaMessages';
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
  loading: boolean;
  errorMessage: string | null;
  /** 当前文件文字稿缓存，避免每轮重复抽取。 */
  transcript: TranscriptCache | null;
  ensureFile: (fileId: string) => Promise<void>;
  clear: () => void;
  stop: () => void;
  send: (input: {
    content: string;
    quotedText: string | null;
    quotedPage?: number | null;
    file: FileNode;
    settings: AiSettingsDraft;
  }) => Promise<void>;
}

function interruptedMessage(message: QaMessage): QaMessage {
  if (message.status !== 'streaming') return message;
  return {
    ...message,
    status: 'error',
    content: message.content.trim()
      ? `${message.content}\n\n[本次问答未完成]`
      : '本次问答未完成，请重新提问',
  };
}

export const useQaStore = create<QaState>((set, get) => {
  let requestGeneration = 0;
  let activeAbort: AbortController | null = null;
  let activeAssistantId: string | null = null;
  let activeRequestFileId: string | null = null;
  let persistTail = Promise.resolve();
  let persistenceGeneration = 0;

  const persist = (
    message: QaMessage,
    generation = persistenceGeneration,
  ): Promise<void> => {
    persistTail = persistTail
      .catch(() => undefined)
      .then(() => {
        if (generation !== persistenceGeneration) return;
        return qaMessagesDb.putQaMessage(message);
      });
    return persistTail;
  };

  const persistOrReport = async (
    message: QaMessage,
    generation = persistenceGeneration,
  ): Promise<void> => {
    try {
      await persist(message, generation);
    } catch (error) {
      if (get().fileId !== message.fileId) return;
      set({
        errorMessage:
          error instanceof Error ? error.message : '问答历史暂时无法保存',
      });
    }
  };

  const isCurrentRequest = (fileId: string, generation: number): boolean =>
    get().fileId === fileId && requestGeneration === generation;

  const stop = (): void => {
    requestGeneration += 1;
    activeAbort?.abort();
    activeAbort = null;
    const assistantId = activeAssistantId;
    const fileId = activeRequestFileId;
    activeAssistantId = null;
    activeRequestFileId = null;
    if (!assistantId || !fileId || get().fileId !== fileId) {
      set({ sending: false });
      return;
    }

    const current = get().messages.find((message) => message.id === assistantId);
    if (!current) {
      set({ sending: false });
      return;
    }
    const next = interruptedMessage(current);
    set({
      sending: false,
      messages: get().messages.map((message) =>
        message.id === assistantId ? next : message,
      ),
    });
    void persistOrReport(next);
  };

  return {
    fileId: null,
    messages: [],
    sending: false,
    loading: false,
    errorMessage: null,
    transcript: null,

    ensureFile: async (fileId) => {
      stop();
      const generation = ++requestGeneration;
      const persistenceToken = persistenceGeneration;
      set({
        fileId,
        messages: [],
        sending: false,
        loading: true,
        errorMessage: null,
        transcript: null,
      });

      try {
        await persistTail.catch(() => undefined);
        const loaded = await qaMessagesDb.listQaMessagesByFile(fileId);
        if (get().fileId !== fileId || requestGeneration !== generation) return;
        const normalized = loaded.map(interruptedMessage);
        set({ messages: normalized, loading: false });
        if (normalized.some((message, index) => message !== loaded[index])) {
          await Promise.all(
            normalized.map((message) =>
              persistOrReport(message, persistenceToken),
            ),
          );
        }
      } catch (error) {
        if (get().fileId !== fileId || requestGeneration !== generation) return;
        set({
          loading: false,
          errorMessage:
            error instanceof Error ? error.message : '无法读取问答历史',
        });
      }
    },

    clear: () => {
      stop();
      requestGeneration += 1;
      persistenceGeneration += 1;
      set({
        fileId: null,
        messages: [],
        sending: false,
        loading: false,
        errorMessage: null,
        transcript: null,
      });
    },

    stop,

    send: async ({
      content,
      quotedText,
      quotedPage = null,
      file,
      settings,
    }) => {
      const fileId = get().fileId;
      const trimmed = content.trim();
      if (
        !fileId ||
        file.id !== fileId ||
        !trimmed ||
        get().sending ||
        get().loading
      ) {
        return;
      }

      stop();
      const generation = ++requestGeneration;
      const requestPersistenceGeneration = persistenceGeneration;
      const controller = new AbortController();
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
        createdAt: new Date(Date.parse(now) + 1).toISOString(),
        status: 'streaming',
      };
      activeAbort = controller;
      activeAssistantId = assistantId;
      activeRequestFileId = fileId;
      set({
        sending: true,
        errorMessage: null,
        messages: [...get().messages, userMsg, assistantMsg],
      });

      let assistantContent = '';
      try {
        await persistOrReport(userMsg, requestPersistenceGeneration);
        await persistOrReport(assistantMsg, requestPersistenceGeneration);
        if (!isCurrentRequest(fileId, generation)) return;

        let transcript = get().transcript;
        if (!transcript) {
          const loaded = await loadDocumentTranscript(file, controller.signal);
          transcript = { text: loaded.text, truncated: loaded.truncated };
          if (!isCurrentRequest(fileId, generation)) return;
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
            (message) =>
              message.id !== assistantId &&
              message.status === 'done' &&
              message.content.trim(),
          )
          .map((message) => ({
            role: message.role,
            content: message.content,
            quotedText: message.quotedText,
            quotedPage: message.quotedPage,
          }));
        const apiMessages = toApiChatMessages(systemPrompt, history);

        const response = await streamChatCompletion({
          settings,
          messages: apiMessages,
          signal: controller.signal,
          onDelta: (delta) => {
            if (!isCurrentRequest(fileId, generation)) return;
            assistantContent += delta;
            const current = get().messages.find(
              (message) => message.id === assistantId,
            );
            if (!current) return;
            const next = {
              ...current,
              content: assistantContent,
              status: 'streaming' as const,
            };
            set({
              messages: get().messages.map((message) =>
                message.id === assistantId ? next : message,
              ),
            });
            void persistOrReport(next, requestPersistenceGeneration);
          },
        });

        if (!isCurrentRequest(fileId, generation)) return;
        if (!assistantContent.trim()) assistantContent = response;
        const current = get().messages.find(
          (message) => message.id === assistantId,
        );
        if (!current) return;
        const next: QaMessage = {
          ...current,
          content: assistantContent.trim() || '未收到模型回复，请检查接口与模型配置',
          status: assistantContent.trim() ? 'done' : 'error',
        };
        set({
          sending: false,
          messages: get().messages.map((message) =>
            message.id === assistantId ? next : message,
          ),
        });
        await persistOrReport(next, requestPersistenceGeneration);
      } catch (error) {
        if (!isCurrentRequest(fileId, generation)) return;
        const current = get().messages.find(
          (message) => message.id === assistantId,
        );
        if (!current) return;
        const isAbort = error instanceof Error && error.name === 'AbortError';
        const next: QaMessage = {
          ...current,
          status: 'error',
          content: isAbort
            ? current.content || '本次问答已取消'
            : error instanceof Error
              ? error.message
              : 'AI 请求失败，请稍后重试',
        };
        set({
          sending: false,
          messages: get().messages.map((message) =>
            message.id === assistantId ? next : message,
          ),
        });
        await persistOrReport(next, requestPersistenceGeneration);
      } finally {
        if (isCurrentRequest(fileId, generation)) {
          requestGeneration += 1;
          activeAbort = null;
          activeAssistantId = null;
          activeRequestFileId = null;
          set({ sending: false });
        }
      }
    },
  };
});
