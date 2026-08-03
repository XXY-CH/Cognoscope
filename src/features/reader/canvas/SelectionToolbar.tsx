/**
 * SelectionToolbar - 划词浮动工具条
 * 所属页面：E · 阅读界面 > ReaderCanvas
 * 规范参考：UI_spec.md §8.7（词典已按产品要求改为书签）
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Bookmark,
  Copy,
  Highlighter,
  MessageCircle,
  PenLine,
  Search,
} from 'lucide-react';
import { IconButton, toast } from '../../../components/common';
import { useAnnotationStore } from '../../../stores/annotationStore';
import { useBookmarkStore } from '../../../stores/bookmarkStore';
import { useReaderStore } from '../../../stores/readerStore';
import type { AnnotationColor } from '../../../types';
import styles from './SelectionToolbar.module.css';

const COLORS: { id: AnnotationColor; label: string }[] = [
  { id: 'yellow', label: '黄' },
  { id: 'green', label: '绿' },
  { id: 'blue', label: '蓝' },
  { id: 'pink', label: '粉' },
];

/** 书签名称过长时截断，避免列表溢出 */
const BOOKMARK_LABEL_MAX = 80;

interface ToolbarPos {
  top: number;
  left: number;
  text: string;
  page: number;
}

/**
 * 选区相对视口定位；优先放在上方，贴边时翻到下方（§8.7）
 */
function computePos(range: Range): { top: number; left: number } {
  const rect = range.getBoundingClientRect();
  const barH = 36;
  const gap = 8;
  let top = rect.top - barH - gap;
  if (top < 8) top = rect.bottom + gap;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2),
    window.innerWidth - 8,
  );
  return { top, left };
}

/** 从选区祖先找 data-page */
function findPageFromNode(node: Node | null): number {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    const p = el.dataset.page;
    if (p) {
      const n = Number(p);
      if (Number.isFinite(n)) return n;
    }
    el = el.parentElement;
  }
  return useReaderStore.getState().currentPage;
}

function bookmarkLabelFromSelection(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= BOOKMARK_LABEL_MAX) return oneLine;
  return `${oneLine.slice(0, BOOKMARK_LABEL_MAX - 1)}…`;
}

/**
 * SelectionToolbar - 监听 document 选区；点击外部清除
 */
export function SelectionToolbar() {
  const [pos, setPos] = useState<ToolbarPos | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [bmColorOpen, setBmColorOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<ToolbarPos | null>(null);
  const fileId = useReaderStore((s) => s.fileId);
  const openSide = useReaderStore((s) => s.openSide);
  const openTocTab = useReaderStore((s) => s.openTocTab);
  const setQaRatio = useReaderStore((s) => s.setQaRatio);
  const setPendingQaQuote = useReaderStore((s) => s.setPendingQaQuote);
  const setFocusAnnotationId = useReaderStore((s) => s.setFocusAnnotationId);
  const seedFindFromSelection = useReaderStore((s) => s.seedFindFromSelection);
  const addFromSelection = useAnnotationStore((s) => s.addFromSelection);
  const addBookmark = useBookmarkStore((s) => s.add);

  posRef.current = pos;

  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPos(null);
        setColorOpen(false);
        setBmColorOpen(false);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const anchor = range.commonAncestorContainer;
      const root =
        anchor instanceof Element ? anchor : anchor.parentElement;
      // 仅响应阅读画布内选区，避免侧栏误触
      if (!root?.closest('[aria-label="阅读画布"]')) {
        setPos(null);
        return;
      }
      const { top, left } = computePos(range);
      setPos({
        top,
        left,
        text,
        page: findPageFromNode(range.startContainer),
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (barRef.current?.contains(t)) return;
      if (!posRef.current) return;
      // 点击工具条外：清选区并隐藏（§8.7）
      document.getSelection()?.removeAllRanges();
      setPos(null);
      setColorOpen(false);
      setBmColorOpen(false);
    };

    document.addEventListener('selectionchange', onSel);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  if (!pos || !fileId) return null;

  const clearSel = () => {
    document.getSelection()?.removeAllRanges();
    setPos(null);
    setColorOpen(false);
    setBmColorOpen(false);
  };

  const applyHighlight = async (color: AnnotationColor) => {
    await addFromSelection({
      fileId,
      page: pos.page,
      quotedText: pos.text,
      color,
      body: '',
    });
    toast.show('已高亮');
    clearSel();
  };

  const onAnnotate = async () => {
    const ann = await addFromSelection({
      fileId,
      page: pos.page,
      quotedText: pos.text,
      color: 'yellow',
      body: '',
    });
    openSide();
    // 拉高批注区占比，便于编辑正文
    setQaRatio(0.35);
    setFocusAnnotationId(ann.id);
    clearSel();
  };

  const onAsk = () => {
    openSide();
    setQaRatio(0.65);
    setPendingQaQuote({ text: pos.text, page: pos.page });
    clearSel();
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(pos.text);
      toast.show('已复制');
    } catch {
      toast.show('复制失败');
    }
    clearSel();
  };

  const onBookmark = async (color: AnnotationColor) => {
    await addBookmark({
      fileId,
      page: pos.page,
      label: bookmarkLabelFromSelection(pos.text),
      color,
      quotedText: pos.text,
    });
    openTocTab('bookmarks');
    toast.success('已添加书签');
    clearSel();
  };

  return (
    <div
      ref={barRef}
      className={styles.bar}
      role="toolbar"
      aria-label="划词工具条"
      style={
        {
          '--toolbar-top': `${pos.top}px`,
          '--toolbar-left': `${pos.left}px`,
        } as CSSProperties
      }
    >
      <div className={styles.highlightWrap}>
        <IconButton
          aria-label="高亮"
          aria-expanded={colorOpen}
          onClick={() => {
            setColorOpen((v) => !v);
            setBmColorOpen(false);
          }}
        >
          <Highlighter size={16} strokeWidth={1.5} />
        </IconButton>
        {colorOpen ? (
          <div className={styles.colorMenu} role="menu" aria-label="高亮颜色">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.colorDot}
                data-color={c.id}
                role="menuitem"
                aria-label={c.label}
                onClick={() => void applyHighlight(c.id)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <IconButton aria-label="批注" onClick={() => void onAnnotate()}>
        <PenLine size={16} strokeWidth={1.5} />
      </IconButton>
      <IconButton aria-label="提问" onClick={onAsk}>
        <MessageCircle size={16} strokeWidth={1.5} />
      </IconButton>
      <IconButton aria-label="复制" onClick={() => void onCopy()}>
        <Copy size={16} strokeWidth={1.5} />
      </IconButton>
      <div className={styles.highlightWrap}>
        <IconButton
          aria-label="添加书签"
          aria-expanded={bmColorOpen}
          onClick={() => {
            setBmColorOpen((v) => !v);
            setColorOpen(false);
          }}
        >
          <Bookmark size={16} strokeWidth={1.5} />
        </IconButton>
        {bmColorOpen ? (
          <div className={styles.colorMenu} role="menu" aria-label="书签颜色">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.colorDot}
                data-color={c.id}
                role="menuitem"
                aria-label={c.label}
                onClick={() => void onBookmark(c.id)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <IconButton
        aria-label="搜索本文"
        onClick={() => {
          seedFindFromSelection(pos.text);
          clearSel();
        }}
      >
        <Search size={16} strokeWidth={1.5} />
      </IconButton>
    </div>
  );
}
