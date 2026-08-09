/**
 * aiChat.ts - OpenAI 兼容 Chat Completions 客户端（流式 / 非流式）
 * 所属：E · 阅读界面 > QAPanel / 整理习得
 * 规范参考：UI_spec.md §8.6 / §8.9；配置来自设置中的 AI 连接参数
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** 发起请求所需的最小 AI 连接参数 */
export interface AiChatSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface StreamChatOptions {
  settings: AiChatSettings;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** 每收到一段增量文本时回调 */
  onDelta: (delta: string) => void;
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

interface BackendChatResponse {
  content?: string;
  model?: string;
  usage_tokens?: number;
}

async function readBackendError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as {
    detail?: unknown;
  } | null;
  const detail = typeof payload?.detail === 'string' ? payload.detail : '';
  return new Error(detail || `AI 后端请求失败（HTTP ${response.status}）`);
}

function backendUnavailable(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error('无法连接 Congnoscope 后端，请确认后端运行在 127.0.0.1:8000');
  }
  return error instanceof Error ? error : new Error('AI 请求失败');
}

function requestBody(
  settings: AiChatSettings,
  messages: ChatMessage[],
  maxTokens?: number,
): string {
  return JSON.stringify({
    messages,
    temperature: settings.temperature,
    max_tokens: maxTokens ?? settings.maxTokens,
  });
}

/**
 * 流式调用 chat/completions，返回完整助手文本。
 */
export async function streamChatCompletion(
  options: StreamChatOptions,
): Promise<string> {
  const { settings, messages, signal, onDelta } = options;
  if (!settings.apiKey.trim()) {
    throw new Error('请先在设置中填写 API Key');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody(settings, messages),
      signal,
    });
  } catch (error) {
    throw backendUnavailable(error);
  }

  if (!res.ok) throw await readBackendError(res);

  if (!res.body) {
    throw new Error('AI 响应不支持流式读取');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const consumeLine = (rawLine: string): void => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let json: {
      error?: string;
      choices?: Array<{ delta?: { content?: string } }>;
    };
    try {
      json = JSON.parse(data) as typeof json;
    } catch {
      // 忽略非 JSON 心跳行
      return;
    }
    if (json.error) throw new Error(json.error);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      onDelta(delta);
    }
  };

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) consumeLine(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  return full;
}

export interface ChatCompletionOptions {
  settings: AiChatSettings;
  messages: ChatMessage[];
  /** 覆盖 settings.maxTokens */
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * 非流式 chat/completions，返回完整助手文本（整理习得等一次性任务）
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<string> {
  const { settings, messages, signal } = options;
  if (!settings.apiKey.trim()) {
    throw new Error('请先在设置中填写 API Key');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody(settings, messages, options.maxTokens),
      signal,
    });
  } catch (error) {
    throw backendUnavailable(error);
  }

  if (!res.ok) throw await readBackendError(res);

  const json = (await res.json()) as BackendChatResponse;
  const content = json.content?.trim() ?? '';
  if (!content) {
    throw new Error('未收到模型回复，请检查接口与模型配置');
  }
  return content;
}
