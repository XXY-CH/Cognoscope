/**
 * readerStore - 阅读界面布局与视图状态
 * 所属：E · 阅读界面
 * 规范参考：UI_spec.md §8
 */
import { create } from 'zustand';
import type { EvidenceLocator, PdfOutlineItem } from '../types';

export type PageMode = 'single' | 'double' | 'scroll';
export type SideSplitPreset = 'half' | 'qa-only' | 'anno-only';

export interface ReaderLocatorHandoff {
  fileId: string;
  matrixId: string;
  rowId: string;
  locator: EvidenceLocator;
}

export interface PendingQaQuote {
  text: string;
  page: number;
}

const TOC_KEY = 'xuesen-toc-width';
const SIDE_KEY = 'xuesen-side-width';
const TOC_COLLAPSED_KEY = 'xuesen-toc-collapsed';
const SIDE_COLLAPSED_KEY = 'xuesen-side-collapsed';
const SPLIT_KEY = 'xuesen-side-split';
const PAGE_MODE_KEY = 'xuesen-page-mode';
const DEFAULT_FIT_WIDTH_KEY = 'xuesen-default-fit-width';

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

function readPageMode(): PageMode {
  try {
    const raw = localStorage.getItem(PAGE_MODE_KEY);
    if (raw === 'single' || raw === 'double' || raw === 'scroll') return raw;
  } catch {
    /* ignore */
  }
  return 'single';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

interface ReaderState {
  /** 当前打开的文件 id */
  fileId: string | null;
  fileName: string;
  fileType: 'pdf' | 'epub' | 'md' | 'txt' | null;
  tocOpen: boolean;
  sideOpen: boolean;
  /** 外部请求切换的目录 Tab；TocPanel 消费后清空 */
  tocTabRequest: 'toc' | 'bookmarks' | null;
  tocWidth: number;
  sideWidth: number;
  /** QA 区占比 0–1（相对 SidePanel 内容区） */
  qaRatio: number;
  pageMode: PageMode;
  zoomPercent: number;
  currentPage: number;
  totalPages: number;
  linesRead: number;
  /** 划词「提问」写入的引用草稿（QAPanel 消费后清空） */
  pendingQaQuote: PendingQaQuote | null;
  /** 划词「批注」后待聚焦的批注 id */
  focusAnnotationId: string | null;
  /** 文内搜索：输入框草稿（可与已提交 findQuery 不同） */
  findDraft: string;
  /** 最近一次提交的查找关键字 */
  findQuery: string;
  /** 递增以触发查找 */
  findNonce: number;
  /** 查找方向 */
  findDirection: 'next' | 'prev';
  /** 递增以聚焦搜索框（划词灌入后） */
  findFocusNonce: number;
  /** 递增以触发「适应页宽」 */
  fitWidthNonce: number;
  /** 当前是否处于适应宽度态（再点还原） */
  fitWidthActive: boolean;
  /** 进入适应宽度前的缩放百分比 */
  zoomBeforeFit: number | null;
  /** 新打开文档时是否自动适应宽度（设置 · 阅读） */
  defaultFitWidth: boolean;
  /** 文本推断的 PDF 大纲；TocPanel 消费 */
  pdfOutline: PdfOutlineItem[];
  /** 从证据矩阵跳转到来源时暂存的定位信息 */
  pendingLocator: ReaderLocatorHandoff | null;

  openFile: (input: {
    id: string;
    name: string;
    type: 'pdf' | 'epub' | 'md' | 'txt';
  }) => void;
  clearFile: () => void;
  toggleToc: () => void;
  toggleSide: () => void;
  /** 展开侧栏（不切换收起） */
  openSide: () => void;
  /** 展开目录面板 */
  openToc: () => void;
  /** 展开目录并切到指定 Tab（添加书签后） */
  openTocTab: (tab: 'toc' | 'bookmarks') => void;
  clearTocTabRequest: () => void;
  setTocWidth: (width: number) => void;
  setSideWidth: (width: number) => void;
  setQaRatio: (ratio: number) => void;
  cycleSideSplit: () => void;
  setPageMode: (mode: PageMode) => void;
  /** 默认展开左栏（目录）并持久化 */
  setDefaultTocOpen: (open: boolean) => void;
  /** 默认展开右栏（侧栏）并持久化 */
  setDefaultSideOpen: (open: boolean) => void;
  /** 默认打开文档时适应宽度并持久化 */
  setDefaultFitWidth: (fit: boolean) => void;
  setZoomPercent: (zoom: number) => void;
  /** 适应宽度计算结果写入，不退出 fit 切换态 */
  applyFitZoom: (zoom: number) => void;
  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  bumpZoom: (delta: number) => void;
  setLinesRead: (n: number) => void;
  setPendingQaQuote: (quote: PendingQaQuote | null) => void;
  setFocusAnnotationId: (id: string | null) => void;
  setFindDraft: (q: string) => void;
  setFindQuery: (q: string) => void;
  /**
   * 提交搜索；direction 默认 next
   * @param query - 可选，缺省用 findDraft
   */
  requestFind: (query?: string, direction?: 'next' | 'prev') => void;
  /** 划词「搜索本文」：灌入草稿并立即查找 */
  seedFindFromSelection: (text: string) => void;
  /** 使当前页适配画布宽度 */
  requestFitWidth: () => void;
  setPdfOutline: (items: PdfOutlineItem[]) => void;
  setPendingLocator: (handoff: ReaderLocatorHandoff | null) => void;
  clearPendingLocator: () => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  fileId: null,
  fileName: '',
  fileType: null,
  tocOpen: !readBool(TOC_COLLAPSED_KEY, false),
  sideOpen: !readBool(SIDE_COLLAPSED_KEY, false),
  tocTabRequest: null as 'toc' | 'bookmarks' | null,
  tocWidth: readNumber(TOC_KEY, 260),
  sideWidth: readNumber(SIDE_KEY, 360),
  qaRatio: readNumber(SPLIT_KEY, 0.5),
  pageMode: readPageMode(),
  zoomPercent: 100,
  currentPage: 1,
  totalPages: 0,
  linesRead: 0,
  pendingQaQuote: null,
  focusAnnotationId: null,
  findDraft: '',
  findQuery: '',
  findNonce: 0,
  findDirection: 'next',
  findFocusNonce: 0,
  fitWidthNonce: 0,
  fitWidthActive: false,
  zoomBeforeFit: null,
  // 缺省开启：多数论文 PDF 更适合适应页宽起步
  defaultFitWidth: readBool(DEFAULT_FIT_WIDTH_KEY, true),
  pdfOutline: [],
  pendingLocator: null,

  openFile: ({ id, name, type }) =>
    set({
      fileId: id,
      fileName: name,
      fileType: type,
      currentPage: 1,
      totalPages: type === 'pdf' || type === 'epub' ? 1 : 0,
      linesRead: 0,
      pendingQaQuote: null,
      focusAnnotationId: null,
      findDraft: '',
      findQuery: '',
      findNonce: 0,
      findDirection: 'next',
      fitWidthActive: false,
      zoomBeforeFit: null,
      pdfOutline: [],
      pendingLocator: null,
    }),

  // 不重置 linesRead：离开页时 clearFile 可能先于会话 cleanup，清零会覆盖 IndexedDB
  clearFile: () =>
    set({
      fileId: null,
      fileName: '',
      fileType: null,
      currentPage: 1,
      totalPages: 0,
      pendingQaQuote: null,
      focusAnnotationId: null,
      findDraft: '',
      findQuery: '',
      findNonce: 0,
      findDirection: 'next',
      pdfOutline: [],
      pendingLocator: null,
    }),

  toggleToc: () => {
    const next = !get().tocOpen;
    try {
      localStorage.setItem(TOC_COLLAPSED_KEY, next ? '0' : '1');
    } catch {
      /* ignore */
    }
    set({ tocOpen: next });
  },

  toggleSide: () => {
    const next = !get().sideOpen;
    try {
      localStorage.setItem(SIDE_COLLAPSED_KEY, next ? '0' : '1');
    } catch {
      /* ignore */
    }
    set({ sideOpen: next });
  },

  openSide: () => {
    try {
      localStorage.setItem(SIDE_COLLAPSED_KEY, '0');
    } catch {
      /* ignore */
    }
    set({ sideOpen: true });
  },

  openToc: () => {
    try {
      localStorage.setItem(TOC_COLLAPSED_KEY, '0');
    } catch {
      /* ignore */
    }
    set({ tocOpen: true });
  },

  openTocTab: (tab) => {
    try {
      localStorage.setItem(TOC_COLLAPSED_KEY, '0');
    } catch {
      /* ignore */
    }
    set({ tocOpen: true, tocTabRequest: tab });
  },

  clearTocTabRequest: () => set({ tocTabRequest: null }),

  setTocWidth: (width) => {
    const next = clamp(width, 180, 400);
    try {
      localStorage.setItem(TOC_KEY, String(next));
    } catch {
      /* ignore */
    }
    set({ tocWidth: next, tocOpen: true });
  },

  setSideWidth: (width) => {
    const next = clamp(width, 280, 520);
    try {
      localStorage.setItem(SIDE_KEY, String(next));
    } catch {
      /* ignore */
    }
    set({ sideWidth: next, sideOpen: true });
  },

  setQaRatio: (ratio) => {
    const next = clamp(ratio, 0.08, 0.92);
    try {
      localStorage.setItem(SPLIT_KEY, String(next));
    } catch {
      /* ignore */
    }
    set({ qaRatio: next });
  },

  cycleSideSplit: () => {
    const r = get().qaRatio;
    // 双击分隔条：50:50 → 仅问答 → 仅批注 → 循环
    let next: number;
    if (r > 0.4 && r < 0.6) next = 0.92;
    else if (r >= 0.6) next = 0.08;
    else next = 0.5;
    get().setQaRatio(next);
  },

  setPageMode: (pageMode) => {
    try {
      localStorage.setItem(PAGE_MODE_KEY, pageMode);
    } catch {
      /* ignore */
    }
    set({ pageMode });
  },
  /** 设置默认是否展开目录（左栏）并立即应用 */
  setDefaultTocOpen: (open: boolean) => {
    try {
      localStorage.setItem(TOC_COLLAPSED_KEY, open ? '0' : '1');
    } catch {
      /* ignore */
    }
    set({ tocOpen: open });
  },
  /** 设置默认是否展开侧栏（右栏）并立即应用 */
  setDefaultSideOpen: (open: boolean) => {
    try {
      localStorage.setItem(SIDE_COLLAPSED_KEY, open ? '0' : '1');
    } catch {
      /* ignore */
    }
    set({ sideOpen: open });
  },
  setDefaultFitWidth: (fit: boolean) => {
    try {
      localStorage.setItem(DEFAULT_FIT_WIDTH_KEY, fit ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ defaultFitWidth: fit });
  },
  setZoomPercent: (zoomPercent) =>
    set({
      zoomPercent: clamp(Math.round(zoomPercent), 50, 200),
      // 手动改缩放时退出适应宽度切换态
      fitWidthActive: false,
      zoomBeforeFit: null,
    }),
  applyFitZoom: (zoomPercent) =>
    set({ zoomPercent: clamp(Math.round(zoomPercent), 50, 200) }),
  setCurrentPage: (page) => {
    const total = get().totalPages;
    // 有总页数时夹到 [1, total]，避免翻页/滑块越界
    const max = total > 0 ? total : Math.max(1, Math.round(page));
    set({ currentPage: clamp(Math.round(page), 1, max) });
  },
  setTotalPages: (totalPages) => {
    const next = Math.max(0, totalPages);
    const page = get().currentPage;
    set({
      totalPages: next,
      // 总页数缩小（换文件）时同步夹紧当前页
      currentPage: next > 0 ? clamp(page, 1, next) : page,
    });
  },
  bumpZoom: (delta) => get().setZoomPercent(get().zoomPercent + delta),
  setLinesRead: (n) => set({ linesRead: Math.max(0, Math.round(n)) }),
  setPendingQaQuote: (pendingQaQuote) => set({ pendingQaQuote }),
  setFocusAnnotationId: (focusAnnotationId) => set({ focusAnnotationId }),
  setFindDraft: (findDraft) => set({ findDraft }),
  setFindQuery: (findQuery) => set({ findQuery, findDraft: findQuery }),
  requestFind: (query, direction = 'next') => {
    const findQuery =
      query !== undefined ? query : get().findDraft;
    set({
      findDraft: findQuery,
      findQuery,
      findDirection: direction,
      findNonce: get().findNonce + 1,
    });
  },
  seedFindFromSelection: (text) => {
    const q = text.trim();
    if (!q) return;
    set({
      findDraft: q,
      findQuery: q,
      findDirection: 'next',
      findNonce: get().findNonce + 1,
      findFocusNonce: get().findFocusNonce + 1,
    });
  },
  requestFitWidth: () => {
    const s = get();
    // 再次点击：还原进入适应宽度前的缩放
    if (s.fitWidthActive) {
      const prev = s.zoomBeforeFit ?? 100;
      set({
        zoomPercent: clamp(Math.round(prev), 50, 200),
        fitWidthActive: false,
        zoomBeforeFit: null,
      });
      return;
    }
    set({
      zoomBeforeFit: s.zoomPercent,
      fitWidthActive: true,
      fitWidthNonce: s.fitWidthNonce + 1,
    });
  },

  setPdfOutline: (pdfOutline) => set({ pdfOutline }),
  setPendingLocator: (pendingLocator) => set({ pendingLocator }),
  clearPendingLocator: () => set({ pendingLocator: null }),
}));
