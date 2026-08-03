/**
 * evidenceCitation - 将已确认的证据行格式化为可粘贴到综述草稿的 Markdown。
 * 这里只读本地已确认内容，不触发 AI 请求。
 */
import type { EvidenceRow, FileNode } from '../types';
import { isResolvableLocator } from './graphEvidence';

function locatorLabel(item: EvidenceRow['evidence'][number], fileById: Map<string, FileNode>): string {
  const source = fileById.get(item.fileId);
  const fileLabel = source?.name ?? `文件 ${item.fileId}`;
  const locator = item.locator;
  if (locator.kind === 'pdf-page') return `${fileLabel}，第 ${locator.page} 页`;
  if (locator.kind === 'epub-cfi') {
    if (locator.location != null) return `${fileLabel}，EPUB location ${locator.location}`;
    if (locator.sectionIndex != null) return `${fileLabel}，EPUB 章节 ${locator.sectionIndex}`;
    return `${fileLabel}，EPUB 位置待核对`;
  }
  return `${fileLabel}，${locator.reason}`;
}

function isAvailableFile(file: FileNode | undefined): boolean {
  return file?.deletedAt === null && file.type !== 'folder';
}

/** 只有所有来源仍可回读时，证据行才有资格进入 citation-ready 输出。 */
export function hasAvailableEvidenceSources(
  row: EvidenceRow,
  files: FileNode[],
): boolean {
  const fileById = new Map(files.map((file) => [file.id, file]));
  return row.evidence.length > 0 && row.evidence.every((item) =>
    isAvailableFile(fileById.get(item.fileId)) &&
    isResolvableLocator(item.locator, fileById.get(item.fileId)?.type),
  );
}

/** 最终可复制边界：来源、定位、匹配和每条证据都必须仍然已确认。 */
export function isCitationReadyEvidenceRow(
  row: EvidenceRow,
  files: FileNode[],
): boolean {
  return (
    row.verification === 'verified' &&
    row.evidence.length > 0 &&
    row.evidence.every(
      (item) =>
        item.verification === 'verified' &&
        item.quotedText.trim().length > 0 &&
        item.match !== 'none',
    ) &&
    hasAvailableEvidenceSources(row, files)
  );
}

/** 生成稳定的 citation-ready Markdown。 */
export function formatEvidenceCitation(
  rows: EvidenceRow[],
  files: FileNode[],
): string {
  const fileById = new Map(files.map((file) => [file.id, file]));
  return rows
    .filter((row) => isCitationReadyEvidenceRow(row, files))
    .map((row) => {
      if (row.evidence.length === 0) return '';
      const evidenceText = row.evidence
        .map((evidence) => {
          const annotation = evidence.annotationId
            ? `\n  - 我的批注：${evidence.annotationBody || evidence.note || '（无批注正文）'}`
            : '';
          return `- 来源：${locatorLabel(evidence, fileById)}\n- 原文摘录：> ${evidence.quotedText.replace(/\n/g, '\n> ')}${annotation}`;
        })
        .join('\n');
      return [
        `### ${row.conclusion.trim()}`,
        evidenceText,
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function copyEvidenceCitation(text: string): Promise<void> {
  if (!text.trim()) throw new Error('没有可复制的已确认证据');
  if (!navigator.clipboard?.writeText) {
    throw new Error('当前浏览器不支持剪贴板写入');
  }
  await navigator.clipboard.writeText(text);
}
