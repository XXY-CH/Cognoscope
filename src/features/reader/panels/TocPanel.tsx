/**
 * TocPanel - 目录 / 书签面板（左侧）
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.4
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Bookmark, List, Pencil, Trash2 } from 'lucide-react';
import { EmptyState, IconButton } from '../../../components/common';
import { useHorizontalResize } from '../../../hooks/usePanelResize';
import { useBookmarkStore } from '../../../stores/bookmarkStore';
import { useReaderStore } from '../../../stores/readerStore';
import type { AnnotationColor } from '../../../types';
import styles from './TocPanel.module.css';

type TocTab = 'toc' | 'bookmarks';

const BM_COLORS: AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];

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
  const setTocWidth = useReaderStore((s) => s.setTocWidth);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const tocTabRequest = useReaderStore((s) => s.tocTabRequest);
  const clearTocTabRequest = useReaderStore((s) => s.clearTocTabRequest);
  const pdfOutline = useReaderStore((s) => s.pdfOutline);
  const [tab, setTab] = useState<TocTab>('toc');
  /** 拖拽调宽时关闭过渡 */
  const [dragging, setDragging] = useState(false);
  /** 正在编辑名称的书签 id */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
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
        </div>

        <div className={styles.body} role="tabpanel">
          {tab === 'toc' ? (
            pdfOutline.length === 0 ? (
              <EmptyState
                aria-label="目录空状态"
                icon={<List strokeWidth={1.5} />}
                title="无目录"
                description="当前文档没有可用的目录大纲。"
              />
            ) : (
              <ul className={styles.outlineList} aria-label="目录大纲">
                {pdfOutline.map((item, i) => (
                  <li key={`${item.page}-${i}`}>
                    <button
                      type="button"
                      className={styles.outlineItem}
                      data-level={item.level}
                      aria-label={`跳转到 ${item.title}`}
                      onClick={() => setCurrentPage(item.page)}
                    >
                      <span className={styles.outlinePage}>{item.page}</span>
                      <span className={styles.outlineTitle}>{item.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
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
