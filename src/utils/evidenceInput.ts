/**
 * evidenceInput - 组装跨论文比较的本地输入。
 * 批注优先，文字稿受每篇与总量双重限制，所有内容留在浏览器本地。
 */
import { listAnnotationsByFile } from '../db/annotations';
import { getFileDocMetas } from '../db/fileDocMeta';
import type { Annotation, FileDocMeta, FileNode } from '../types';
import { loadDocumentTranscript } from './loadDocumentTranscript';

export const EVIDENCE_PER_PAPER_LIMIT = 24_000;
export const EVIDENCE_TOTAL_LIMIT = 72_000;

export interface EvidenceSourceInput {
  file: FileNode;
  meta: FileDocMeta | null;
  annotations: Annotation[];
  transcript: string;
  transcriptTruncated: boolean;
  formattedText: string;
  truncated: boolean;
}

export interface EvidenceInputBundle {
  sources: EvidenceSourceInput[];
  totalChars: number;
  truncated: boolean;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function formatAnnotations(annotations: Annotation[]): string {
  const meaningful = annotations.filter(
    (item) => item.body.trim() || (item.quotedText?.trim() ?? ''),
  );
  if (meaningful.length === 0) return '批注：无';
  return meaningful
    .map((item, index) => {
      const quote = item.quotedText?.trim() || '（无划词原文）';
      const body = item.body.trim() || '（无批注正文）';
      return `批注 ${index + 1} [${item.id}] 页/章节 ${item.page}\n原文：${quote}\n笔记：${body}`;
    })
    .join('\n\n');
}

function formatMeta(meta: FileDocMeta | null): string {
  if (!meta) return '摘要：无\n关键词：无';
  const abstract = meta.abstract?.trim() || '无';
  const keywords = meta.keywords.length ? meta.keywords.join('；') : '无';
  return `摘要：${abstract}\n关键词：${keywords}`;
}

function formatSource(
  file: FileNode,
  meta: FileDocMeta | null,
  annotations: Annotation[],
  transcript: string,
  transcriptTruncated: boolean,
): string {
  const transcriptLabel = transcript
    ? `本地文字稿${transcriptTruncated ? '（已截断）' : ''}：\n${transcript}`
    : '本地文字稿：不可用（可使用批注和元数据）';
  return [
    `论文 fileId=${file.id}`,
    `标题：${file.name}`,
    formatAnnotations(annotations),
    formatMeta(meta),
    transcriptLabel,
  ].join('\n\n');
}

function trimSource(
  text: string,
  limit: number,
): { text: string; truncated: boolean } {
  if (limit <= 0) return { text: '', truncated: text.length > 0 };
  if (text.length <= limit) return { text, truncated: false };
  return {
    text: `${text.slice(0, Math.max(0, limit - 24))}\n……（本篇输入已截断）`,
    truncated: true,
  };
}

/** 构建三到五篇本地论文的有界上下文。 */
export async function buildEvidenceInputBundle(
  files: FileNode[],
  signal?: AbortSignal,
): Promise<EvidenceInputBundle> {
  const activeFiles = files.filter((file) => file.type !== 'folder');
  const metas = await getFileDocMetas(activeFiles.map((file) => file.id));
  const metaById = new Map(metas.map((meta) => [meta.fileId, meta]));
  const sources: EvidenceSourceInput[] = [];
  let totalChars = 0;
  let totalTruncated = false;

  for (const [index, file] of activeFiles.entries()) {
    checkAborted(signal);
    const annotations = await listAnnotationsByFile(file.id);
    checkAborted(signal);
    const transcriptResult = await loadDocumentTranscript(file, signal);
    checkAborted(signal);
    const raw = formatSource(
      file,
      metaById.get(file.id) ?? null,
      annotations,
      transcriptResult.text,
      transcriptResult.truncated,
    );
    const remainingPapers = activeFiles.length - index;
    const fairShare = Math.floor(
      Math.max(0, EVIDENCE_TOTAL_LIMIT - totalChars) / remainingPapers,
    );
    const perPaper = trimSource(raw, Math.min(EVIDENCE_PER_PAPER_LIMIT, fairShare));
    const remaining = Math.max(0, EVIDENCE_TOTAL_LIMIT - totalChars);
    const bounded = trimSource(perPaper.text, remaining);
    const truncated = perPaper.truncated || bounded.truncated;
    const formattedText = bounded.text;
    totalChars += formattedText.length;
    totalTruncated ||= truncated;
    sources.push({
      file,
      meta: metaById.get(file.id) ?? null,
      annotations,
      transcript: transcriptResult.text,
      transcriptTruncated: transcriptResult.truncated,
      formattedText,
      truncated,
    });
  }

  return { sources, totalChars, truncated: totalTruncated };
}
