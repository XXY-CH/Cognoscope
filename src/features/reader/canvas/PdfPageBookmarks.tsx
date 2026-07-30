/**
 * PdfPageBookmarks - 单页书签丝带 + 划词原文高亮
 * 所属页面：E · 阅读界面 > PdfRenderer > PdfPage
 * 规范参考：UI_spec.md §8.4（书签在正文中可视化）
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { Bookmark as BookmarkIcon } from 'lucide-react';
import { useBookmarkStore } from '../../../stores/bookmarkStore';
import type { AnnotationColor, Bookmark } from '../../../types';
import styles from './PdfPageBookmarks.module.css';

/**
 * PdfPageBookmarksProps
 * @param pageNumber - 当前页码
 * @param textLayerEl - Text Layer 根节点，用于划词书签高亮
 * @param ready - 文字层是否已渲染完
 */
export interface PdfPageBookmarksProps {
  pageNumber: number;
  textLayerEl: HTMLDivElement | null;
  ready: boolean;
}

const COLOR_CLASS: Record<AnnotationColor, string> = {
  yellow: styles.hitYellow,
  green: styles.hitGreen,
  blue: styles.hitBlue,
  pink: styles.hitPink,
};

/**
 * 在文字层上标记与划词书签匹配的 span（跨 span 的短片段用包含匹配）
 */
function applyTextHits(
  textRoot: HTMLDivElement,
  bookmarks: Bookmark[],
) {
  textRoot.querySelectorAll<HTMLElement>('.bmHit').forEach((el) => {
    el.classList.remove(
      'bmHit',
      styles.hitYellow,
      styles.hitGreen,
      styles.hitBlue,
      styles.hitPink,
    );
  });

  for (const bm of bookmarks) {
    const raw = bm.quotedText?.trim();
    if (!raw) continue;
    const needle = raw.toLowerCase().replace(/\s+/g, '');
    if (needle.length < 2) continue;
    const hitClass = COLOR_CLASS[bm.color] ?? styles.hitBlue;

    textRoot.querySelectorAll<HTMLElement>('span').forEach((span) => {
      const t = (span.textContent ?? '').toLowerCase().replace(/\s+/g, '');
      if (!t || t.length < 1) return;
      // span 被原文包含，或 span 包含原文片段
      if (needle.includes(t) || (t.length >= 2 && t.includes(needle))) {
        span.classList.add('bmHit', hitClass);
      }
    });
  }
}

/**
 * 页缘丝带标记 + 划词原文半透明底色
 */
export function PdfPageBookmarks({
  pageNumber,
  textLayerEl,
  ready,
}: PdfPageBookmarksProps) {
  const items = useBookmarkStore((s) => s.items);
  const pageBookmarks = useMemo(
    () => items.filter((b) => b.page === pageNumber),
    [items, pageNumber],
  );

  useEffect(() => {
    if (!ready || !textLayerEl) return;
    applyTextHits(textLayerEl, pageBookmarks);
  }, [ready, textLayerEl, pageBookmarks]);

  if (pageBookmarks.length === 0) return null;

  return (
    <div className={styles.ribbons} aria-label={`第 ${pageNumber} 页书签`}>
      {pageBookmarks.map((bm, i) => (
        <button
          key={bm.id}
          type="button"
          className={styles.ribbon}
          data-color={bm.color}
          style={{ '--ribbon-index': String(i) } as CSSProperties}
          title={bm.label}
          aria-label={`书签：${bm.label}`}
        >
          <BookmarkIcon size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
