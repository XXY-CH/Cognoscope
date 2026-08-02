/**
 * evidenceMatch - 将模型摘录与本地批注/文字稿做确定性匹配。
 * 只使用规范化后的精确比较，避免把相似但未验证的句子当成证据。
 */
import type { Annotation, EvidenceLocator, EvidenceMatchMethod } from '../types';

export interface EvidenceMatchResult {
  method: EvidenceMatchMethod;
  annotation: Annotation | null;
}

/** 统一空白与大小写，保留文本语义但忽略排版差异。 */
export function normalizeEvidenceText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

/**
 * 先匹配用户已有的划词批注，再匹配受限文字稿。
 * 批注必须整句相等；文字稿允许包含摘录，以兼容 PDF.js 的断行差异。
 */
export function matchEvidenceExcerpt(input: {
  quotedText: string;
  annotations: Annotation[];
  transcript: string;
}): EvidenceMatchResult {
  const target = normalizeEvidenceText(input.quotedText);
  if (!target) return { method: 'none', annotation: null };

  const annotation = input.annotations.find(
    (item) =>
      item.quotedText != null &&
      normalizeEvidenceText(item.quotedText) === target,
  );
  if (annotation) {
    return { method: 'annotation-exact', annotation };
  }

  const transcript = normalizeEvidenceText(input.transcript);
  if (transcript.includes(target)) {
    return { method: 'transcript-exact', annotation: null };
  }

  return { method: 'none', annotation: null };
}

/** 根据本地文件类型把批注位置转换为显式的 reader locator。 */
export function locatorFromAnnotation(
  fileType: 'pdf' | 'epub' | 'md' | 'txt',
  annotation: Annotation,
): EvidenceLocator {
  if (fileType === 'pdf') {
    return {
      kind: 'pdf-page',
      page: Math.max(1, annotation.page),
      anchor: annotation.anchor || null,
    };
  }
  if (fileType === 'epub') {
    if (!annotation.anchor.trim()) {
      return { kind: 'unresolved', reason: 'EPUB 批注缺少可重放的 CFI 定位' };
    }
    return {
      kind: 'epub-cfi',
      cfi: annotation.anchor || null,
      location: null,
      sectionIndex: Number.isFinite(annotation.page) ? annotation.page : null,
    };
  }
  return { kind: 'unresolved', reason: '该文件类型暂不支持精确阅读器定位' };
}
