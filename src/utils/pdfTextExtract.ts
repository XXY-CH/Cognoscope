/**
 * pdfTextExtract.ts - 从 PDF 抽取纯文字稿（供整理习得 / AI 上下文）
 * 所属：E · 阅读界面
 * 规范参考：HANDOFF.md §5；限制页数与字数以免撑爆上下文
 */
import type { PDFDocumentProxy } from './pdfjs';
import { loadPdfDocument } from './pdfjs';

/** 最多抽取页数 */
const MAX_PAGES = 80;
/** 单页最多文本项 */
const MAX_ITEMS_PER_PAGE = 800;
/** 全文最大字符数（超出截断并标注） */
export const PDF_TRANSCRIPT_MAX_CHARS = 48_000;

export interface PdfTranscriptResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

/**
 * 将 PDF.js TextContent 项拼成可读段落（按 Y 接近合并同行）
 */
function itemsToPageText(
  items: Array<{ str?: string; transform?: number[] }>,
): string {
  type Line = { y: number; parts: string[] };
  const lines: Line[] = [];
  const yTol = 2.5;

  for (const item of items) {
    const str = (item.str ?? '').replace(/\s+/g, ' ').trim();
    if (!str) continue;
    const y = item.transform?.[5] ?? 0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) <= yTol) {
      last.parts.push(str);
    } else {
      lines.push({ y, parts: [str] });
    }
  }

  // PDF 坐标系 Y 向上，同页内按 y 降序更接近阅读顺序
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => l.parts.join(' ')).join('\n');
}

/**
 * 从已加载的 PDFDocumentProxy 抽取文字稿
 */
export async function extractPdfTranscriptFromDoc(
  pdf: PDFDocumentProxy,
  maxChars = PDF_TRANSCRIPT_MAX_CHARS,
): Promise<PdfTranscriptResult> {
  const total = pdf.numPages;
  const limit = Math.min(total, MAX_PAGES);
  const chunks: string[] = [];
  let used = 0;
  let truncated = false;

  for (let p = 1; p <= limit; p++) {
    if (used >= maxChars) {
      truncated = true;
      break;
    }
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rawItems: Array<{ str?: string; transform?: number[] }> = [];
    let count = 0;
    for (const item of tc.items) {
      if (count >= MAX_ITEMS_PER_PAGE) break;
      if (!item || typeof item !== 'object') continue;
      rawItems.push(item as { str?: string; transform?: number[] });
      count++;
    }
    const pageText = itemsToPageText(rawItems).trim();
    if (!pageText) continue;

    const header = `\n\n--- 第 ${p} 页 ---\n`;
    const remain = maxChars - used;
    const block = header + pageText;
    if (block.length <= remain) {
      chunks.push(block);
      used += block.length;
    } else {
      chunks.push(block.slice(0, remain));
      used = maxChars;
      truncated = true;
      break;
    }
  }

  if (limit < total) truncated = true;

  return {
    text: chunks.join('').trim(),
    pageCount: limit,
    truncated,
  };
}

/**
 * 从 ArrayBuffer 加载 PDF 并抽取文字稿
 */
export async function extractPdfTranscriptFromBuffer(
  data: ArrayBuffer,
  signal?: AbortSignal,
): Promise<PdfTranscriptResult> {
  const pdf = await loadPdfDocument(data, { signal });
  try {
    return await extractPdfTranscriptFromDoc(pdf);
  } finally {
    void pdf.destroy();
  }
}
