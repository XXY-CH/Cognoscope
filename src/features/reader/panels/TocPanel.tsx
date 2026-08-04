/**
 * TocPanel - 目录 / 书签面板（左侧）
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.4
 */
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefCallback,
} from 'react';
import { Bookmark, List, Pencil, Trash2, X } from 'lucide-react';
import { EmptyState, IconButton } from '../../../components/common';
import { useHorizontalResize } from '../../../hooks/usePanelResize';
import { useBookmarkStore } from '../../../stores/bookmarkStore';
import { useReaderStore } from '../../../stores/readerStore';
import type { AnnotationColor } from '../../../types';
import styles from './TocPanel.module.css';

type TocTab = 'toc' | 'bookmarks';

const BM_COLORS: AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];

interface OutlineEntry {
  id: string;
  title: string;
  level: number;
  fileKind: 'pdf' | 'epub';
  page?: number;
  href?: string;
  parentIds: readonly string[];
}

interface OutlineNode {
  key: string;
  entry: OutlineEntry | null;
  index: number;
  children: OutlineNode[];
}

function buildOutlineTree(entries: readonly OutlineEntry[]): OutlineNode[] {
  const roots: OutlineNode[] = [];

  const nodesByKey = new Map<string, OutlineNode>();
  const appendOnce = (parent: OutlineNode | null, node: OutlineNode) => {
    const children = parent ? parent.children : roots;
    if (!children.some((child) => child.key === node.key)) {
      children.push(node);
    }
  };
  const ensureNode = (
    key: string,
    entry: OutlineEntry | null = null,
    index = -1,
  ): OutlineNode => {
    const existing = nodesByKey.get(key);
    if (existing) {
      if (entry) {
        existing.entry = entry;
        existing.index = index;
      }
      return existing;
    }
    const node: OutlineNode = {
      key,
      entry,
      index,
      children: [],
    };
    nodesByKey.set(key, node);
    return node;
  };

  entries.forEach((entry, index) => {
    const level = Math.max(0, Math.floor(entry.level));
    let parent: OutlineNode | null = null;
    for (const parentId of entry.parentIds) {
      const ancestor = ensureNode(parentId);
      appendOnce(parent, ancestor);
      parent = ancestor;
    }
    const node = ensureNode(entry.id, { ...entry, level }, index);
    appendOnce(parent, node);
  });

  return roots;
}

interface OutlineTreeProps {
  nodes: readonly OutlineNode[];
  activeIndex: number;
  onSelect: (entry: OutlineEntry) => void;
  listRef?: RefCallback<HTMLUListElement>;
  ariaLabel?: string;
}

function OutlineTree({
  nodes,
  activeIndex,
  onSelect,
  listRef,
  ariaLabel,
}: OutlineTreeProps): ReactNode {
  return (
    <ul
      ref={listRef}
      className={styles.outlineList}
      aria-label={ariaLabel}
    >
      {nodes.map((node) => {
        if (!node.entry) {
          return (
            <li key={node.key} className={styles.outlinePlaceholder}>
              {node.children.length > 0 ? (
                <OutlineTree
                  nodes={node.children}
                  activeIndex={activeIndex}
                  onSelect={onSelect}
                />
              ) : null}
            </li>
          );
        }
        const active = node.index === activeIndex;
        const { entry } = node;
        const interactive = entry.fileKind === 'pdf' || Boolean(entry.href);
        const itemContent = (
          <>
            {entry.page != null ? (
              <span className={styles.outlinePage}>{entry.page}</span>
            ) : null}
            <span className={styles.outlineTitle}>{entry.title}</span>
          </>
        );
        return (
          <li key={node.key}>
            {interactive ? (
              <button
                type="button"
                className={styles.outlineItem}
                data-level={entry.level}
                data-file-kind={entry.fileKind}
                data-active={active ? 'true' : undefined}
                aria-current={active ? 'location' : undefined}
                aria-label={
                  entry.fileKind === 'pdf' && entry.page != null
                    ? `跳转到 ${entry.title}，第 ${entry.page} 页`
                    : `跳转到 ${entry.title}`
                }
                onClick={() => onSelect(entry)}
              >
                {itemContent}
              </button>
            ) : (
              <div
                className={styles.outlineItem}
                data-level={entry.level}
                data-file-kind={entry.fileKind}
                data-container="true"
              >
                {itemContent}
              </div>
            )}
            {node.children.length > 0 ? (
              <OutlineTree
                nodes={node.children}
                activeIndex={activeIndex}
                onSelect={onSelect}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function canonicalEpubHref(value: string): string {
  return value
    .trim()
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
}

function epubHrefMatches(itemHref: string, currentHref: string): boolean {
  const item = canonicalEpubHref(itemHref);
  const current = canonicalEpubHref(currentHref);
  if (!item || !current) return false;
  if (item === current) return true;
  const itemPath = item.split('#', 1)[0] ?? item;
  const currentPath = current.split('#', 1)[0] ?? current;
  return (
    itemPath === currentPath ||
    itemPath.endsWith(`/${currentPath}`) ||
    currentPath.endsWith(`/${itemPath}`)
  );
}

/** 点击色点循环切换书签颜色 */
function nextColor(current: AnnotationColor): AnnotationColor {
  const i = BM_COLORS.indexOf(current);
  return BM_COLORS[(i + 1) % BM_COLORS.length] ?? 'blue';
}

/**
 * TocPanel - 宽度/折叠来自 readerStore；书签持久化 IndexedDB，支持重命名
 */
export function TocPanel() {
  const open = useReaderStore((s) => s.tocOpen);
  const width = useReaderStore((s) => s.tocWidth);
  const fileId = useReaderStore((s) => s.fileId);
  const fileType = useReaderStore((s) => s.fileType);
  const setTocWidth = useReaderStore((s) => s.setTocWidth);
  const toggleToc = useReaderStore((s) => s.toggleToc);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const requestEpubTocHref = useReaderStore((s) => s.requestEpubTocHref);
  const tocTabRequest = useReaderStore((s) => s.tocTabRequest);
  const clearTocTabRequest = useReaderStore((s) => s.clearTocTabRequest);
  const pdfOutline = useReaderStore((s) => s.pdfOutline);
  const epubToc = useReaderStore((s) => s.epubToc);
  const epubTocStatus = useReaderStore((s) => s.epubTocStatus);
  const currentPage = useReaderStore((s) => s.currentPage);
  const currentEpubHref = useReaderStore((s) => s.currentEpubHref);
  const [tab, setTab] = useState<TocTab>('toc');
  /** 拖拽调宽时关闭过渡 */
  const [dragging, setDragging] = useState(false);
  /** 正在编辑名称的书签 id */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [outlineListElement, setOutlineListElement] =
    useState<HTMLUListElement | null>(null);
  const setOutlineListRef = useCallback<RefCallback<HTMLUListElement>>(
    (node) => setOutlineListElement(node),
    [],
  );
  const items = useBookmarkStore((s) => s.items);
  const loadForFile = useBookmarkStore((s) => s.loadForFile);
  const clear = useBookmarkStore((s) => s.clear);
  const rename = useBookmarkStore((s) => s.rename);
  const setColor = useBookmarkStore((s) => s.setColor);
  const remove = useBookmarkStore((s) => s.remove);

  const resize = useHorizontalResize((dx) => {
    setTocWidth(useReaderStore.getState().tocWidth + dx);
  });

  useEffect(() => {
    if (!fileId) {
      clear();
      return;
    }
    void loadForFile(fileId);
    return () => clear();
  }, [fileId, loadForFile, clear]);

  // 外部（添加书签）请求切到书签 Tab
  useEffect(() => {
    if (!tocTabRequest) return;
    setTab(tocTabRequest);
    clearTocTabRequest();
  }, [tocTabRequest, clearTocTabRequest]);

  const outlineEntries: OutlineEntry[] =
    fileType === 'epub'
      ? epubToc.map((item) => ({
          id: item.id,
          title: item.title,
          level: item.level,
          fileKind: 'epub',
          href: item.href || undefined,
          parentIds: item.parentIds,
        }))
      : pdfOutline.map((item, index) => ({
          id: `pdf-toc-${index}`,
          title: item.title,
          level: item.level,
          fileKind: 'pdf',
          page: item.page,
          parentIds: [],
        }));
  const outlineNodes = buildOutlineTree(outlineEntries);
  const activeOutlineIndex =
    fileType === 'epub'
      ? currentEpubHref
        ? (() => {
            const current = canonicalEpubHref(currentEpubHref);
            const exact = outlineEntries.findIndex(
              (entry) =>
                Boolean(entry.href) && canonicalEpubHref(entry.href ?? '') === current,
            );
            return exact >= 0
              ? exact
              : outlineEntries.findIndex((entry) =>
                  entry.href
                    ? epubHrefMatches(entry.href, currentEpubHref)
                    : false,
                );
          })()
        : -1
      : outlineEntries.reduce(
          (activeIndex, entry, index) =>
            entry.page != null && entry.page <= currentPage
              ? index
              : activeIndex,
          -1,
        );

  useEffect(() => {
    if (tab !== 'toc' || activeOutlineIndex < 0) return;
    const active = outlineListElement?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    if (!active) return;
    const behavior = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
      ? 'auto'
      : 'smooth';
    active.scrollIntoView({ block: 'nearest', behavior });
  }, [
    activeOutlineIndex,
    currentEpubHref,
    currentPage,
    fileType,
    outlineEntries.length,
    outlineListElement,
    tab,
  ]);

  const commitRename = async () => {
    if (!editingId) return;
    const id = editingId;
    setEditingId(null);
    await rename(id, editDraft);
  };

  return (
    <aside
      className={[
        styles.root,
        open ? styles.open : styles.collapsed,
        dragging ? styles.dragging : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--toc-width': `${width}px` } as CSSProperties}
      aria-label="目录面板"
      aria-hidden={!open}
    >
      <div className={styles.inner}>
        <div className={styles.tabs} role="tablist" aria-label="目录与书签">
          <button
            type="button"
            role="tab"
            className={[styles.tab, tab === 'toc' ? styles.tabActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-selected={tab === 'toc'}
            aria-label="目录"
            onClick={() => setTab('toc')}
          >
            目录
          </button>
          <button
            type="button"
            role="tab"
            className={[
              styles.tab,
              tab === 'bookmarks' ? styles.tabActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-selected={tab === 'bookmarks'}
            aria-label="书签"
            onClick={() => setTab('bookmarks')}
          >
            书签{items.length > 0 ? ` ${items.length}` : ''}
          </button>
          <IconButton
            className={styles.mobileClose}
            aria-label="关闭目录"
            onClick={toggleToc}
          >
            <X size={18} strokeWidth={1.5} />
          </IconButton>
        </div>

        <div className={styles.body} role="tabpanel">
          {tab === 'toc' ? (
            fileType === 'epub' ? (
              epubTocStatus === 'loading' ? (
                <p className={styles.placeholder} role="status">
                  正在读取 EPUB 导航目录…
                </p>
              ) : epubTocStatus === 'error' ? (
                <EmptyState
                  aria-label="EPUB 目录读取失败"
                  icon={<List strokeWidth={1.5} />}
                  title="目录暂不可用"
                  description="导航目录读取失败，但不影响正文阅读。"
                />
              ) : epubToc.length === 0 ? (
                <EmptyState
                  aria-label="EPUB 目录空状态"
                  icon={<List strokeWidth={1.5} />}
                  title="无导航目录"
                  description="当前 EPUB 没有提供可用的 navigation 目录。"
                />
              ) : (
                <OutlineTree
                  nodes={outlineNodes}
                  activeIndex={activeOutlineIndex}
                  listRef={setOutlineListRef}
                  ariaLabel="EPUB 导航目录"
                  onSelect={(entry) => {
                    if (entry.href) requestEpubTocHref(entry.href);
                  }}
                />
              )
            ) : pdfOutline.length === 0 ? (
              <EmptyState
                aria-label="目录空状态"
                icon={<List strokeWidth={1.5} />}
                title="无目录"
                description="当前文档没有可用的目录大纲。"
              />
            ) : (
              <OutlineTree
                nodes={outlineNodes}
                activeIndex={activeOutlineIndex}
                listRef={setOutlineListRef}
                ariaLabel="目录大纲"
                onSelect={(entry) => {
                  if (entry.page != null) setCurrentPage(entry.page);
                }}
              />
            )
          ) : items.length === 0 ? (
            <EmptyState
              aria-label="书签空状态"
              icon={<Bookmark strokeWidth={1.5} />}
              title="暂无书签"
              description="点击顶栏书签图标，为当前页添加书签。"
            />
          ) : (
            <ul className={styles.bookmarkList} aria-label="书签列表">
              {items.map((bm) => (
                <li key={bm.id} className={styles.bookmarkItem}>
                  {editingId === bm.id ? (
                    <input
                      className={styles.bookmarkInput}
                      aria-label="编辑书签名称"
                      value={editDraft}
                      autoFocus
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => {
                        void commitRename();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commitRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.bookmarkBtn}
                      aria-label={`跳转到 ${bm.label}`}
                      onClick={() => setCurrentPage(bm.page)}
                      onDoubleClick={() => {
                        // 双击进入重命名，避免与跳转冲突过多
                        setEditingId(bm.id);
                        setEditDraft(bm.label);
                      }}
                    >
                      <span className={styles.bookmarkLabel}>{bm.label}</span>
                      <span className={styles.bookmarkMeta}>
                        <span
                          className={styles.bookmarkColorDot}
                          data-color={bm.color}
                          aria-hidden="true"
                        />
                        第 {bm.page} 页
                      </span>
                    </button>
                  )}
                  <div className={styles.bookmarkActions}>
                    <IconButton
                      aria-label={`切换书签颜色，当前 ${bm.color}`}
                      className={styles.bookmarkEdit}
                      onClick={(e) => {
                        void setColor(bm.id, nextColor(bm.color));
                        // 改色后失焦，避免 focus 卡住导致按钮不消失
                        e.currentTarget.blur();
                      }}
                    >
                      <span
                        className={styles.bookmarkColorDot}
                        data-color={bm.color}
                        aria-hidden="true"
                      />
                    </IconButton>
                    <IconButton
                      aria-label={`重命名书签 ${bm.label}`}
                      className={styles.bookmarkEdit}
                      onClick={() => {
                        setEditingId(bm.id);
                        setEditDraft(bm.label);
                      }}
                    >
                      <Pencil size={16} strokeWidth={1.5} />
                    </IconButton>
                    <IconButton
                      aria-label={`删除书签 ${bm.label}`}
                      className={styles.bookmarkDelete}
                      onClick={() => {
                        void remove(bm.id);
                      }}
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className={styles.resizer}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整目录面板宽度"
        onPointerDown={(e) => {
          setDragging(true);
          resize.onPointerDown(e);
        }}
        onPointerMove={resize.onPointerMove}
        onPointerUp={(e) => {
          resize.onPointerUp(e);
          setDragging(false);
        }}
      />
    </aside>
  );
}
