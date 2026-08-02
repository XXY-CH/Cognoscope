/** evidenceAnalysisParse - 校验二次分析 JSON，并锁定其矩阵行引用。 */
import type {
  EvidenceAnalysisItem,
  EvidenceAnalysisSection,
  EvidenceRow,
  EvidenceVerificationState,
} from '../types';
import { createId } from './id';

export interface EvidenceAnalysisParseResult {
  items: EvidenceAnalysisItem[];
  warnings: string[];
}

function parseJsonArray(raw: string): unknown[] {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) text = fenced[1].trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('模型返回的分析结果不是数组');
  return value;
}

function sectionOf(value: unknown): EvidenceAnalysisSection | null {
  return value === 'findings' || value === 'limitations' || value === 'gaps' ? value : null;
}

function normalizeIds(value: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && validIds.has(id)))].slice(0, 8);
}

/** 解析结果默认为 proposed；无有效矩阵行引用的对象进入 unresolved。 */
export function parseEvidenceAnalysis(input: {
  raw: string;
  rows: EvidenceRow[];
  analysisId: string;
  now?: string;
}): EvidenceAnalysisParseResult {
  const now = input.now ?? new Date().toISOString();
  const verifiedIds = new Set(
    input.rows.filter((row) => row.verification === 'verified').map((row) => row.id),
  );
  const warnings: string[] = [];
  let parsed: unknown[];
  try {
    parsed = parseJsonArray(input.raw);
  } catch {
    throw new Error('无法解析模型返回的分析 JSON');
  }

  const items: EvidenceAnalysisItem[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed.slice(0, 12)) {
    if (!candidate || typeof candidate !== 'object') {
      warnings.push('跳过格式错误的分析项');
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const section = sectionOf(record.section);
    const statement = typeof record.statement === 'string'
      ? record.statement.trim().slice(0, 1200)
      : '';
    const rationale = typeof record.rationale === 'string'
      ? record.rationale.trim().slice(0, 1600)
      : '';
    const rowIds = normalizeIds(record.rowIds, verifiedIds);
    if (!section || !statement) {
      warnings.push('跳过缺少栏目或判断文本的分析项');
      continue;
    }
    const key = `${section}:${statement.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      warnings.push(`跳过重复分析项：${statement.slice(0, 40)}`);
      continue;
    }
    seen.add(key);
    const verification: EvidenceVerificationState = rowIds.length > 0 ? 'proposed' : 'unresolved';
    if (rowIds.length === 0) warnings.push(`分析项没有有效矩阵行引用：${statement.slice(0, 40)}`);
    items.push({
      id: createId('evidence-analysis-item'),
      analysisId: input.analysisId,
      section,
      statement,
      rationale,
      rowIds,
      originalProposal: statement,
      verification,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { items, warnings };
}
