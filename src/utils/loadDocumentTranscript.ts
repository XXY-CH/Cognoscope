/**
 * loadDocumentTranscript.ts - 按文件类型加载文献文字稿（供 AI 问答 / 整理习得）
 * 所属：E · 阅读界面
 */
import { getFileBlob } from '../db/files';
import type { FileNode } from '../types';
import { extractPdfTranscriptFromBuffer } from './pdfTextExtract';

export interface DocumentTranscript {
  text: string;
  truncated: boolean;
}

/**
 * 从本机 Blob 抽取文字稿：PDF 走 pdf.js；md/txt 直接读文本；EPUB 暂不抽取
 */
export async function loadDocumentTranscript(
  file: FileNode,
  signal?: AbortSignal,
): Promise<DocumentTranscript> {
  const record = await getFileBlob(file.id);
  if (!record?.blob) {
    return { text: '', truncated: false };
  }

  if (file.type === 'pdf') {
    const buffer = await record.blob.arrayBuffer();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await extractPdfTranscriptFromBuffer(buffer, signal);
    return { text: result.text, truncated: result.truncated };
  }

  if (file.type === 'md' || file.type === 'txt') {
    const text = await record.blob.text();
    const max = 48_000;
    if (text.length > max) {
      return { text: text.slice(0, max), truncated: true };
    }
    return { text, truncated: false };
  }

  // EPUB 等：暂无稳定全文抽取，交由 prompt 侧提示缺失
  return { text: '', truncated: false };
}
