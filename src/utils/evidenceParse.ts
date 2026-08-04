/**
 * evidenceParse - 将不可信的模型 JSON 变成可编辑、可追溯的矩阵行。
 * 任何不能和本地材料确定匹配的摘录都会保留为 unresolved。
 */
import type {
  EvidenceItem,
  EvidenceLocator,
  EvidenceRow,
  EvidenceType,
  FileType,
} from '../types';
import { createId } from './id';
import {
  locatorFromAnnotation,
  matchEvidenceExcerpt,
  normalizeEvidenceText,
} from './evidenceMatch';
import type { EvidenceSourceInput } from './evidenceInput';

export interface EvidenceParseResult {
  rows: EvidenceRow[];
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
  if (!Array.isArray(value)) throw new Error('模型返回的证据结果不是数组');
  return value;
}

function finiteOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseLocator(value: unknown): EvidenceLocator | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'pdf-page') {
    const page = finiteOrNull(record.page);
    if (page == null || page < 1) return null;
    return {
      kind: 'pdf-page',
      page: Math.max(1, Math.round(page)),
      anchor: typeof record.anchor === 'string' ? record.anchor : null,
    };
  }
  if (record.kind === 'epub-cfi') {
    return {
      kind: 'epub-cfi',
      cfi: typeof record.cfi === 'string' ? record.cfi : null,
      location: finiteOrNull(record.location),
      sectionIndex: finiteOrNull(record.sectionIndex),
    };
  }
  if (record.kind === 'unresolved') {
    const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
    if (!reason) return null;
    return { kind: 'unresolved', reason: reason.slice(0, 240) };
  }
  return null;
}

function unresolvedLocator(reason: string): EvidenceLocator {
  return { kind: 'unresolved', reason: reason.slice(0, 240) };
}

function parseEvidenceType(value: unknown): EvidenceType {
  return value === 'support' ||
    value === 'refute' ||
    value === 'condition' ||
    value === 'limitation' ||
    value === 'method' ||
    value === 'data'
    ? value
    : 'unknown';
}

function expectedLocatorKind(fileType: FileType): 'pdf-page' | 'epub-cfi' | null {
  if (fileType === 'pdf') return 'pdf-page';
  if (fileType === 'epub') return 'epub-cfi';
  return null;
}

function normalizeAiLocator(
  locator: EvidenceLocator | null,
  source: EvidenceSourceInput,
  annotation: EvidenceSourceInput['annotations'][number] | null,
): EvidenceLocator {
  if (source.file.type === 'folder') {
    return unresolvedLocator('文件夹不支持证据定位');
  }
  if (annotation) {
    const annotationLocator = locatorFromAnnotation(source.file.type, annotation);
    if (
      annotationLocator.kind === 'unresolved' &&
      locator != null &&
      locator.kind !== 'unresolved'
    ) {
      return locator;
    }
    return annotationLocator;
  }
  if (!locator) return unresolvedLocator('模型未提供可验证的来源定位');
  if (locator.kind === 'unresolved') return locator;
  const expected = expectedLocatorKind(source.file.type);
  if (expected == null || locator.kind !== expected) {
    return unresolvedLocator('来源定位类型与文件阅读器不匹配');
  }
  if (locator.kind === 'epub-cfi') {
    const usable = Boolean(locator.cfi) || locator.location != null;
    return usable ? locator : unresolvedLocator('EPUB 定位缺少 CFI 或 location');
  }
  return locator;
}

/** 解析并校验模型返回的候选行。 */
export function parseEvidenceProposals(input: {
  raw: string;
  sources: EvidenceSourceInput[];
  now?: string;
}): EvidenceParseResult {
  const now = input.now ?? new Date().toISOString();
  const sourceById = new Map(input.sources.map((source) => [source.file.id, source]));
  const warnings: string[] = [];
  let parsed: unknown[];
  try {
    parsed = parseJsonArray(input.raw);
  } catch {
    throw new Error('无法解析模型返回的 JSON 证据结果');
  }

  const rows: EvidenceRow[] = [];
  const seenConclusions = new Set<string>();
  for (const candidate of parsed.slice(0, 8)) {
    if (!candidate || typeof candidate !== 'object') {
      warnings.push('跳过格式错误的结论行');
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const conclusion = typeof record.conclusion === 'string'
      ? record.conclusion.trim().slice(0, 1000)
      : '';
    if (!conclusion) {
      warnings.push('跳过没有结论文本的行');
      continue;
    }
    const conclusionKey = normalizeEvidenceText(conclusion);
    if (seenConclusions.has(conclusionKey)) {
      warnings.push(`跳过重复结论：${conclusion.slice(0, 40)}`);
      continue;
    }
    seenConclusions.add(conclusionKey);

    const rowId = createId('evidence-row');
    const evidence: EvidenceItem[] = [];
    const rawEvidence = Array.isArray(record.evidence) ? record.evidence : [];
    for (const rawItem of rawEvidence.slice(0, 6)) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as Record<string, unknown>;
      const fileId = typeof item.fileId === 'string' ? item.fileId : '';
      const source = sourceById.get(fileId);
      if (!source) {
        warnings.push(`证据引用了未选择的文件：${fileId || '未知'}`);
        continue;
      }
      const quotedText = typeof item.quotedText === 'string'
        ? item.quotedText.trim().slice(0, 4000)
        : '';
      const note = typeof item.note === 'string' ? item.note.trim().slice(0, 1000) : '';
      const evidenceType = parseEvidenceType(item.evidenceType);
      const condition = typeof item.condition === 'string' ? item.condition.trim().slice(0, 1000) : null;
      const method = typeof item.method === 'string' ? item.method.trim().slice(0, 1000) : null;
      const dataset = typeof item.dataset === 'string' ? item.dataset.trim().slice(0, 1000) : null;
      const match = matchEvidenceExcerpt({
        quotedText,
        annotations: source.annotations,
        transcript: source.transcript,
      });
      const locator = normalizeAiLocator(
        parseLocator(item.locator),
        source,
        match.annotation,
      );
      const supportOk = Boolean(quotedText) && match.method !== 'none';
      const locatorOk = locator.kind !== 'unresolved';
      if (!supportOk) {
        warnings.push(`证据摘录未在本地材料中匹配：${source.file.name}`);
      }
      if (!locatorOk) {
        warnings.push(`证据定位需要复核：${source.file.name}`);
      }
      evidence.push({
        id: createId('evidence-item'),
        rowId,
        fileId,
        annotationId: match.annotation?.id ?? null,
        annotationBody: match.annotation?.body ?? null,
        quotedText,
        note,
        locator: supportOk ? locator : unresolvedLocator('摘录未匹配本地批注或文字稿'),
        provenance: match.annotation ? 'mixed' : 'ai',
        originalProposal: quotedText || null,
        match: match.method,
        verification: supportOk && locatorOk ? 'proposed' : 'unresolved',
        evidenceType,
        condition,
        method,
        dataset,
      });
    }

    const verifiedReady = evidence.length > 0 && evidence.every(
      (item) => item.match !== 'none' && item.locator.kind !== 'unresolved',
    );
    rows.push({
      id: rowId,
      matrixId: '',
      conclusion,
      originalProposal: conclusion,
      evidence,
      verification: verifiedReady ? 'proposed' : 'unresolved',
      createdAt: now,
      updatedAt: now,
    });
  }

  return { rows, warnings };
}
