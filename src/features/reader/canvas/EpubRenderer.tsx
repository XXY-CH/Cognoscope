/**
 * EpubRenderer - epub.js 渲染（主题变量、分页/滚动、字号行距）
 * 所属页面：E · 阅读界面 > ReaderCanvas
 * 规范参考：UI_spec.md §8.3 / §8.5
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ePub, { type Book, type Contents, type Rendition } from 'epubjs';
import { toast } from '../../../components/common';
import { getFileBlob } from '../../../db/files';
import { useAnnotationStore } from '../../../stores/annotationStore';
import {
  sameReaderLocatorHandoff,
  useReaderStore,
  type ReaderLocatorHandoff,
} from '../../../stores/readerStore';
import { useUiStore } from '../../../stores/uiStore';
import type {
  Annotation,
  AnnotationColor,
  EvidenceLocator,
} from '../../../types';
import { flattenEpubToc } from '../../../utils/epubToc';
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
  for (const color of ['yellow', 'green', 'blue', 'pink'] as const) {
    root.setProperty(
      `--epub-annotation-${color}`,
      cs.getPropertyValue(`--annotation-${color}`).trim(),
    );
  }
}

function isEpubCfi(value: string): boolean {
  return /^epubcfi\(.+\)$/.test(value.trim());
}

function epubPageFromLocation(
  location: number | undefined,
  total?: number,
): number | null {
  if (location == null || !Number.isFinite(location)) return null;
  const page = Math.max(1, Math.round(location) + 1);
  return total != null && total > 0 ? Math.min(total, page) : page;
}

function epubLocatorUnavailableReason(
  locator: EvidenceLocator,
  total: number,
): string | null {
  if (locator.kind === 'unresolved') return locator.reason;
  if (locator.kind !== 'epub-cfi') {
    return 'EPUB 来源定位类型与当前文档不匹配';
  }
  if (locator.cfi && !isEpubCfi(locator.cfi)) {
    return 'EPUB 来源定位缺少有效的 CFI';
  }
  if (
    locator.location != null &&
    (!Number.isInteger(locator.location) ||
      locator.location < 0 ||
      locator.location >= total)
  ) {
    return `EPUB location ${locator.location} 超出当前文档范围`;
  }
  if (!locator.cfi && locator.location == null) {
    return 'EPUB 来源定位缺少 CFI 或 location';
  }
  return null;
}

function isCurrentEpubDisplayRequest(
  generation: number,
  currentGeneration: number,
  tokenFileId: string,
  currentFileId: string | null,
  aborted: boolean,
): boolean {
  return (
    !aborted &&
    generation === currentGeneration &&
    tokenFileId === currentFileId
  );
}

function annotationPreview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 60
    ? `${trimmed.slice(0, 59).trimEnd()}…`
    : trimmed;
}

const EPUB_SELECTION_EVENT = 'xuesen:epub-selection';

const EPUB_HIGHLIGHT_COLORS: Record<
  AnnotationColor,
  { fill: string; opacity: string }
> = {
  yellow: { fill: 'var(--epub-annotation-yellow)', opacity: '0.32' },
  green: { fill: 'var(--epub-annotation-green)', opacity: '0.28' },
  blue: { fill: 'var(--epub-annotation-blue)', opacity: '0.30' },
  pink: { fill: 'var(--epub-annotation-pink)', opacity: '0.30' },
};

interface EpubHighlightRef {
  cfi: string;
  preview: string;
}

interface EpubAnnotationMark {
  mark?: {
    element?: SVGElement;
  };
}

/** epub.js 的类型声明返回单个 Contents，但 manager 运行时返回数组。 */
function getEpubContents(rendition: Rendition): Contents[] {
  const value = rendition.getContents() as unknown;
  if (Array.isArray(value)) return value as Contents[];
  return value ? [value as Contents] : [];
}

type EpubDisplayKind = 'handoff' | 'annotation' | 'toc' | 'page';

interface EpubDisplayToken {
  generation: number;
  fileId: string;
  kind: EpubDisplayKind;
  identity: string;
  handoff?: ReaderLocatorHandoff;
  controller: AbortController;
}

function decorateEpubHighlight(
  rendition: Rendition,
  annotationId: string,
  preview: string,
  onActivate: () => void,
  root?: ParentNode | null,
): void {
  try {
    const elements = root
      ? root.querySelectorAll<SVGElement>('[data-annotation-id]')
      : getEpubContents(rendition).flatMap((contents) =>
          Array.from(
            contents.document.querySelectorAll<SVGElement>(
              '[data-annotation-id]',
            ),
          ),
        );
    for (const element of elements) {
      if (element.dataset.annotationId !== annotationId) continue;
      element.setAttribute('title', preview || '批注高亮');
      element.setAttribute(
        'aria-label',
        preview ? `批注高亮：${preview}` : '批注高亮',
      );
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      if (element.dataset.xuesenInteractive === 'true') continue;
      element.dataset.xuesenInteractive = 'true';
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate();
      });
    }
  } catch {
    // 当前章节尚未 attach 时，epub.js 会在后续 view render 阶段继续挂载。
  }
}

function flashEpubHighlight(
  rendition: Rendition,
  annotationId: string,
  generation: number,
  isCurrent: () => boolean,
  root?: ParentNode | null,
): void {
  try {
    if (!isCurrent()) return;
    const elements = [
      ...getEpubContents(rendition).flatMap((contents) =>
        Array.from(
          contents.document.querySelectorAll<SVGElement>(
            '[data-annotation-id]',
          ),
        ),
      ),
      ...(root
        ? Array.from(
            root.querySelectorAll<SVGElement>('[data-annotation-id]'),
          )
        : []),
    ];
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    for (const element of elements) {
      if (!isCurrent()) return;
      if (element.dataset.annotationId !== annotationId) continue;
      if (!reducedMotion && typeof element.animate === 'function') {
        element.animate(
          [
            { opacity: '0.3' },
            { opacity: '0.8' },
            { opacity: '0.3' },
          ],
          {
            duration: parseCssDuration(
              getComputedStyle(document.documentElement).getPropertyValue(
                '--annotation-focus-duration',
              ),
            ),
            easing: 'ease-in-out',
          },
        );
      }
      element.setAttribute('data-focus', 'true');
      element.dataset.xuesenFocusGeneration = String(generation);
      window.setTimeout(() => {
        if (
          element.isConnected &&
          element.dataset.xuesenFocusGeneration === String(generation)
        ) {
          element.removeAttribute('data-focus');
          delete element.dataset.xuesenFocusGeneration;
        }
      }, parseCssDuration(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--annotation-focus-duration',
        ),
      ));
    }
  } catch {
    // 当前章节尚未 attach 时，正文跳转仍然有效。
  }
}

function parseCssDuration(value: string): number {
  const trimmed = value.trim();
  const amount = Number.parseFloat(trimmed);
  if (!Number.isFinite(amount)) return 800;
  return trimmed.endsWith('s') && !trimmed.endsWith('ms')
    ? amount * 1000
    : amount;
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
  /** 就绪前先提交一次真实 EPUB location，避免底栏回放默认第一页。 */
  const initialLocationCommittedRef = useRef(false);
  /** 递增以淘汰旧的 EPUB display promise。 */
  const displayGenerationRef = useRef(0);
  /** epub.js 没有 AbortSignal API，用本地 controller + generation 丢弃旧结果。 */
  const activeDisplayRef = useRef<EpubDisplayToken | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageMode = useReaderStore((s) => s.pageMode);
  const zoomPercent = useReaderStore((s) => s.zoomPercent);
  const resolvedTheme = useUiStore((s) => s.resolvedTheme);
  const currentPage = useReaderStore((s) => s.currentPage);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const setTotalPages = useReaderStore((s) => s.setTotalPages);
  const bumpZoom = useReaderStore((s) => s.bumpZoom);
  const applyFitZoom = useReaderStore((s) => s.applyFitZoom);
  const requestFitWidth = useReaderStore((s) => s.requestFitWidth);
  const defaultFitWidth = useReaderStore((s) => s.defaultFitWidth);
  const fitWidthNonce = useReaderStore((s) => s.fitWidthNonce);
  const findNonce = useReaderStore((s) => s.findNonce);
  const findQuery = useReaderStore((s) => s.findQuery);
  const pendingLocator = useReaderStore((s) => s.pendingLocator);
  const pendingLocatorUnavailable = useReaderStore(
    (s) => s.pendingLocatorUnavailable,
  );
  const pendingEpubTocHref = useReaderStore((s) => s.pendingEpubTocHref);
  const clearEpubTocHref = useReaderStore((s) => s.clearEpubTocHref);
  const annotationJumpId = useReaderStore((s) => s.annotationJumpId);
  const clearAnnotationJumpIfCurrent = useReaderStore(
    (s) => s.clearAnnotationJumpIfCurrent,
  );
  const setEpubToc = useReaderStore((s) => s.setEpubToc);
  const setEpubTocStatus = useReaderStore((s) => s.setEpubTocStatus);
  const openSide = useReaderStore((s) => s.openSide);
  const setFocusAnnotationId = useReaderStore(
    (s) => s.setFocusAnnotationId,
  );
  const setAnnotationLocatorState = useReaderStore(
    (s) => s.setAnnotationLocatorState,
  );
  const setCurrentEpubHref = useReaderStore((s) => s.setCurrentEpubHref);
  const annotationFileId = useAnnotationStore((s) => s.fileId);
  const annotationItems = useAnnotationStore((s) => s.items);
  const loadAnnotations = useAnnotationStore((s) => s.loadForFile);
  const epubHighlightRefs = useRef(new Map<string, EpubHighlightRef>());
  /** 每个 fileId 只自动适应一次 */
  const autoFitAppliedRef = useRef<string | null>(null);
  const setPendingLocatorUnavailable = useReaderStore(
    (s) => s.setPendingLocatorUnavailable,
  );

  const beginEpubDisplay = useCallback((
    kind: EpubDisplayKind,
    identity: string,
    handoff?: ReaderLocatorHandoff,
  ): EpubDisplayToken => {
    activeDisplayRef.current?.controller.abort();
    displayGenerationRef.current += 1;
    const token: EpubDisplayToken = {
      generation: displayGenerationRef.current,
      fileId,
      kind,
      identity,
      handoff,
      controller: new AbortController(),
    };
    activeDisplayRef.current = token;
    return token;
  }, [fileId]);

  const isCurrentEpubDisplay = useCallback(
    (token: EpubDisplayToken, rendition?: Rendition) => {
      const state = useReaderStore.getState();
      const current = activeDisplayRef.current;
      if (
        current?.generation !== token.generation ||
        current?.controller !== token.controller ||
        (rendition && renditionRef.current !== rendition)
      ) {
        return false;
      }
      if (
        !isCurrentEpubDisplayRequest(
          token.generation,
          displayGenerationRef.current,
          token.fileId,
          state.fileId,
          token.controller.signal.aborted,
        )
      ) {
        return false;
      }
      if (
        token.kind === 'handoff' &&
        token.handoff &&
        !sameReaderLocatorHandoff(state.pendingLocator, token.handoff)
      ) {
        return false;
      }
      if (
        token.kind === 'annotation' &&
        state.annotationJumpId !== token.identity
      ) {
        return false;
      }
      if (
        token.kind === 'toc' &&
        state.pendingEpubTocHref !== token.identity
      ) {
        return false;
      }
      return true;
    },
    [],
  );

  const finishEpubDisplay = useCallback((token: EpubDisplayToken) => {
    if (activeDisplayRef.current?.generation !== token.generation) return;
    token.controller.abort();
    activeDisplayRef.current = null;
  }, []);

  // 完成和 effect cleanup 共享同一代际关闭语义，避免两份相同的 abort 逻辑漂移。
  const cancelEpubDisplayIfCurrent = finishEpubDisplay;

  const guardedEpubDisplay = useCallback(
    async (
      rendition: Rendition,
      target: string | undefined,
      token: EpubDisplayToken,
    ): Promise<boolean> => {
      if (!isCurrentEpubDisplay(token, rendition)) return false;
      try {
        if (target) {
          await rendition.display(target);
        } else {
          await rendition.display();
        }
      } catch (error) {
        if (!isCurrentEpubDisplay(token, rendition)) return false;
        throw error;
      }
      return isCurrentEpubDisplay(token, rendition);
    },
    [isCurrentEpubDisplay],
  );

  const beginPageMove = useCallback(
    (move: () => Promise<unknown> | unknown) => {
      const rendition = renditionRef.current;
      if (!rendition || status !== 'ready') return;
      const token = beginEpubDisplay(
        'page',
        `keyboard:${displayGenerationRef.current + 1}`,
      );
      void (async () => {
        try {
          if (!isCurrentEpubDisplay(token, rendition)) return;
          await move();
          if (!isCurrentEpubDisplay(token, rendition)) return;
          const current = await rendition.currentLocation();
          if (!current || !isCurrentEpubDisplay(token, rendition)) return;
          const page = epubPageFromLocation(current.location);
          if (page != null) {
            skipDisplayRef.current = true;
            setCurrentPage(page);
          }
          setCurrentEpubHref(current.href ?? null);
        } catch {
          // 键盘翻页失败时保留当前阅读位置。
        } finally {
          if (isCurrentEpubDisplay(token, rendition)) {
            finishEpubDisplay(token);
          }
        }
      })();
    },
    [
      beginEpubDisplay,
      finishEpubDisplay,
      isCurrentEpubDisplay,
      setCurrentEpubHref,
      setCurrentPage,
      status,
    ],
  );

  useEffect(() => {
    if (annotationFileId === fileId) return;
    void loadAnnotations(fileId);
  }, [annotationFileId, fileId, loadAnnotations]);

  const syncEpubHighlights = useCallback(
    (rendition: Rendition, annotations: readonly Annotation[]) => {
      const valid = new Map(
        annotations
          .filter(
            (annotation) =>
              annotation.fileId === fileId && isEpubCfi(annotation.anchor),
          )
          .map((annotation) => [
            annotation.id,
            {
              cfi: annotation.anchor.trim(),
              preview: annotationPreview(
                annotation.body.trim() || annotation.quotedText || '',
              ),
            },
          ]),
      );

      for (const [id, previous] of epubHighlightRefs.current) {
        const next = valid.get(id);
        if (
          !next ||
          next.cfi !== previous.cfi ||
          next.preview !== previous.preview
        ) {
          rendition.annotations.remove(previous.cfi, 'highlight');
          epubHighlightRefs.current.delete(id);
        }
      }

      for (const annotation of annotations) {
        const next = valid.get(annotation.id);
        const previous = epubHighlightRefs.current.get(annotation.id);
        if (!next) {
          if (annotation.fileId === fileId) {
            setAnnotationLocatorState(
              fileId,
              annotation.id,
              'unavailable',
              'EPUB 批注缺少可重放的 CFI 定位',
            );
          }
          continue;
        }
        if (
          previous?.cfi === next.cfi &&
          previous.preview === next.preview
        ) {
          decorateEpubHighlight(
            rendition,
            annotation.id,
            next.preview,
            () => {
              openSide();
              setFocusAnnotationId(annotation.id);
            },
            hostRef.current,
          );
          continue;
        }
        const color = EPUB_HIGHLIGHT_COLORS[annotation.color];
        const activate = () => {
          openSide();
          setFocusAnnotationId(annotation.id);
        };
        try {
          const record = rendition.annotations.highlight(
            next.cfi,
            {
              annotationId: annotation.id,
              preview: next.preview,
            },
            activate,
            `xuesen-annotation-${annotation.color}`,
            {
              fill: color.fill,
              'fill-opacity': color.opacity,
              'mix-blend-mode': 'multiply',
            },
          ) as unknown as EpubAnnotationMark | undefined;
          epubHighlightRefs.current.set(annotation.id, next);
          setAnnotationLocatorState(fileId, annotation.id, 'available');
          const markElement = record?.mark?.element;
          if (markElement) {
            markElement.setAttribute('title', next.preview || '批注高亮');
            markElement.setAttribute(
              'aria-label',
              next.preview ? `批注高亮：${next.preview}` : '批注高亮',
            );
          }
          decorateEpubHighlight(
            rendition,
            annotation.id,
            next.preview,
            activate,
            hostRef.current,
          );
        } catch {
          setAnnotationLocatorState(
            fileId,
            annotation.id,
            'unavailable',
            'EPUB 批注的 CFI 无法在当前文档结构中定位',
          );
        }
      }
    },
    [fileId, openSide, setAnnotationLocatorState, setFocusAnnotationId],
  );

  const replayPendingLocator = useCallback(async (
    book: Book,
    rendition: Rendition,
    total: number,
  ): Promise<boolean> => {
    const state = useReaderStore.getState();
    const handoff = state.pendingLocator;
    if (
      handoff?.fileId !== fileId ||
      (state.pendingLocatorUnavailable &&
        sameReaderLocatorHandoff(state.pendingLocatorUnavailable.handoff, handoff))
    ) {
      return false;
    }
    const token = beginEpubDisplay(
      'handoff',
      `${handoff.matrixId}:${handoff.rowId}`,
      handoff,
    );
    let target: string | null = null;
    let failureReason = 'EPUB 来源定位无法恢复';
    if (handoff.locator.kind === 'epub-cfi') {
      const structuralReason = epubLocatorUnavailableReason(
        handoff.locator,
        total,
      );
      if (structuralReason) {
        failureReason = structuralReason;
      } else if (handoff.locator.cfi && isEpubCfi(handoff.locator.cfi)) {
        target = handoff.locator.cfi.trim();
      } else if (handoff.locator.location != null) {
        try {
          target = book.locations.cfiFromLocation(handoff.locator.location);
        } catch {
          target = null;
        }
        if (!target) {
          failureReason = 'EPUB location 无法转换为当前文档的 CFI';
        }
      }
    } else if (handoff.locator.kind === 'unresolved') {
      failureReason = handoff.locator.reason;
    } else {
      failureReason = 'EPUB 来源定位类型与当前文档不匹配';
    }
    try {
      if (!target) throw new Error(failureReason);
      const displayed = await guardedEpubDisplay(rendition, target, token);
      if (!displayed) return false;
      if (
        !isCurrentEpubDisplay(token, rendition) ||
        !sameReaderLocatorHandoff(
          useReaderStore.getState().pendingLocator,
          handoff,
        )
      ) {
        return false;
      }
      const current = await rendition.currentLocation();
      if (!current || !isCurrentEpubDisplay(token, rendition)) return false;
      const page = epubPageFromLocation(current.location);
      if (page != null) {
        skipDisplayRef.current = true;
        setCurrentPage(page);
      }
      setCurrentEpubHref(current.href ?? null);
      if (!isCurrentEpubDisplay(token, rendition)) return false;
      finishEpubDisplay(token);
      useReaderStore.getState().clearPendingLocatorUnavailable(handoff);
      useReaderStore.getState().clearPendingLocator(handoff);
      return true;
    } catch (error) {
      if (
        isCurrentEpubDisplay(token, rendition) &&
        sameReaderLocatorHandoff(
          useReaderStore.getState().pendingLocator,
          handoff,
        )
      ) {
        setPendingLocatorUnavailable(
          handoff,
          error instanceof Error && error.message
            ? error.message
            : failureReason,
        );
        openSide();
      }
    } finally {
      if (isCurrentEpubDisplay(token, rendition)) finishEpubDisplay(token);
    }
    return false;
  }, [
    beginEpubDisplay,
    fileId,
    finishEpubDisplay,
    guardedEpubDisplay,
    isCurrentEpubDisplay,
    openSide,
    setPendingLocatorUnavailable,
    setCurrentEpubHref,
    setCurrentPage,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const highlightRefs = epubHighlightRefs.current;
    const isCurrentFile = () => useReaderStore.getState().fileId === fileId;
    let cancelled = false;

    setStatus('loading');
    setErrorMessage(null);
    setEpubToc([]);
    setEpubTocStatus('loading');
    highlightRefs.clear();
    skipDisplayRef.current = false;
    initialLocationCommittedRef.current = false;
    displayGenerationRef.current += 1;

    (async () => {
      try {
        const record = await getFileBlob(fileId);
        if (cancelled) return;
        if (!record?.blob) {
          setStatus('error');
          setErrorMessage('未找到文件内容，请重新导入');
          if (isCurrentFile()) setEpubTocStatus('error');
          return;
        }

        // blob: URL 没有 .epub 后缀时会被 epub.js 误判为目录输入；
        // 传入二进制让它稳定走压缩 EPUB 的 unarchive 路径。
        const book = ePub(await record.blob.arrayBuffer());
        if (cancelled) return;
        bookRef.current = book;
        await book.ready;
        if (cancelled) return;

        // navigation 单独投影，不阻塞正文 rendition.display。
        void book.loaded.navigation
          .then((navigation) => {
            if (cancelled || !isCurrentFile()) return;
            setEpubToc(flattenEpubToc(navigation.toc));
            setEpubTocStatus('ready');
          })
          .catch(() => {
            if (cancelled || !isCurrentFile()) return;
            setEpubToc([]);
            setEpubTocStatus('error');
          });

        const rendition = book.renderTo(host, {
          width: '100%',
          // epub.js 对百分比高度的 stage 不会回读 min-height，导致 iframe 高度为 0。
          height: Math.max(320, host.clientHeight),
          flow: pageMode === 'scroll' ? 'scrolled' : 'paginated',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.themes.registerCss(
          'default',
          themeCss(useReaderStore.getState().zoomPercent),
        );
        let total = 1;

        const commitLocation = (location: {
          start?: {
            location?: number;
            href?: string | null;
          };
        }, token?: EpubDisplayToken) => {
          if (cancelled || !isCurrentFile()) return;
          if (
            token
              ? !isCurrentEpubDisplay(token, rendition)
              : activeDisplayRef.current
          ) {
            return;
          }
          const start = location.start;
          const page = epubPageFromLocation(start?.location, total);
          if (page != null) {
            skipDisplayRef.current = true;
            setCurrentPage(page);
          }
          if (start?.href !== undefined) {
            setCurrentEpubHref(start.href ?? null);
          }
          initialLocationCommittedRef.current = true;
        };

        const commitCurrentLocation = async (
          token: EpubDisplayToken,
        ): Promise<boolean> => {
          try {
            const current = await rendition.currentLocation();
            if (!current || !isCurrentEpubDisplay(token, rendition)) return false;
            commitLocation({ start: current }, token);
            return isCurrentEpubDisplay(token, rendition);
          } catch {
            // 当前视图尚未完成布局时，后续 relocated 事件仍会提交真实位置。
            return false;
          }
        };

        rendition.on('relocated', commitLocation);

        rendition.hooks.content.register((contents: Contents) => {
          paintThemeVars(contents.document);
          const keys = epubLineKeys(contents.sectionIndex, contents.document);
          registerLineKeys(keys);
          markLinesRead(keys);
        });

        rendition.on('selected', (cfiRange: string, contents: Contents) => {
          try {
            const text = contents.window.getSelection()?.toString().trim() ?? '';
            if (!text || !isEpubCfi(cfiRange)) return;
            const rect = contents.range(cfiRange).getBoundingClientRect();
            const frame = contents.window.frameElement;
            const frameRect = frame?.getBoundingClientRect();
            const top = (frameRect?.top ?? 0) + rect.top;
            const left = (frameRect?.left ?? 0) + rect.left;
            window.dispatchEvent(
              new CustomEvent(EPUB_SELECTION_EVENT, {
                detail: {
                  text,
                  cfi: cfiRange,
                  page: contents.sectionIndex,
                  top,
                  left,
                  bottom: (frameRect?.top ?? 0) + rect.bottom,
                  width: rect.width,
                },
              }),
            );
          } catch {
            /* 选区 CFI 无法回放时，不阻塞 EPUB 阅读。 */
          }
        });

        const initialToken = beginEpubDisplay('page', 'initial');
        if (!isCurrentEpubDisplay(initialToken, rendition)) return;
        const displayed = await guardedEpubDisplay(
          rendition,
          undefined,
          initialToken,
        );
        if (cancelled || !displayed) return;
        await commitCurrentLocation(initialToken);
        if (isCurrentEpubDisplay(initialToken, rendition)) {
          finishEpubDisplay(initialToken);
        }

        await book.locations.generate(1600);
        if (cancelled) return;
        const locationCount = book.locations.length();
        total =
          Number.isFinite(locationCount) && locationCount > 0
            ? locationCount
            : 1;
        setTotalPages(total);

        await replayPendingLocator(book, rendition, total);

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        if (isCurrentFile()) setEpubTocStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'EPUB 加载失败',
        );
      }
    })();

    return () => {
      cancelled = true;
      displayGenerationRef.current += 1;
      activeDisplayRef.current?.controller.abort();
      activeDisplayRef.current = null;
      if (isCurrentFile()) {
        setEpubToc([]);
        setEpubTocStatus('idle');
      }
      highlightRefs.clear();
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      if (isCurrentFile()) setCurrentEpubHref(null);
      host.replaceChildren();
    };
  }, [
    beginEpubDisplay,
    fileId,
    finishEpubDisplay,
    guardedEpubDisplay,
    isCurrentEpubDisplay,
    pageMode,
    replayPendingLocator,
    setCurrentEpubHref,
    setEpubToc,
    setEpubTocStatus,
    setCurrentPage,
    setTotalPages,
  ]);

  useEffect(() => {
    if (status !== 'ready') return;
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition) return;
    const locationCount = book.locations.length();
    void replayPendingLocator(
      book,
      rendition,
      Number.isFinite(locationCount) && locationCount > 0 ? locationCount : 1,
    );
  }, [
    fileId,
    pendingLocator,
    pendingLocatorUnavailable,
    replayPendingLocator,
    status,
  ]);

  useEffect(() => {
    if (status !== 'ready') return;
    const rendition = renditionRef.current;
    if (!rendition || annotationFileId !== fileId) return;
    syncEpubHighlights(rendition, annotationItems);
    const onRendered = () => {
      syncEpubHighlights(rendition, annotationItems);
    };
    rendition.on('rendered', onRendered);
    return () => rendition.off('rendered', onRendered);
  }, [
    annotationFileId,
    annotationItems,
    fileId,
    status,
    syncEpubHighlights,
  ]);

  useEffect(() => {
    if (status !== 'ready' || !pendingEpubTocHref) return;
    const rendition = renditionRef.current;
    if (!rendition) return;
    const href = pendingEpubTocHref;
    const token = beginEpubDisplay('toc', href);
    void (async () => {
      try {
        const displayed = await guardedEpubDisplay(rendition, href, token);
        if (!displayed) return;
        const current = await rendition.currentLocation();
        if (!current || !isCurrentEpubDisplay(token, rendition)) return;
        const page = epubPageFromLocation(current.location);
        if (page != null) {
          skipDisplayRef.current = true;
          setCurrentPage(page);
        }
        setCurrentEpubHref(current.href ?? null);
        if (isCurrentEpubDisplay(token, rendition)) {
          clearEpubTocHref(href);
          finishEpubDisplay(token);
        }
      } catch {
        if (isCurrentEpubDisplay(token, rendition)) {
          finishEpubDisplay(token);
          clearEpubTocHref(href);
          toast.show('该目录条目暂时无法跳转');
        }
      } finally {
        if (isCurrentEpubDisplay(token, rendition)) {
          finishEpubDisplay(token);
        }
      }
    })();
    return () => cancelEpubDisplayIfCurrent(token);
  }, [
    beginEpubDisplay,
    cancelEpubDisplayIfCurrent,
    clearEpubTocHref,
    finishEpubDisplay,
    guardedEpubDisplay,
    isCurrentEpubDisplay,
    pendingEpubTocHref,
    setCurrentEpubHref,
    setCurrentPage,
    status,
  ]);

  useEffect(() => {
    if (status !== 'ready' || !annotationJumpId) return;
    const annotation = annotationItems.find(
      (item) => item.fileId === fileId && item.id === annotationJumpId,
    );
    const rendition = renditionRef.current;
    if (!rendition) return;
    if (!annotation) {
      if (annotationFileId === fileId) {
        clearAnnotationJumpIfCurrent(fileId, annotationJumpId);
      }
      return;
    }
    const requestedFileId = fileId;
    const requestedAnnotationId = annotationJumpId;
    const token = beginEpubDisplay(
      'annotation',
      requestedAnnotationId,
    );
    const isCurrentAnnotationRequest = () =>
      isCurrentEpubDisplay(token, rendition);
    if (!isEpubCfi(annotation.anchor)) {
      if (isCurrentAnnotationRequest()) {
        setAnnotationLocatorState(
          requestedFileId,
          requestedAnnotationId,
          'unavailable',
          'EPUB 批注缺少可重放的 CFI 定位',
        );
        openSide();
        finishEpubDisplay(token);
        clearAnnotationJumpIfCurrent(
          requestedFileId,
          requestedAnnotationId,
        );
      }
      return;
    }
    void (async () => {
      try {
        const displayed = await guardedEpubDisplay(
          rendition,
          annotation.anchor.trim(),
          token,
        );
        if (!displayed || !isCurrentAnnotationRequest()) return;
        syncEpubHighlights(rendition, annotationItems);
        if (!isCurrentAnnotationRequest()) return;
        flashEpubHighlight(
          rendition,
          requestedAnnotationId,
          token.generation,
          isCurrentAnnotationRequest,
          hostRef.current,
        );
      } catch {
        if (!isCurrentAnnotationRequest()) return;
        setAnnotationLocatorState(
          requestedFileId,
          requestedAnnotationId,
          'unavailable',
          'EPUB 批注 CFI 无法在当前文档结构中定位',
        );
        openSide();
        toast.show('该批注原文暂时无法跳转');
      } finally {
        if (isCurrentAnnotationRequest()) {
          finishEpubDisplay(token);
          clearAnnotationJumpIfCurrent(
            requestedFileId,
            requestedAnnotationId,
          );
        }
      }
    })();
    return () => cancelEpubDisplayIfCurrent(token);
  }, [
    annotationFileId,
    annotationItems,
    annotationJumpId,
    beginEpubDisplay,
    cancelEpubDisplayIfCurrent,
    clearAnnotationJumpIfCurrent,
    fileId,
    finishEpubDisplay,
    guardedEpubDisplay,
    isCurrentEpubDisplay,
    openSide,
    status,
    setAnnotationLocatorState,
    syncEpubHighlights,
  ]);

  // 字号变化：更新主题；行键在 content hook 中按稳定 section+index 重登记
  useEffect(() => {
    const r = renditionRef.current;
    if (!r || status !== 'ready') return;
    r.themes.registerCss('default', themeCss(zoomPercent));
    r.themes.select('default');
    for (const contents of getEpubContents(r)) {
      paintThemeVars(contents.document);
    }
  }, [resolvedTheme, status, zoomPercent]);

  // 设置「默认适应宽度」：就绪后触发一次（EPUB 为重置舒适字号）
  useEffect(() => {
    if (status !== 'ready' || !defaultFitWidth) return;
    if (autoFitAppliedRef.current === fileId) return;
    autoFitAppliedRef.current = fileId;
    requestFitWidth();
  }, [status, defaultFitWidth, fileId, requestFitWidth]);

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
    if (status !== 'ready') return;
    if (skipDisplayRef.current) {
      skipDisplayRef.current = false;
      return;
    }
    if (!initialLocationCommittedRef.current) return;
    const book = bookRef.current;
    const r = renditionRef.current;
    if (!book || !r) return;
    const total = book.locations.length() || 1;
    const cfi = book.locations.cfiFromLocation(
      Math.max(0, Math.min(total - 1, currentPage - 1)),
    );
    if (!cfi) return;
    const token = beginEpubDisplay('page', String(currentPage));
    void (async () => {
      try {
        const displayed = await guardedEpubDisplay(r, cfi, token);
        if (!displayed) return;
        const current = await r.currentLocation();
        if (!current || !isCurrentEpubDisplay(token, r)) return;
        const page = epubPageFromLocation(current.location, total);
        if (page != null) setCurrentPage(page);
        setCurrentEpubHref(current.href ?? null);
      } catch {
        // 用户手动翻页失败时保留当前阅读位置，不覆盖来源定位状态。
      } finally {
        if (isCurrentEpubDisplay(token, r)) finishEpubDisplay(token);
      }
    })();
    return () => cancelEpubDisplayIfCurrent(token);
  }, [
    beginEpubDisplay,
    cancelEpubDisplayIfCurrent,
    currentPage,
    finishEpubDisplay,
    guardedEpubDisplay,
    isCurrentEpubDisplay,
    setCurrentEpubHref,
    setCurrentPage,
    status,
  ]);

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
        beginPageMove(() => r.prev());
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault();
        beginPageMove(() => r.next());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginPageMove, status]);

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
