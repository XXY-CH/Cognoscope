/**
 * aiApi - AI 服务接口（对话、总结、RAG）
 * 后端路由：/api/v1/ai/*
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage_tokens: number;
}

export interface DocumentSummary {
  title: string;
  summary: string;
  keywords: string[];
  main_topics: string[];
}

export interface AskResponse {
  answer: string;
  sources: Array<{
    document_id: string;
    snippet: string;
  }>;
}

/**
 * 通用 AI 对话
 */
export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '对话请求失败');
  }

  return await response.json();
}

/**
 * 文档 AI 总结
 */
export async function summarizeDocument(
  documentId: string,
  maxChars: number = 5000
): Promise<DocumentSummary> {
  const url = new URL(`${API_BASE}/documents/${documentId}/summarize`);
  url.searchParams.set('max_chars', String(maxChars));

  const response = await fetch(url.toString(), {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '总结请求失败');
  }

  return await response.json();
}

/**
 * 库内文档问答（RAG）
 */
export async function askInLibrary(
  question: string,
  libraryId?: string
): Promise<AskResponse> {
  const url = new URL(`${API_BASE}/ai/ask`);
  url.searchParams.set('question', question);
  if (libraryId) {
    url.searchParams.set('library_id', libraryId);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '问答请求失败');
  }

  return await response.json();
}