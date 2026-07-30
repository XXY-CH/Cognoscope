/**
 * pdfTextLines.ts - 从 PDF.js TextContent 按行分组，生成稳定行键
 * 所属：E · 阅读界面 > 已读行数（§8.5）
 * 规范参考：UI_spec.md §8.5 — 同一行不重复计数；重排用稳定键避免跳变
 */

/** 精简 TextContent 形状，避免深路径 type import */
export interface PdfTextContentLike {
  items: Array<unknown>;
}

interface TextItemLike {
  str: string;
  transform: number[];
}

function isTextItem(item: unknown): item is TextItemLike {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  return typeof o.str === 'string' && Array.isArray(o.transform);
}

/**
 * 将一页 TextContent 按 Y 坐标聚类为行，返回稳定行键 `p{page}-l{index}`
 * 行序与缩放无关：基于 PDF 用户空间坐标，字号变化时键不变
 */
export function buildPdfLineKeys(
  pageNumber: number,
  textContent: PdfTextContentLike,
): string[] {
  const rows: { y: number; texts: string[] }[] = [];
  // PDF 坐标系 Y 向上；同一行允许小幅抖动
  const Y_TOLERANCE = 2.5;

  for (const raw of textContent.items) {
    if (!isTextItem(raw) || !raw.str.trim()) continue;
    const y = raw.transform[5] ?? 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, texts: [] };
      rows.push(row);
    }
    row.texts.push(raw.str);
  }

  // 从上到下（PDF Y 大 → 小）排序，保证行号稳定
  rows.sort((a, b) => b.y - a.y);
  return rows.map((_, i) => `p${pageNumber}-l${i}`);
}

/**
 * 按字符进度等比映射已读行数，避免重排后数值跳变（§8.5）
 */
export function remapLinesByCharProgress(
  previousRead: number,
  previousTotal: number,
  nextTotal: number,
): number {
  if (nextTotal <= 0) return 0;
  if (previousTotal <= 0) return Math.min(previousRead, nextTotal);
  const ratio = Math.min(1, previousRead / previousTotal);
  return Math.round(ratio * nextTotal);
}
