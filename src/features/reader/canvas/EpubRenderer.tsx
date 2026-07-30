/**
 * EpubRenderer - epub.js 渲染（主题变量、分页/滚动、字号行距）
 * 所属页面：E · 阅读界面 > ReaderCanvas
 * 规范参考：UI_spec.md §8.3 / §8.5
 */
import { useEffect, useRef, useState } from 'react';
import ePub, { type Book, type Contents, type Rendition } from 'epubjs';
import { toast } from '../../../components/common';
import { getFileBlob } from '../../../db/files';
import { useReaderStore } from '../../../stores/readerStore';
import { markLinesRead, registerLineKeys } from '../../../utils/linesReadStore';
import styles from './EpubRenderer.module.css';

export interface EpubRendererProps {
  /** IndexedDB 中的文件 id */
  fileId: string;
}

/** 注入 iframe：跟随主题令牌 + 字号/行距（zoomPercent → font-size） */
function themeCss(zoomPercent: number): string {
  const fontSize = `${Math.round(16 * (zoomPercent / 100))}px`;
  return `body{color:var(--epub-fg)!important;background:var(--epub-bg)!important;font-size:${fontSize}!important;line-height:1.7!important;padding:1em 1.25em!important;}a{color:var(--epub-accent)!important;}`;
}

/** 按排版后文本节点生成行键（§8.5 EPUB） */
function epubLineKeys(sectionIndex: number, doc: Document): string[] {
  const keys: string[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let i = 0;
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.trim()) {
      keys.push(`e${sectionIndex}-l${i}`);
      i += 1;
    }
    node = walker.nextNode();
  }
  return keys;
}

/** 把宿主计算后的主题色写入 iframe CSS 变量 */
function paintThemeVars(doc: Document): void {
  const cs = getComputedStyle(document.documentElement);
  const root = doc.documentElement.style;
  root.setProperty(
    '--epub-fg',
    cs.getPropertyValue('--text-primary').trim() || '#1a1a1a',
  );
  root.setProperty(
    '--epub-bg',
    cs.getPropertyValue('--reader-paper-bg').trim() || '#ffffff',
  );
  root.setProperty(
    '--epub-accent',
    cs.getPropertyValue('--accent').trim() || '#4a6cf7',
  );
}

/**
 * epub.js：blob → Book → Rendition；页码/字号与 readerStore 同步
 */
export function EpubRenderer({ fileId }: EpubRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  /** 由 relocated 改页时跳过 display，避免循环 */
  const skipDisplayRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageMode = useReaderStore((s) => s.pageMode);
  const zoomPercent = useReaderStore((s) => s.zoomPercent);
  const currentPage = useReaderStore((s) => s.currentPage);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const setTotalPages = useReaderStore((s) => s.setTotalPages);
  const bumpZoom = useReaderStore((s) => s.bumpZoom);
  const setZoomPercent = useReaderStore((s) => s.setZoomPercent);
  const applyFitZoom = useReaderStore((s) => s.applyFitZoom);
  const fitWidthNonce = useReaderStore((s) => s.fitWidthNonce);
  const findNonce = useReaderStore((s) => s.findNonce);
  const findQuery = useReaderStore((s) => s.findQuery);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setStatus('loading');
    setErrorMessage(null);

    (async () => {
      try {
        const record = await getFileBlob(fileId);
        if (cancelled) return;
        if (!record?.blob) {
          setStatus('error');
          setErrorMessage('未找到文件内容，请重新导入');
          return;
        }

        objectUrl = URL.createObjectURL(record.blob);
        const book = ePub(objectUrl);
        bookRef.current = book;
        await book.ready;
        if (cancelled) return;

        const rendition = book.renderTo(host, {
          width: '100%',
          height: '100%',
          flow: pageMode === 'scroll' ? 'scrolled' : 'paginated',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.themes.default(themeCss(useReaderStore.getState().zoomPercent));

        rendition.hooks.content.register((contents: Contents) => {
          paintThemeVars(contents.document);
          const keys = epubLineKeys(contents.sectionIndex, contents.document);
          registerLineKeys(keys);
          markLinesRead(keys);
        });

        await rendition.display();
        if (cancelled) return;

        await book.locations.generate(1600);
        if (cancelled) return;
        const total = Math.max(1, book.locations.length());
        setTotalPages(total);

        rendition.on(
          'relocated',
          (loc: { start: { location: number } }) => {
            skipDisplayRef.current = true;
            setCurrentPage(
              Math.min(total, Math.max(1, (loc.start.location ?? 0) + 1)),
            );
          },
        );

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'EPUB 加载失败',
        );
      }
    })();

    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      host.replaceChildren();
    };
  }, [fileId, pageMode, setCurrentPage, setTotalPages]);

  // 字号变化：更新主题；行键在 content hook 中按稳定 section+index 重登记
  useEffect(() => {
    const r = renditionRef.current;
    if (!r || status !== 'ready') return;
    r.themes.default(themeCss(zoomPercent));
    r.themes.select('default');
  }, [zoomPercent, status]);

  // 适应宽度：EPUB 已铺满宿主，重置为舒适字号 100%
  useEffect(() => {
    if (fitWidthNonce === 0 || status !== 'ready') return;
    applyFitZoom(100);
  }, [fitWidthNonce, status, applyFitZoom]);

  // 文内搜索：EPUB 深度搜索后续增强
  useEffect(() => {
    if (findNonce === 0 || status !== 'ready') return;
    const q = findQuery.trim();
    if (!q) return;
    toast.show('EPUB 文内搜索将在后续增强；请先用 PDF 体验查找');
  }, [findNonce, findQuery, status]);

  // 底栏跳页
  useEffect(() => {
    if (skipDisplayRef.current) {
      skipDisplayRef.current = false;
      return;
    }
    const book = bookRef.current;
    const r = renditionRef.current;
    if (!book || !r || status !== 'ready') return;
    const total = book.locations.length() || 1;
    const cfi = book.locations.cfiFromLocation(
      Math.max(0, Math.min(total - 1, currentPage - 1)),
    );
    if (cfi) void r.display(cfi);
  }, [currentPage, status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
          el.isContentEditable)
      ) {
        return;
      }
      const r = renditionRef.current;
      if (!r) return;
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'PageUp'
      ) {
        e.preventDefault();
        void r.prev();
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault();
        void r.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      bumpZoom(e.deltaY < 0 ? 10 : -10);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [bumpZoom, status]);

  if (status === 'error') {
    return (
      <p className={styles.error} role="alert">
        {errorMessage ?? 'EPUB 加载失败'}
      </p>
    );
  }

  return (
    <div className={styles.root} aria-label="EPUB 阅读区">
      {status === 'loading' ? (
        <p className={styles.loading} role="status">
          正在加载 EPUB…
        </p>
      ) : null}
      <div ref={hostRef} className={styles.host} />
    </div>
  );
}
