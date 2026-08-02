/**
 * graphLinkAi.ts - 用摘要/关键词调用 AI 为新论文建边
 * 所属：C · 知识图谱
 * 规范参考：UI_spec.md §13 决策4（边由 AI 产生）；语料 = 关键词 + 摘要
 */
import type { AiSettingsDraft } from '../stores/uiStore';
import type { GraphEdge } from '../types';
import { chatCompletion } from './aiChat';

export interface GraphPaperPayload {
  nodeId: string;
  fileId: string;
  title: string;
  keywords: string[];
  abstract: string | null;
}

export interface ExistingGraphPaper {
  nodeId: string;
  title: string;
  keywords: string[];
  abstract: string | null;
}

/**
 * 解析 AI 返回的 JSON 边列表（允许包在代码围栏中）
 */
function parseEdgesJson(
  raw: string,
  newNodeId: string,
  existingIds: Set<string>,
): GraphEdge[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const edges: GraphEdge[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    let source = String(rec.source ?? '');
    let target = String(rec.target ?? '');
    const weightRaw = Number(rec.weight);
    if (!source || !target || source === target) continue;
    // 规范化：必须一端是新节点，另一端在已有图中
    if (source !== newNodeId && target !== newNodeId) {
      // 若模型返回了两篇旧文，跳过
      continue;
    }
    if (source === newNodeId && !existingIds.has(target)) continue;
    if (target === newNodeId && !existingIds.has(source)) continue;
    const weight = Number.isFinite(weightRaw)
      ? Math.max(0, Math.min(1, weightRaw))
      : 0.5;
    if (weight < 0.25) continue; // 弱关联丢弃
    const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
    edges.push({
      source,
      target,
      weight,
      origin: 'ai',
      ...(reason ? { reason: reason.slice(0, 160) } : {}),
    });
  }
  return edges;
}

/**
 * 调用 AI：根据新论文关键词/摘要与既有图谱论文，建议关联边
 */
export async function suggestGraphEdgesWithAi(input: {
  settings: AiSettingsDraft;
  paper: GraphPaperPayload;
  existing: ExistingGraphPaper[];
  signal?: AbortSignal;
}): Promise<GraphEdge[]> {
  const { settings, paper, existing, signal } = input;
  if (existing.length === 0) return [];

  const existingBrief = existing.map((e) => ({
    nodeId: e.nodeId,
    title: e.title,
    keywords: e.keywords,
    abstract: (e.abstract ?? '').slice(0, 400),
  }));

  const system = [
    '你是学术知识图谱建边助手。',
    '根据「新论文」的关键词与摘要，判断它与「已有论文」的主题关联。',
    '只输出 JSON 数组，不要其它说明。格式：',
    '[{"source":"nodeId","target":"nodeId","weight":0.0到1.0,"reason":"一句中文理由"}]',
    '规则：',
    '1. source 或 target 必须包含新论文 nodeId，另一端必须是已有论文 nodeId。',
    '2. weight 表示关联强度；无明显关联则不要输出该边；宁缺毋滥。',
    '3. 最多返回 8 条边。',
    '4. 禁止编造不存在的 nodeId。',
  ].join('\n');

  const user = [
    `新论文 nodeId: ${paper.nodeId}`,
    `标题: ${paper.title}`,
    `关键词: ${paper.keywords.length ? paper.keywords.join('；') : '（无）'}`,
    `摘要: ${(paper.abstract ?? '').slice(0, 1200) || '（无）'}`,
    '',
    '已有论文（JSON）：',
    JSON.stringify(existingBrief, null, 0),
  ].join('\n');

  const raw = await chatCompletion({
    settings,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: Math.min(Math.max(settings.maxTokens, 1024), 2048),
    signal,
  });

  return parseEdgesJson(
    raw,
    paper.nodeId,
    new Set(existing.map((e) => e.nodeId)),
  );
}

/** 节点 id 约定：file 节点用 file_<fileId> */
export function graphNodeIdForFile(fileId: string): string {
  return `file_${fileId}`;
}

export function isAiAvailable(
  settings: AiSettingsDraft,
  isOnline: boolean,
): boolean {
  return isOnline && settings.apiKey.trim().length > 0;
}
