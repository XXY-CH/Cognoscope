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

/** 规范化 Base URL，保证以 /v1 结尾且无多余斜杠 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
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

  const url = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: true,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      detail.trim()
        ? `AI 请求失败（${res.status}）：${detail.slice(0, 200)}`
        : `AI 请求失败（HTTP ${res.status}）`,
    );
  }

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
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onDelta(delta);
      }
    } catch {
      // 忽略非 JSON 心跳行
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

  const url = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: options.maxTokens ?? settings.maxTokens,
      stream: false,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      detail.trim()
        ? `AI 请求失败（${res.status}）：${detail.slice(0, 200)}`
        : `AI 请求失败（HTTP ${res.status}）`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) {
    throw new Error('未收到模型回复，请检查接口与模型配置');
  }
  return content;
}
