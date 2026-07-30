/**
 * pdfOutline.ts - 从 PDF 文本字体大小推断大纲
 * 所属：E · 阅读界面 > TocPanel
 * 策略：字体显著大于正文的文本行视为标题，按字号分层层级
 */
import type { PDFDocumentProxy } from './pdfjs';
import type { PdfOutlineItem } from '../types';

/** 标题候选的字体高度相对正文字号的最小倍率 */
const HEADING_HEIGHT_RATIO = 1.2;
/** 同行 Y 坐标容差（PDF 坐标系，单位 pt） */
const Y_TOLERANCE = 2;
/** 标题文本最小字符数（过滤页码等短串） */
const MIN_TITLE_LENGTH = 2;
/** 每页最大处理文本项数（安全阀） */
const MAX_ITEMS_PER_PAGE = 500;
/** 全文最大处理页数 */
const MAX_PAGES = 200;

interface RawItem {
  str: string;
  height: number;
  x: number;
  y: number;
  page: number;
}

/**
 * 从 PDFDocumentProxy 提取基于字体大小的文本大纲。
 * 只处理前 MAX_PAGES 页，避免超大文档阻塞。
 */
export async function extractPdfOutline(
  pdf: PDFDocumentProxy,
  totalPages: number,
): Promise<PdfOutlineItem[]> {
  const limit = Math.min(totalPages, MAX_PAGES);
  const allItems: RawItem[] = [];

  // 逐页收集文本项
  for (let p = 1; p <= limit; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let count = 0;
    for (const item of tc.items) {
      if (count >= MAX_ITEMS_PER_PAGE) break;
      if (!item || typeof item !== 'object' || !('str' in item)) continue;
      const str = (item.str ?? '').trim();
      if (!str) continue;
      const height = typeof item.height === 'number' ? item.height : 0;
      if (height <= 0) continue;
      const transform = item.transform as number[] | undefined;
      const x = transform?.[4] ?? 0;
      const y = transform?.[5] ?? 0;
      allItems.push({ str, height, x, y, page: p });
      count++;
    }
  }

  if (allItems.length === 0) return [];

  // 找正文字号众数
  const bodyHeight = findBodyHeight(allItems);
  if (bodyHeight === null) return [];

  // 筛选标题候选：字号 > 正文字号 × 倍率，且文本足够长
  const headingThreshold = bodyHeight * HEADING_HEIGHT_RATIO;
  const candidates = allItems.filter(
    (it) => it.height > headingThreshold && it.str.length >= MIN_TITLE_LENGTH,
  );

  if (candidates.length === 0) return [];

  // 按页、Y 坐标排序
  candidates.sort((a, b) => a.page - b.page || b.y - a.y);

  // 合并同行（或相近行）的标题候选为单条
  const merged = mergeAdjacent(candidates);

  // 按字号分层层级
  return assignLevels(merged);
}

/**
 * 找正文高度：将字号按相近值分桶，取最大桶的中位数。
 */
function findBodyHeight(items: RawItem[]): number | null {
  const heights = items.map((it) => it.height).sort((a, b) => a - b);
  if (heights.length === 0) return null;

  // 简单分桶：以 0.5pt 为间隔
  const buckets = new Map<number, number[]>();
  for (const h of heights) {
    const key = Math.round(h * 2) / 2; // 0.5pt 精度
    const arr = buckets.get(key) ?? [];
    arr.push(h);
    buckets.set(key, arr);
  }

  let best: number[] = [];
  for (const arr of buckets.values()) {
    if (arr.length > best.length) best = arr;
  }

  if (best.length === 0) return null;
  best.sort((a, b) => a - b);
  return best[Math.floor(best.length / 2)] ?? null;
}

/**
 * 合并 Y 坐标接近的相邻标题项。
 * 同一标题可能被 PDF 拆成多个 TextItem（如中文逐字）。
 */
function mergeAdjacent(items: RawItem[]): RawItem[] {
  const result: RawItem[] = [];
  for (const item of items) {
    const last = result[result.length - 1];
    if (
      last &&
      last.page === item.page &&
      Math.abs(last.y - item.y) <= Y_TOLERANCE
    ) {
      // 合并到上一行：按 X 顺序拼接
      if (item.x < last.x) {
        last.str = item.str + last.str;
      } else {
        last.str = last.str + item.str;
      }
      // 取较大字号作为合并后的字号
      if (item.height > last.height) last.height = item.height;
    } else {
      result.push({ ...item });
    }
  }
  return result;
}

/**
 * 按字号分层层级：字号越大层级越小（越顶层）。
 * 用 k-means 风格简化：将字号排序后找自然断点。
 */
function assignLevels(items: RawItem[]): PdfOutlineItem[] {
  if (items.length === 0) return [];

  // 收集去重字号并排序（大→小）
  const heights = [...new Set(items.map((it) => it.height))].sort(
    (a, b) => b - a,
  );

  // 相邻字号差距 > 1pt 视为层级分界
  const thresholds: number[] = [];
  for (let i = 0; i < heights.length - 1; i++) {
    if (heights[i] - heights[i + 1] > 1) {
      thresholds.push((heights[i] + heights[i + 1]) / 2);
    }
  }

  return items.map((item) => {
    let level = 0;
    for (const t of thresholds) {
      if (item.height > t) break;
      level++;
    }
    // 避免标题文本过长
    const title = item.str.length > 80 ? item.str.slice(0, 80) + '…' : item.str;
    return { title, page: item.page, level };
  });
}
