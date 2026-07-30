/**
 * pdfFrontMatter.ts - 从 PDF 文首抽取摘要与关键词
 * 所属：A · 文件目录
 * 策略：仅扫前几页文字层；匹配 Abstract/摘要、Keywords/关键词；无标记则放弃
 */
import { getFileBlob } from '../db/files';
import { loadPdfDocument } from './pdfjs';

/** 文首扫描页数（关键词/摘要通常在前 1–3 页） */
const FRONT_PAGES = 4;
const MAX_ITEMS_PER_PAGE = 1000;
/** 摘要最大保留字数 */
const ABSTRACT_MAX = 2000;
/** 关键词最多条数 */
const KEYWORD_MAX = 12;
/** 摘要最短有效长度（过短视为误匹配） */
const ABSTRACT_MIN = 20;

/** 解析器版本： bump 后强制重抽全部缓存 */
export const FRONT_MATTER_EXTRACTOR_VERSION = 6;

export interface FrontMatterResult {
  keywords: string[];
  abstract: string | null;
}

/**
 * 合并同一行内的 PDF 文本片段：保留空格 item，拉丁字符相邻时补空格
 */
function joinLineParts(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (part === ' ') {
      if (out.length > 0 && !out.endsWith(' ')) out += ' ';
      continue;
    }
    if (!out) {
      out = part;
      continue;
    }
    const left = out.charAt(out.length - 1);
    const right = part.charAt(0);
    // PDF.js 常把英文拆成多个 item 且省略空格
    if (
      /[A-Za-z0-9]/.test(left) &&
      /[A-Za-z0-9]/.test(right) &&
      !out.endsWith(' ')
    ) {
      out += ' ';
    }
    out += part;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/**
 * 将 TextContent 拼成行文本。
 * 保留 PDF.js 阅读顺序与空格；不做整页 Y 重排。
 */
function itemsToText(
  items: Array<{ str?: string; transform?: number[] }>,
): string {
  type Line = { y: number; parts: string[] };
  const lines: Line[] = [];
  const yTol = 3.5;
  for (const item of items) {
    const raw = item.str ?? '';
    if (!raw) continue;
    // 单独空格 item 必须保留，否则中英混排/英文词间空格会丢失
    let str: string;
    if (/^\s+$/.test(raw)) {
      str = ' ';
    } else {
      str = raw.replace(/\s+/g, ' ');
    }
    const y = item.transform?.[5] ?? 0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) <= yTol) {
      last.parts.push(str);
    } else {
      lines.push({ y, parts: [str] });
    }
  }
  return lines.map((l) => joinLineParts(l.parts)).filter(Boolean).join('\n');
}

/**
 * 抽取 PDF 前几页纯文本
 */
async function extractFrontText(fileId: string): Promise<string> {
  const record = await getFileBlob(fileId);
  if (!record?.blob) return '';
  const buffer = await record.blob.arrayBuffer();
  const pdf = await loadPdfDocument(buffer);
  try {
    const limit = Math.min(pdf.numPages, FRONT_PAGES);
    const chunks: string[] = [];
    for (let p = 1; p <= limit; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const raw: Array<{ str?: string; transform?: number[] }> = [];
      let n = 0;
      for (const item of tc.items) {
        if (n >= MAX_ITEMS_PER_PAGE) break;
        if (!item || typeof item !== 'object') continue;
        raw.push(item as { str?: string; transform?: number[] });
        n++;
      }
      const pageText = itemsToText(raw).trim();
      if (pageText) chunks.push(pageText);
    }
    return chunks.join('\n\n');
  } finally {
    void pdf.destroy();
  }
}

/** 归一化空白与全角标点，便于正则（保留词间单空格） */
function normalizeFrontText(raw: string): string {
  return (
    raw
      .replace(/\u00a0/g, ' ')
      .replace(/\u3000/g, ' ') // 全角空格 → 半角
      .replace(/[ \t]+/g, ' ')
      // 知网常见「摘 要」「关 键 词」字间空格压掉（仅针对标签本身）
      .replace(/摘\s*要/g, '摘要')
      .replace(/提\s*要/g, '提要')
      .replace(/关\s*键\s*词/g, '关键词')
      .replace(/关\s*键\s*字/g, '关键字')
      .replace(/中\s*图\s*分\s*类\s*号/g, '中图分类号')
      .replace(/文\s*献\s*标\s*识\s*码/g, '文献标识码')
      .replace(/Key\s*words?/gi, 'Keywords')
      .replace(/Abstract/gi, 'Abstract')
      // 统一 ［］【】[] → 【】
      .replace(/［/g, '【')
      .replace(/］/g, '】')
      .replace(/\[/g, '【')
      .replace(/\]/g, '】')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * 截取到下一个常见章节标题之前（关键词 / 引言等）
 */
function cutAtNextSection(body: string): string {
  const patterns: RegExp[] = [
    /【\s*(?:关键词|关键字|中图分类号|文献标识码)\s*】/,
    /(?:^|\n)\s*【?\s*(?:关键词|关键字|Keywords)\s*】?\s*[：:．.]?/i,
    /(?:^|\n)\s*(?:中图分类号|文献标识码)/,
    /(?:^|\n)\s*(?:引言|绪论|Introduction|References)\b/i,
    /(?:^|\n)\s*[一二三四五六七八九十]+[、．.\s]/,
    /(?:^|\n)\s*1[\.\s　]/,
  ];
  let cutAt = body.length;
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.index != null && m.index > 0 && m.index < cutAt) {
      cutAt = m.index;
    }
  }
  return body.slice(0, cutAt).trim();
}

function parseKeywords(blob: string): string[] {
  const parts = blob
    .split(/[;；,，、|/｜]+/)
    .map((s) => s.replace(/ {2,}/g, ' ').trim())
    .filter(
      (s) =>
        s.length >= 2 &&
        s.length <= 48 &&
        !/^(中图分类号|文献标识码|CLC|UDC)$/i.test(s),
    );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p); // 保留词内空格，如 "collaborative learning"
    if (out.length >= KEYWORD_MAX) break;
  }
  return out;
}

/**
 * 从标记后取出关键词正文（同行，或下一非空行）
 */
function keywordBodyAfterMatch(
  text: string,
  match: RegExpMatchArray,
  groupIndex: number,
): string {
  let raw = (match[groupIndex] ?? '').trim();
  if (raw.length < 2) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    const nextLine = after.match(/^\s*\n+\s*([^\n【]{2,})/);
    raw = nextLine?.[1]?.trim() ?? '';
  }
  return raw
    .replace(/\s*(?:中图分类号|文献标识码|CLC|UDC|【).*$/i, '')
    .trim();
}

/**
 * 仅当文首出现明确的「关键词 / 关键字 / Keywords」标记时才抽取；
 * 无标记 → 空数组
 */
function extractKeywordsStrict(text: string): string[] {
  // 按常见度依次尝试；【关键词】可出现在行内（不强制行首）
  const patterns: RegExp[] = [
    /【\s*(?:关键词|关键字)\s*】\s*([^\n【]*)/,
    /(?:^|[\n\r])\s*(?:关键词|关键字)\s*[：:．.]\s*([^\n]*)/m,
    /(?:^|[\n\r])\s*Keywords\s*[：:．.]\s*([^\n]*)/im,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const raw = keywordBodyAfterMatch(text, m, 1);
    if (raw.length < 2) continue;
    const list = parseKeywords(raw);
    if (list.length > 0) return list;
  }
  return [];
}

/**
 * 从文首文本解析摘要与关键词；无明确标记则对应字段为空
 */
export function parseFrontMatter(rawText: string): FrontMatterResult {
  const text = normalizeFrontText(rawText);
  if (!text) return { keywords: [], abstract: null };

  let abstract: string | null = null;
  const absMatch = text.match(
    /(?:^|[\n\r]|【)\s*(?:摘要|提要|Abstract)\s*[】：:．.\s]+([\s\S]{10,})/i,
  );
  if (absMatch?.[1]) {
    const cut = cutAtNextSection(absMatch[1]);
    // 压缩多余空白，但保留中英文之间的单个空格
    const cleaned = cut.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim();
    if (cleaned.length >= ABSTRACT_MIN) {
      abstract =
        cleaned.length > ABSTRACT_MAX
          ? `${cleaned.slice(0, ABSTRACT_MAX)}…`
          : cleaned;
    }
  }

  const keywords = extractKeywordsStrict(text);
  return { keywords, abstract };
}

/**
 * 对指定 PDF 文件抽取文首摘要/关键词
 */
export async function extractPdfFrontMatter(
  fileId: string,
): Promise<FrontMatterResult> {
  const text = await extractFrontText(fileId);
  return parseFrontMatter(text);
}
