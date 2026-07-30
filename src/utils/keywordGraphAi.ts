/**
 * keywordGraphAi.ts - 摘要补词、近义合并、词间建边（共现 + 语义）
 * 所属：C · 知识图谱 > 关键词图谱
 * 规格：docs/interviews/keyword-graph-2026-07-30/_summary.md
 */
import type { AiSettingsDraft } from '../stores/uiStore';
import type { KeywordEdge, KeywordNode } from '../types';
import { chatCompletion } from './aiChat';

/** 单篇论文挂接到关键词图谱的词数硬上限 */
export const MAX_KEYWORDS_PER_PAPER = 5;

/** 综合边权中共现 / 语义的权重 */
const CO_OCCUR_WEIGHT = 0.55;
const SEMANTIC_WEIGHT = 0.45;
/** 低于此阈值的边丢弃 */
export const KEYWORD_EDGE_MIN_WEIGHT = 0.35;
/** 有共现但无语义分时，语义取中性偏弱，避免同篇词完全无边 */
const DEFAULT_SEMANTIC_WHEN_COOCCUR = 0.55;

/** 规范化比较用字符串 */
export function normalizeKeywordKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 由 canonical label 生成稳定 id */
export function keywordIdFromLabel(label: string): string {
  const key = normalizeKeywordKey(label);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const slug = key
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return `kw_${(h >>> 0).toString(36)}_${slug || 'x'}`;
}

/** 去重截断，保留首次出现的原文写法 */
export function takeUniqueKeywords(labels: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 40) continue;
    const key = normalizeKeywordKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function parseJsonArray(raw: string): unknown[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/** 共现分：无共享=0；单篇≈0.7；多篇递增至 1 */
export function coOccurrenceScore(
  aPaperIds: string[],
  bPaperIds: string[],
): number {
  const bSet = new Set(bPaperIds);
  let shared = 0;
  for (const p of aPaperIds) {
    if (bSet.has(p)) shared += 1;
  }
  if (shared === 0) return 0;
  if (shared === 1) return 0.7;
  return Math.min(1, 0.7 + 0.15 * (shared - 1));
}

function combinedWeight(co: number, semantic: number): number {
  return Math.max(
    0,
    Math.min(1, CO_OCCUR_WEIGHT * co + SEMANTIC_WEIGHT * semantic),
  );
}

/**
 * 从摘要生成补充关键词（填满单篇上限剩余名额）
 */
export async function generateKeywordsFromAbstract(input: {
  settings: AiSettingsDraft;
  title: string;
  abstract: string | null;
  existingPdfKeywords: string[];
  /** 还可再补几个（通常 = 5 - 已有原文词数） */
  maxCount: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const { settings, title, abstract, existingPdfKeywords, maxCount, signal } =
    input;
  if (!abstract?.trim() || maxCount <= 0) return [];

  const raw = await chatCompletion({
    settings,
    messages: [
      {
        role: 'system',
        content: [
          '你是学术关键词抽取助手。',
          '根据论文摘要生成补充关键词（中文为主，可含必要英文缩写）。',
          '不要重复已有关键词。',
          `最多输出 ${maxCount} 个（可以更少）。`,
          '只输出 JSON 字符串数组，例如 ["词A","词B"]，不要其它文字。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `标题: ${title}`,
          `已有关键词: ${existingPdfKeywords.join('；') || '（无）'}`,
          `摘要: ${abstract.slice(0, 1500)}`,
          `请最多补充 ${maxCount} 个关键词。`,
        ].join('\n'),
      },
    ],
    maxTokens: 512,
    signal,
  });

  const arr = parseJsonArray(raw);
  const out: string[] = [];
  const seen = new Set(existingPdfKeywords.map(normalizeKeywordKey));
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const t = item.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 40) continue;
    const key = normalizeKeywordKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= maxCount) break;
  }
  return out;
}

export interface KeywordCluster {
  /** 展示用 canonical（原文优先） */
  label: string;
  aliases: string[];
  /** 若并入已有节点则带 id */
  existingId: string | null;
  /** 是否视为「本篇新引入」的簇（用于词间建边） */
  isNewForPaper: boolean;
}

/**
 * 将近义词合并：原文写法优先作 label；可并入全局已有节点
 */
export async function mergeKeywordClusters(input: {
  settings: AiSettingsDraft;
  pdfKeywords: string[];
  aiKeywords: string[];
  existing: KeywordNode[];
  signal?: AbortSignal;
}): Promise<KeywordCluster[]> {
  const { settings, pdfKeywords, aiKeywords, existing, signal } = input;
  const pdfSet = new Set(pdfKeywords.map(normalizeKeywordKey));

  // 无候选时直接返回空
  const candidates = [...pdfKeywords, ...aiKeywords];
  if (candidates.length === 0) return [];

  // 无已有词且候选少：本地精确去重即可
  if (existing.length === 0) {
    const map = new Map<string, KeywordCluster>();
    for (const c of candidates) {
      const key = normalizeKeywordKey(c);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          label: c,
          aliases: [],
          existingId: null,
          isNewForPaper: true,
        });
      } else if (pdfSet.has(key)) {
        prev.label = c; // 原文优先
      } else if (prev.label !== c && !prev.aliases.includes(c)) {
        prev.aliases.push(c);
      }
    }
    return [...map.values()];
  }

  const raw = await chatCompletion({
    settings,
    messages: [
      {
        role: 'system',
        content: [
          '你是学术关键词归一助手。',
          '将「本篇候选词」与「全局已有词」做近义合并。',
          '输出 JSON 数组，每项：',
          '{"label":"展示名","aliases":["别名"],"existingId":"已有节点id或null","members":["归入该簇的本篇候选"]}',
          '规则：',
          '1. label 优先使用来自 PDF 原文的写法（members 里标记为 pdf 的）。',
          '2. 若与已有词近义，existingId 必须是已有 id；否则 null。',
          '3. 不要编造未给出的 existingId。',
          '4. 只输出 JSON 数组。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          pdfKeywords,
          aiKeywords,
          existing: existing.map((e) => ({
            id: e.id,
            label: e.label,
            aliases: e.aliases,
          })),
        }),
      },
    ],
    maxTokens: 2048,
    signal,
  });

  const arr = parseJsonArray(raw);
  const existingIds = new Set(existing.map((e) => e.id));
  const clusters: KeywordCluster[] = [];
  const covered = new Set<string>();

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const members = Array.isArray(rec.members)
      ? rec.members.filter((m): m is string => typeof m === 'string')
      : [];
    let label =
      typeof rec.label === 'string' ? rec.label.trim() : members[0] ?? '';
    if (!label) continue;
    // 原文优先：若 members 中有 pdf 词，用 pdf 写法
    for (const m of members) {
      if (pdfSet.has(normalizeKeywordKey(m))) {
        label = m.trim();
        break;
      }
    }
    const aliases = Array.isArray(rec.aliases)
      ? rec.aliases.filter((a): a is string => typeof a === 'string' && a !== label)
      : [];
    let existingId =
      typeof rec.existingId === 'string' ? rec.existingId : null;
    if (existingId && !existingIds.has(existingId)) existingId = null;

    for (const m of members) covered.add(normalizeKeywordKey(m));
    covered.add(normalizeKeywordKey(label));

    clusters.push({
      label,
      aliases: [...new Set(aliases.map((a) => a.trim()).filter(Boolean))],
      existingId,
      isNewForPaper: true,
    });
  }

  // 兜底：未被模型覆盖的候选
  for (const c of candidates) {
    const key = normalizeKeywordKey(c);
    if (covered.has(key)) continue;
    const hit = existing.find(
      (e) =>
        normalizeKeywordKey(e.label) === key ||
        e.aliases.some((a) => normalizeKeywordKey(a) === key),
    );
    clusters.push({
      label: hit && pdfSet.has(key) ? c : (hit?.label ?? c),
      aliases: hit && pdfSet.has(key) && hit.label !== c ? [hit.label] : [],
      existingId: hit?.id ?? null,
      isNewForPaper: true,
    });
  }

  return clusters;
}

/**
 * 本篇最终保留 ≤ max 个簇：原文词优先，再补 AI 词
 */
export function selectClustersForPaper(
  clusters: KeywordCluster[],
  pdfKeywords: string[],
  max: number = MAX_KEYWORDS_PER_PAPER,
): KeywordCluster[] {
  if (clusters.length <= max) return clusters;
  const pdfSet = new Set(pdfKeywords.map(normalizeKeywordKey));
  const pdfFirst: KeywordCluster[] = [];
  const rest: KeywordCluster[] = [];
  for (const c of clusters) {
    if (pdfSet.has(normalizeKeywordKey(c.label))) pdfFirst.push(c);
    else rest.push(c);
  }
  return [...pdfFirst, ...rest].slice(0, max);
}

/**
 * 本地共现建边：本篇词两两必有共现；新词↔旧词若共享论文也建边。
 * 无语义分时用中性默认语义，保证同篇 ≥2 词即有可见边。
 */
export function buildCoOccurrenceEdges(input: {
  keywordsById: Map<string, { id: string; paperNodeIds: string[] }>;
  /** 本篇挂接的全部词 id */
  currentPaperKeywordIds: string[];
  /** 同步前已有的旧词 id（可为空，第一篇时仅同篇共现） */
  existingKeywordIds: string[];
}): KeywordEdge[] {
  const { keywordsById, currentPaperKeywordIds, existingKeywordIds } = input;
  const edgeMap = new Map<string, KeywordEdge>();

  const upsert = (a: string, b: string, weight: number) => {
    if (a === b || weight < KEYWORD_EDGE_MIN_WEIGHT) return;
    const key = edgeKey(a, b);
    const prev = edgeMap.get(key);
    if (!prev || weight > prev.weight) {
      edgeMap.set(key, { source: a, target: b, weight });
    }
  };

  // 1) 本篇词两两：同篇共现
  for (let i = 0; i < currentPaperKeywordIds.length; i++) {
    for (let j = i + 1; j < currentPaperKeywordIds.length; j++) {
      const idA = currentPaperKeywordIds[i]!;
      const idB = currentPaperKeywordIds[j]!;
      const a = keywordsById.get(idA);
      const b = keywordsById.get(idB);
      if (!a || !b) continue;
      const co = coOccurrenceScore(a.paperNodeIds, b.paperNodeIds);
      if (co <= 0) continue;
      upsert(idA, idB, combinedWeight(co, DEFAULT_SEMANTIC_WHEN_COOCCUR));
    }
  }

  // 2) 本篇词 ↔ 旧词：仅当跨篇共现（共享 ≥1 论文）
  const currentSet = new Set(currentPaperKeywordIds);
  for (const curId of currentPaperKeywordIds) {
    const cur = keywordsById.get(curId);
    if (!cur) continue;
    for (const oldId of existingKeywordIds) {
      if (currentSet.has(oldId)) continue;
      const old = keywordsById.get(oldId);
      if (!old) continue;
      const co = coOccurrenceScore(cur.paperNodeIds, old.paperNodeIds);
      if (co <= 0) continue;
      upsert(curId, oldId, combinedWeight(co, DEFAULT_SEMANTIC_WHEN_COOCCUR));
    }
  }

  return [...edgeMap.values()];
}

/**
 * AI：对候选词对打语义相似度，并与共现分综合成边权。
 * 若 AI 失败或返回空，调用方应保留本地共现边。
 */
export async function suggestKeywordEdgesWithAi(input: {
  settings: AiSettingsDraft;
  keywords: Array<{
    id: string;
    label: string;
    paperNodeIds: string[];
  }>;
  /** 本篇最终挂接的全部关键词 id */
  currentPaperKeywordIds: string[];
  /** 同步前旧词 id */
  existingKeywordIds: string[];
  currentPaperTitle?: string;
  signal?: AbortSignal;
}): Promise<KeywordEdge[]> {
  const {
    settings,
    keywords,
    currentPaperKeywordIds,
    existingKeywordIds,
    currentPaperTitle,
    signal,
  } = input;

  if (currentPaperKeywordIds.length < 2 && existingKeywordIds.length === 0) {
    return [];
  }

  const byId = new Map(keywords.map((k) => [k.id, k]));
  const currentSet = new Set(currentPaperKeywordIds);

  // 候选对：本篇两两 + 本篇↔旧词（全量，供语义判定；共现写在 pairsHint）
  type PairHint = {
    source: string;
    target: string;
    coOccurScore: number;
    sharedPaperCount: number;
    samePaper: boolean;
  };
  const pairsHint: PairHint[] = [];
  const seenPair = new Set<string>();

  const pushPair = (idA: string, idB: string) => {
    if (idA === idB) return;
    const key = edgeKey(idA, idB);
    if (seenPair.has(key)) return;
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (!a || !b) return;
    seenPair.add(key);
    const bSet = new Set(b.paperNodeIds);
    const shared = a.paperNodeIds.filter((p) => bSet.has(p)).length;
    pairsHint.push({
      source: idA,
      target: idB,
      coOccurScore: coOccurrenceScore(a.paperNodeIds, b.paperNodeIds),
      sharedPaperCount: shared,
      samePaper: currentSet.has(idA) && currentSet.has(idB),
    });
  };

  for (let i = 0; i < currentPaperKeywordIds.length; i++) {
    for (let j = i + 1; j < currentPaperKeywordIds.length; j++) {
      pushPair(currentPaperKeywordIds[i]!, currentPaperKeywordIds[j]!);
    }
  }
  for (const curId of currentPaperKeywordIds) {
    for (const oldId of existingKeywordIds) {
      if (currentSet.has(oldId)) continue;
      pushPair(curId, oldId);
    }
  }

  // 候选过多时优先保留有共现的对，再截断，控制提示词体积
  pairsHint.sort((a, b) => b.coOccurScore - a.coOccurScore);
  const pairsForPrompt = pairsHint.slice(0, 40);

  if (pairsForPrompt.length === 0) return [];

  const labelById = Object.fromEntries(keywords.map((k) => [k.id, k.label]));

  const raw = await chatCompletion({
    settings,
    messages: [
      {
        role: 'system',
        content: [
          '你是学术关键词图谱建边助手。',
          '对给定候选词对，估计学术概念上的语义相似度 semanticScore（0–1）。',
          '',
          '评分参考：',
          '- 1.0 近义/同一概念；0.7–0.9 强相关（上下位、方法-对象）；',
          '- 0.4–0.6 同领域弱相关；0–0.3 几乎无关',
          '',
          '注意：',
          '- 同篇共现（samePaper=true）且语义相关时，semanticScore 宜 ≥ 0.5',
          '- 语义远（<0.3）即使有共现也可给低分',
          '- 只评估给出的 pairs；不要编造 id',
          '',
          '只输出 JSON 数组：',
          '[{"source":"id","target":"id","semanticScore":0到1}]',
          '不要输出解释、Markdown 或代码围栏；最多 20 条（优先高相关）。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentPaperTitle: currentPaperTitle ?? null,
          labels: labelById,
          pairs: pairsForPrompt,
        }),
      },
    ],
    maxTokens: 2048,
    signal,
  });

  const validIds = new Set(keywords.map((k) => k.id));
  const edges: KeywordEdge[] = [];
  for (const item of parseJsonArray(raw)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const source = String(rec.source ?? '');
    const target = String(rec.target ?? '');
    if (!source || !target || source === target) continue;
    if (!validIds.has(source) || !validIds.has(target)) continue;

    let semantic = Number(rec.semanticScore);
    if (!Number.isFinite(semantic)) {
      // 兼容旧格式 weight 字段
      const legacy = Number(rec.weight);
      if (!Number.isFinite(legacy)) continue;
      semantic = legacy;
    }
    semantic = Math.max(0, Math.min(1, semantic));

    const a = byId.get(source)!;
    const b = byId.get(target)!;
    const co = coOccurrenceScore(a.paperNodeIds, b.paperNodeIds);
    const w = combinedWeight(co, semantic);
    if (w < KEYWORD_EDGE_MIN_WEIGHT) continue;
    edges.push({ source, target, weight: w });
  }
  return edges;
}

/** 合并两边：同无向对取较大 weight */
export function mergeKeywordEdges(
  ...lists: KeywordEdge[][]
): KeywordEdge[] {
  const map = new Map<string, KeywordEdge>();
  for (const list of lists) {
    for (const e of list) {
      const key = edgeKey(e.source, e.target);
      const prev = map.get(key);
      if (!prev || e.weight > prev.weight) map.set(key, e);
    }
  }
  return [...map.values()];
}
