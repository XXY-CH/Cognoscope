/**
 * PdfPageAnnotations - 在 PDF.js text layer 上重放已保存的批注高亮。
 * 所属页面：E · 阅读界面 > ReaderCanvas > PdfPage
 * 只使用 Annotation 已保存的页码和原文，不复制或改写证据记录。
 */
import { useEffect, useMemo } from 'react';
import { useAnnotationStore } from '../../../stores/annotationStore';
import { useReaderStore } from '../../../stores/readerStore';
import type { Annotation, AnnotationColor } from '../../../types';
import styles from './PdfPageBookmarks.module.css';

const COLOR_CLASS: Record<AnnotationColor, string> = {
  yellow: styles.annotationYellow,
  green: styles.annotationGreen,
  blue: styles.annotationBlue,
  pink: styles.annotationPink,
};

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function annotationPreview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 60
    ? `${trimmed.slice(0, 59).trimEnd()}…`
    : trimmed;
}

interface PdfTextOffset {
  start: number;
  end: number;
}

const PDF_TEXT_OFFSET_PREFIX = 'pdf-text-offset-v1:';
const LEGACY_PDF_TEXT_OFFSET_PREFIX = 'pdf-text-offset:';

interface AnnotationReplayResult {
  status: 'available' | 'unavailable';
  reason?: string;
}

function parsePdfTextOffsetAnchor(
  anchor: string,
): PdfTextOffset | null {
  const match = /^(?:pdf-text-offset-v1:|pdf-text-offset:)(\d+):(\d+)$/.exec(
    anchor,
  );
  const start = match ? Number(match[1]) : Number.NaN;
  const end = match ? Number(match[2]) : Number.NaN;
  return match &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end >= start
    ? { start, end }
    : null;
}

function hasPdfTextOffsetPrefix(anchor: string): boolean {
  return (
    anchor.startsWith(PDF_TEXT_OFFSET_PREFIX) ||
    anchor.startsWith(LEGACY_PDF_TEXT_OFFSET_PREFIX)
  );
}

function resolvePdfTextRange(
  pageText: string,
  needle: string,
  anchor: string,
): PdfTextOffset | null {
  const hasOffsetAnchor = hasPdfTextOffsetPrefix(anchor);
  const offsetAnchor = parsePdfTextOffsetAnchor(anchor);
  const offsetMatchesQuote =
    offsetAnchor != null &&
    offsetAnchor.end <= pageText.length &&
    offsetAnchor.start < offsetAnchor.end &&
    normalizeText(pageText.slice(offsetAnchor.start, offsetAnchor.end)) ===
      needle;
  if (offsetMatchesQuote && offsetAnchor) return offsetAnchor;

  // 新版偏移锚点一旦漂移就必须保持 unavailable，不能静默降级到首个同文摘录。
  if (hasOffsetAnchor) return null;

  if (needle.length < 2) return null;
  const start = pageText.indexOf(needle);
  return start < 0 ? null : { start, end: start + needle.length };
}

/** 清理上一轮批注标记，避免文件切换或批注删除后残留颜色。 */
function clearAnnotationHits(textRoot: HTMLDivElement): void {
  textRoot.querySelectorAll<HTMLElement>('.annHit').forEach((element) => {
    element.classList.remove(
      'annHit',
      styles.annotationYellow,
      styles.annotationGreen,
      styles.annotationBlue,
      styles.annotationPink,
      styles.annotationFocus,
    );
    delete element.dataset.annotationId;
    element.title = '';
  });
}

/**
 * PDF.js 会把一段文字拆成多个 span。新批注使用确定性的文字层偏移，
 * 旧批注才回退到 quotedText 的首次匹配。
 */
function applyAnnotationHits(
  textRoot: HTMLDivElement,
  annotations: readonly Annotation[],
  pageNumber: number,
): Map<string, AnnotationReplayResult> {
  clearAnnotationHits(textRoot);

  const spans = Array.from(textRoot.querySelectorAll<HTMLElement>('span'))
    .map((element) => ({
      element,
      text: normalizeText(element.textContent ?? ''),
    }))
    .filter((item) => !item.element.classList.contains('markedContent'))
    .filter((item) => item.text.length > 0);
  const pageText = spans.map((item) => item.text).join('');
  const results = new Map<string, AnnotationReplayResult>();
  if (!pageText) {
    for (const annotation of annotations) {
      if (annotation.quotedText?.trim()) {
        results.set(annotation.id, {
          status: 'unavailable',
          reason: `PDF 第 ${pageNumber} 页文字层中没有可用文本`,
        });
      } else {
        results.set(annotation.id, { status: 'available' });
      }
    }
    return results;
  }

  let cursor = 0;
  const ranges = spans.map((item) => {
    const start = cursor;
    cursor += item.text.length;
    return { ...item, start, end: cursor };
  });

  for (const annotation of annotations) {
    const needle = normalizeText(annotation.quotedText?.trim() ?? '');
    if (!needle) {
      results.set(annotation.id, { status: 'available' });
      continue;
    }

    const anchor = annotation.anchor.trim();
    const hasOffsetAnchor = hasPdfTextOffsetPrefix(anchor);
    const hitClass = COLOR_CLASS[annotation.color] ?? styles.annotationBlue;
    const resolvedRange = resolvePdfTextRange(pageText, needle, anchor);
    if (!resolvedRange) {
      results.set(annotation.id, {
        status: 'unavailable',
        reason:
          needle.length < 2
            ? 'PDF 批注摘录过短，无法稳定定位'
            : hasOffsetAnchor
              ? `PDF 第 ${pageNumber} 页的文字范围不可用，且找不到已保存摘录`
              : `PDF 第 ${pageNumber} 页找不到已保存摘录，文档内容可能已变化`,
      });
      continue;
    }
    const { start, end } = resolvedRange;
    results.set(annotation.id, { status: 'available' });
    for (const range of ranges) {
      if (range.end <= start || range.start >= end) continue;
      range.element.classList.add('annHit', hitClass);
      range.element.dataset.annotationId = annotation.id;
      const preview = annotationPreview(
        annotation.body.trim() || annotation.quotedText?.trim() || '',
      );
      if (preview) range.element.title = preview;
    }
  }
  return results;
}

export interface PdfPageAnnotationsProps {
  pageNumber: number;
  textLayerEl: HTMLDivElement | null;
  ready: boolean;
}

export function PdfPageAnnotations({
  pageNumber,
  textLayerEl,
  ready,
}: PdfPageAnnotationsProps) {
  const items = useAnnotationStore((state) => state.items);
  const storeFileId = useAnnotationStore((state) => state.fileId);
  const fileId = useReaderStore((state) => state.fileId);
  const annotationJumpId = useReaderStore((state) => state.annotationJumpId);
  const clearAnnotationJumpIfCurrent = useReaderStore(
    (state) => state.clearAnnotationJumpIfCurrent,
  );
  const setAnnotationLocatorState = useReaderStore(
    (state) => state.setAnnotationLocatorState,
  );
  const openSide = useReaderStore((state) => state.openSide);
  const setFocusAnnotationId = useReaderStore(
    (state) => state.setFocusAnnotationId,
  );
  const pageAnnotations = useMemo(
    () =>
      items.filter(
        (annotation) =>
          annotation.fileId === fileId && annotation.page === pageNumber,
      ),
    [fileId, items, pageNumber],
  );

  useEffect(() => {
    if (!ready || !textLayerEl || !fileId) return;
    const requestedFileId = fileId;
    const replayResults = applyAnnotationHits(
      textLayerEl,
      pageAnnotations,
      pageNumber,
    );
    for (const [annotationId, result] of replayResults) {
      setAnnotationLocatorState(
        requestedFileId,
        annotationId,
        result.status,
        result.reason,
      );
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const hit = target.closest<HTMLElement>('[data-annotation-id]');
      const id = hit?.dataset.annotationId;
      if (!id) return;
      openSide();
      setFocusAnnotationId(id);
    };
    textLayerEl.addEventListener('click', onClick);
    return () => {
      textLayerEl.removeEventListener('click', onClick);
      clearAnnotationHits(textLayerEl);
    };
  }, [
    fileId,
    openSide,
    pageAnnotations,
    pageNumber,
    ready,
    setAnnotationLocatorState,
    setFocusAnnotationId,
    textLayerEl,
  ]);

  useEffect(() => {
    if (!ready || !textLayerEl || !annotationJumpId || !fileId) return;
    if (storeFileId !== fileId) return;
    const targetAnnotation = pageAnnotations.find(
      (annotation) => annotation.id === annotationJumpId,
    );
    if (!targetAnnotation) return;
    const requestedFileId = fileId;
    const requestedAnnotationId = annotationJumpId;
    const clearIfCurrent = () => {
      clearAnnotationJumpIfCurrent(requestedFileId, requestedAnnotationId);
    };
    if (!targetAnnotation.quotedText?.trim()) {
      setAnnotationLocatorState(requestedFileId, requestedAnnotationId, 'available');
      clearIfCurrent();
      return;
    }
    const hit = Array.from(
      textLayerEl.querySelectorAll<HTMLElement>('[data-annotation-id]'),
    ).find((element) => element.dataset.annotationId === annotationJumpId);
    if (!hit) {
      // 页码定位仍然成立，但摘录可能因 PDF 文字层漂移而无法命中。
      setAnnotationLocatorState(
        requestedFileId,
        requestedAnnotationId,
        'unavailable',
        `PDF 第 ${pageNumber} 页找不到已保存摘录，文档内容可能已变化`,
      );
      const timer = window.setTimeout(() => {
        clearIfCurrent();
      }, 900);
      return () => window.clearTimeout(timer);
    }
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    hit.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
    hit.classList.add(styles.annotationFocus);
    setAnnotationLocatorState(
      requestedFileId,
      requestedAnnotationId,
      'available',
    );
    const timer = window.setTimeout(() => {
      hit.classList.remove(styles.annotationFocus);
    }, 900);
    clearIfCurrent();
    return () => {
      window.clearTimeout(timer);
      hit.classList.remove(styles.annotationFocus);
    };
  }, [
    annotationJumpId,
    clearAnnotationJumpIfCurrent,
    fileId,
    pageAnnotations,
    pageNumber,
    ready,
    setAnnotationLocatorState,
    storeFileId,
    textLayerEl,
  ]);

  return null;
}
