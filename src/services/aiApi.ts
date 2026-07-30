/**
 * aiApi - AI 服务接口（对话、总结、RAG、内容节点提取）
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

export interface ContentNode {
  label: string;
  type: 'concept' | 'entity' | 'topic';
  description: string;
}

export interface ContentEdge {
  source: string;
  target: string;
  relation: 'relates_to' | 'part_of' | 'prerequisite' | 'causes';
  weight: number;
}

export interface ExtractNodesResponse {
  nodes: ContentNode[];
  edges: ContentEdge[];
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

export interface ContentNode {
  label: string;
  node_type: string;
  description: string;
}

export interface ContentEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface ContentGraphResponse {
  document_id: string;
  nodes: ContentNode[];
  edges: ContentEdge[];
}

/**
 * 从文档内容生成内容图谱
 */
export async function generateContentGraph(
  documentId: string,
  documentText: string,
  maxNodes: number = 20
): Promise<ContentGraphResponse> {
  const response = await fetch(`${API_BASE}/documents/${documentId}/content-graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_text: documentText,
      max_nodes: maxNodes,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '生成内容图谱失败');
  }

  return await response.json();
}

/**
 * 从文档内容提取概念节点和关系边
 */
export async function extractContentNodes(
  documentId: string,
  documentText: string,
  maxNodes: number = 20
): Promise<ExtractNodesResponse> {
  const url = new URL(`${API_BASE}/documents/${documentId}/extract-nodes`);
  url.searchParams.set('document_text', documentText);
  url.searchParams.set('max_nodes', String(maxNodes));

  const response = await fetch(url.toString(), {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || '提取节点失败');
  }

  return await response.json();
}