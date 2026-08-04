/**
 * PdfRenderer - PDF.js 分页/双页/连续滚动渲染
 * 所属页面：E · 阅读界面 > ReaderCanvas
 * 规范参考：UI_spec.md §8.3 / §8.5；页码与进度写入 readerStore
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { usePdfDocument } from '../../../hooks/usePdfDocument';
import { toast } from '../../../components/common';
import { useAnnotationStore } from '../../../stores/annotationStore';
import {
  sameReaderLocatorHandoff,
  useReaderStore,
} from '../../../stores/readerStore';
import {
  markLinesRead,
  registerLineKeys,
} from '../../../utils/linesReadStore';
import { PdfPage } from './PdfPage';
import { extractPdfOutline } from '../../../utils/pdfOutline';
import type { EvidenceLocator } from '../../../types';
import styles from './PdfRenderer.module.css';

function pdfLocatorUnavailableReason(
  locator: EvidenceLocator,
  numPages: number,
): string | null {
  if (locator.kind === 'unresolved') return locator.reason;
  if (locator.kind !== 'pdf-page') {
    return 'PDF 来源定位类型与当前文档不匹配';
  }
  if (
    !Number.isInteger(locator.page) ||
    locator.page < 1 ||
    locator.page > numPages
  ) {
    return `PDF 页码 ${locator.page} 超出当前文档范围（共 ${numPages} 页）`;
  }
  return null;
}

/**
 * PdfRendererProps
 * @param fileId - IndexedDB 中的文件 id，用于取 blob
 */
export interface PdfRendererProps {
  fileId: string;
}

/**
 * 将 PDF 渲染到画布：同步总页数/当前页到 readerStore，支持键盘翻页与 Ctrl+滚轮缩放
 */
export function PdfRenderer({ fileId }: PdfRendererProps) {
  const { pdf, status, loadProgress, errorMessage } = usePdfDocument(fileId);
  const rootRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(1);
  /** 连续滚动时由 IntersectionObserver 改页码则跳过 scrollIntoView，避免与用户滚动打架 */
  const skipScrollIntoViewRef = useRef(false);

  const pageMode = useReaderStore((s) => s.pageMode);
  const zoomPercent = useReaderStore((s) => s.zoomPercent);
  const currentPage = useReaderStore((s) => s.currentPage);
  const totalPages = useReaderStore((s) => s.totalPages);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const setTotalPages = useReaderStore((s) => s.setTotalPages);
  const bumpZoom = useReaderStore((s) => s.bumpZoom);
  const applyFitZoom = useReaderStore((s) => s.applyFitZoom);
  const requestFitWidth = useReaderStore((s) => s.requestFitWidth);
  const defaultFitWidth = useReaderStore((s) => s.defaultFitWidth);
  const findQuery = useReaderStore((s) => s.findQuery);
  const findNonce = useReaderStore((s) => s.findNonce);
  const findDirection = useReaderStore((s) => s.findDirection);
  const setPdfOutline = useReaderStore((s) => s.setPdfOutline);
  const pendingLocator = useReaderStore((s) => s.pendingLocator);
  const clearPendingLocator = useReaderStore((s) => s.clearPendingLocator);
  const setPendingLocatorUnavailable = useReaderStore(
    (s) => s.setPendingLocatorUnavailable,
  );
  const clearPendingLocatorUnavailable = useReaderStore(
    (s) => s.clearPendingLocatorUnavailable,
  );
  const pendingLocatorUnavailable = useReaderStore(
    (s) => s.pendingLocatorUnavailable,
  );
  const fitWidthNonce = useReaderStore((s) => s.fitWidthNonce);
  const annotationJumpId = useReaderStore((s) => s.annotationJumpId);
  const clearAnnotationJumpIfCurrent = useReaderStore(
    (s) => s.clearAnnotationJumpIfCurrent,
  );
  const setAnnotationLocatorState = useReaderStore(
    (s) => s.setAnnotationLocatorState,
  );
  const annotationFileId = useAnnotationStore((s) => s.fileId);
  const annotationItems = useAnnotationStore((s) => s.items);
  const loadAnnotations = useAnnotationStore((s) => s.loadForFile);
  const lastFindPageRef = useRef(0);
  /** 每个 fileId 只自动适应一次，避免设置变更反复触发 */
  const autoFitAppliedRef = useRef<string | null>(null);

  currentPageRef.current = currentPage;
  const scale = zoomPercent / 100;

  // 文字层高亮不能依赖侧栏是否展开；Reader 自己确保批注事实源已加载。
  useEffect(() => {
    if (annotationFileId === fileId) return;
    void loadAnnotations(fileId);
  }, [annotationFileId, fileId, loadAnnotations]);

  useEffect(() => {
    if (!pdf || !annotationJumpId || annotationFileId !== fileId) return;
    const annotation = annotationItems.find(
      (item) => item.id === annotationJumpId && item.fileId === fileId,
    );
    if (!annotation) return;
    if (annotation.page < 1 || annotation.page > pdf.numPages) {
      setAnnotationLocatorState(
        fileId,
        annotationJumpId,
        'unavailable',
        `PDF 批注页码 ${annotation.page} 超出当前文档范围`,
      );
      clearAnnotationJumpIfCurrent(fileId, annotationJumpId);
    }
  }, [
    annotationFileId,
    annotationItems,
    annotationJumpId,
    clearAnnotationJumpIfCurrent,
    fileId,
    pdf,
    setAnnotationLocatorState,
  ]);

  // 关键字变化时重置查找游标，使首次搜索包含当前页
  useEffect(() => {
    lastFindPageRef.current = 0;
  }, [findQuery]);

  // 文档就绪后把总页数写入 store，供 BottomBar 显示进度
  useEffect(() => {
    if (!pdf) return;
    setTotalPages(pdf.numPages);
  }, [pdf, setTotalPages]);

  useEffect(() => {
    const handoff = pendingLocator;
    if (!pdf || !handoff || handoff.fileId !== fileId) return;
    if (
      pendingLocatorUnavailable &&
      sameReaderLocatorHandoff(
        pendingLocatorUnavailable.handoff,
        handoff,
      )
    ) {
      return;
    }
    const reason = pdfLocatorUnavailableReason(
      handoff.locator,
      pdf.numPages,
    );
    if (reason) {
      setPendingLocatorUnavailable(handoff, reason);
      return;
    }
    if (handoff.locator.kind !== 'pdf-page') return;
    setCurrentPage(handoff.locator.page);
    const current = useReaderStore.getState().pendingLocator;
    if (sameReaderLocatorHandoff(current, handoff)) {
      clearPendingLocatorUnavailable(handoff);
      clearPendingLocator(handoff);
    }
  }, [
    clearPendingLocator,
    clearPendingLocatorUnavailable,
    fileId,
    pdf,
    pendingLocator,
    pendingLocatorUnavailable,
    setPendingLocatorUnavailable,
    setCurrentPage,
  ]);
  // 文档就绪后提取基于字体大小的文本大纲
  useEffect(() => {
    if (!pdf || status !== 'ready') return;
    let cancelled = false;
    (async () => {
      const items = await extractPdfOutline(pdf, pdf.numPages);
      if (cancelled) return;
      setPdfOutline(items);
    })();
    return () => { cancelled = true; };
  }, [pdf, status, setPdfOutline]);
  // 设置「默认适应宽度」：文档首次就绪时触发一次
  useEffect(() => {
    if (!pdf || status !== 'ready' || !defaultFitWidth) return;
    if (autoFitAppliedRef.current === fileId) return;
    autoFitAppliedRef.current = fileId;
    requestFitWidth();
  }, [pdf, status, defaultFitWidth, fileId, requestFitWidth]);

  // 加载进度条宽度用 DOM 写入，避免 React 内联 style（设计规范）
  useEffect(() => {
    const el = progressFillRef.current;
    if (!el) return;
    el.style.width = `${Math.round(loadProgress * 100)}%`;
  }, [loadProgress, status]);

  const pageStep = pageMode === 'double' ? 2 : 1;

  const visiblePages = useMemo(() => {
    if (!pdf || totalPages <= 0) return [] as number[];
    if (pageMode === 'scroll') {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (pageMode === 'double') {
      const pages = [currentPage];
      if (currentPage + 1 <= totalPages) pages.push(currentPage + 1);
      return pages;
    }
    return [Math.min(currentPage, totalPages)];
  }, [pdf, pageMode, currentPage, totalPages]);

  // 键盘翻页：忽略输入框内按键，避免与页码输入冲突
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      ) {
        return;
      }

      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp' ||
        e.key === 'PageUp'
      ) {
        e.preventDefault();
        setCurrentPage(currentPageRef.current - pageStep);
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault();
        setCurrentPage(currentPageRef.current + pageStep);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageStep, setCurrentPage]);

  // Ctrl / ⌘ + 滚轮缩放（§8.3）
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      bumpZoom(e.deltaY < 0 ? 10 : -10);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [bumpZoom, status]);

  // 连续滚动：视口内占比最大的页同步为 currentPage
  useEffect(() => {
    if (pageMode !== 'scroll' || !rootRef.current || status !== 'ready') {
      return;
    }
    const root = rootRef.current;
    const ratios = new Map<number, number>();
    const scrollParent =
      root.closest<HTMLElement>('[aria-label="阅读画布"]') ?? null;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageAttr = (entry.target as HTMLElement).dataset.page;
          if (!pageAttr) continue;
          const n = Number(pageAttr);
          if (!Number.isFinite(n)) continue;
          ratios.set(n, entry.intersectionRatio);
        }
        let bestPage = currentPageRef.current;
        let bestRatio = -1;
        for (const [n, r] of ratios) {
          if (r > bestRatio) {
            bestRatio = r;
            bestPage = n;
          }
        }
        if (bestRatio > 0 && bestPage !== currentPageRef.current) {
          skipScrollIntoViewRef.current = true;
          setCurrentPage(bestPage);
        }
      },
      { root: scrollParent, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    root.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
      io.observe(el);
    });
    return () => io.disconnect();
  }, [pageMode, status, visiblePages.length, setCurrentPage]);

  // 仅在翻页时滚入视口；切换 pageMode 不触发，避免点「连续滚动」时整页上跳
  useEffect(() => {
    if (skipScrollIntoViewRef.current) {
      skipScrollIntoViewRef.current = false;
      return;
    }
    const el = rootRef.current?.querySelector(`[data-page="${currentPage}"]`);
    el?.scrollIntoView({
      block: 'nearest',
      behavior: 'auto',
    });
  }, [currentPage]);

  const onPageRendered = useCallback((_page: number, _h: number) => {
    /* 高度缓存留给虚拟滚动（P3） */
  }, []);

  // 登记本页行键；页进入视口后计为已读（同一行不重复）
  const pageLineKeysRef = useRef(new Map<number, string[]>());
  const onLinesReady = useCallback((page: number, keys: string[]) => {
    pageLineKeysRef.current.set(page, keys);
    registerLineKeys(keys);
    // 单/双页模式下当前页已在视口，IO 可能赶不上 keys 就绪，直接计读
    const mode = useReaderStore.getState().pageMode;
    const cur = useReaderStore.getState().currentPage;
    if (mode !== 'scroll' && (page === cur || page === cur + 1)) {
      markLinesRead(keys);
    }
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !rootRef.current) return;
    const root = rootRef.current;
    const scrollParent =
      root.closest<HTMLElement>('[aria-label="阅读画布"]') ?? null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.35) continue;
          const pageAttr = (entry.target as HTMLElement).dataset.page;
          if (!pageAttr) continue;
          const n = Number(pageAttr);
          const keys = pageLineKeysRef.current.get(n);
          if (keys?.length) markLinesRead(keys);
        }
      },
      { root: scrollParent, threshold: [0.35, 0.5, 0.75] },
    );
    root.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
      io.observe(el);
    });
    return () => io.disconnect();
  }, [status, visiblePages, pageMode]);

  // 适应宽度：按画布可用宽 / 页宽计算 zoom（§8.3）
  useEffect(() => {
    if (!pdf || fitWidthNonce === 0 || status !== 'ready') return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(currentPageRef.current);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1 });
      const canvasEl =
        rootRef.current?.closest<HTMLElement>('[aria-label="阅读画布"]') ??
        null;
      const pad = 40; /* 约 sp-5 * 2 */
      const available = Math.max(200, (canvasEl?.clientWidth ?? 800) - pad);
      const cols = pageMode === 'double' ? 2 : 1;
      const gap = pageMode === 'double' ? 20 : 0;
      const scale =
        (available - gap * (cols - 1)) / (viewport.width * cols);
      applyFitZoom(Math.round(scale * 100));
    })();
    return () => {
      cancelled = true;
    };
  }, [fitWidthNonce, pdf, pageMode, status, applyFitZoom]);

  // 文内搜索：环形查找（支持上一个 / 下一个）
  useEffect(() => {
    if (!pdf || findNonce === 0 || status !== 'ready') return;
    const q = findQuery.trim().toLowerCase();
    if (!q) {
      rootRef.current
        ?.querySelectorAll('.findHit')
        .forEach((el) => el.classList.remove('findHit'));
      lastFindPageRef.current = 0;
      return;
    }

    let cancelled = false;
    (async () => {
      const total = pdf.numPages;
      const base = lastFindPageRef.current || currentPageRef.current;
      // 首次包含当前页；再次查找从上/下一页开始
      const startK = lastFindPageRef.current ? 1 : 0;
      let foundPage: number | null = null;
      for (let k = startK; k <= total; k += 1) {
        const offset = findDirection === 'prev' ? -k : k;
        const pageNum =
          ((((base - 1 + offset) % total) + total) % total) + 1;
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const tc = await page.getTextContent();
        const text = tc.items
          .map((it) =>
            it && typeof it === 'object' && 'str' in it
              ? String((it as { str: string }).str)
              : '',
          )
          .join('');
        if (text.toLowerCase().includes(q)) {
          foundPage = pageNum;
          break;
        }
      }
      if (cancelled) return;
      if (foundPage == null) {
        toast.show('未找到匹配内容');
        return;
      }
      lastFindPageRef.current = foundPage;
      setCurrentPage(foundPage);
      window.setTimeout(() => {
        const root = rootRef.current;
        if (!root) return;
        root.querySelectorAll('.findHit').forEach((el) => {
          el.classList.remove('findHit');
        });
        root
          .querySelectorAll<HTMLElement>('[data-page] span')
          .forEach((span) => {
            if (span.textContent?.toLowerCase().includes(q)) {
              span.classList.add('findHit');
            }
          });
      }, 350);
    })();

    return () => {
      cancelled = true;
    };
  }, [findNonce, findQuery, findDirection, pdf, status, setCurrentPage]);

  if (status === 'loading' || status === 'idle') {
    const pct = Math.round(loadProgress * 100);
    return (
      <div className={styles.progressWrap} role="status" aria-live="polite">
        <div className={styles.progressBar} aria-hidden="true">
          <div ref={progressFillRef} className={styles.progressFill} />
        </div>
        <p className={styles.progressLabel}>正在加载 PDF… {pct}%</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p className={styles.error} role="alert">
        {errorMessage ?? 'PDF 加载失败'}
      </p>
    );
  }

  if (!pdf) return null;

  const layoutClass =
    pageMode === 'double'
      ? styles.double
      : pageMode === 'scroll'
        ? styles.scroll
        : styles.single;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      tabIndex={0}
      aria-label="PDF 阅读区"
    >
      <div className={layoutClass}>
        {visiblePages.map((n) => (
          <PdfPage
            key={n}
            pdf={pdf}
            pageNumber={n}
            scale={scale}
            onRendered={onPageRendered}
            onLinesReady={onLinesReady}
          />
        ))}
      </div>
    </div>
  );
}
