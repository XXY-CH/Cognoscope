/**
 * AnnotationPanel - 批注列表（本地 IndexedDB）
 * 所属页面：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.6 / §14
 */
import { useEffect, useState } from 'react';
import { Badge, Button } from '../../../components/common';
import { useAnnotationStore } from '../../../stores/annotationStore';
import { useReaderStore } from '../../../stores/readerStore';
import { formatFriendlyTime } from '../../../utils/format';
import { AnnotationBodyField } from './AnnotationBodyField';
import styles from './AnnotationPanel.module.css';

/**
 * AnnotationPanel - 从 annotationStore 加载当前文件批注
 */
export function AnnotationPanel() {
  const fileId = useReaderStore((s) => s.fileId);
  const currentPage = useReaderStore((s) => s.currentPage);
  const focusAnnotationId = useReaderStore((s) => s.focusAnnotationId);
  const setFocusAnnotationId = useReaderStore((s) => s.setFocusAnnotationId);
  const items = useAnnotationStore((s) => s.items);
  const status = useAnnotationStore((s) => s.status);
  const loadForFile = useAnnotationStore((s) => s.loadForFile);
  const clear = useAnnotationStore((s) => s.clear);
  const addBlank = useAnnotationStore((s) => s.addBlank);
  const remove = useAnnotationStore((s) => s.remove);
  const updateBody = useAnnotationStore((s) => s.updateBody);
  /** 划词新建后只 autoFocus 一次，避免列表重渲染反复抢焦点 */
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      clear();
      return;
    }
    void loadForFile(fileId);
    return () => clear();
  }, [fileId, loadForFile, clear]);

  // 划词「批注」后聚焦新卡片正文（§8.7）
  useEffect(() => {
    if (!focusAnnotationId) return;
    setPendingFocusId(focusAnnotationId);
    setFocusAnnotationId(null);
  }, [focusAnnotationId, setFocusAnnotationId]);

  return (
    <div className={styles.root} aria-label="批注面板">
      <div className={styles.toolbar}>
        <Badge aria-label={`全部批注 ${items.length}`} soft>
          全部 {items.length}
        </Badge>
        <Button
          aria-label="添加全文批注"
          variant="ghost"
          size="sm"
          disabled={!fileId}
          onClick={() => {
            if (!fileId) return;
            void addBlank(fileId, currentPage).then((ann) => {
              setPendingFocusId(ann.id);
            });
          }}
        >
          + 添加全文批注
        </Button>
      </div>

      {status === 'loading' ? (
        <p className={styles.empty}>加载批注中…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          暂无批注。可添加全文批注，或划词后点击「批注」。
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((ann) => (
            <li key={ann.id} className={styles.card} data-ann-id={ann.id}>
              {ann.quotedText ? (
                <p className={styles.quote}>{ann.quotedText}</p>
              ) : null}
              <AnnotationBodyField
                annotationId={ann.id}
                body={ann.body}
                autoFocus={pendingFocusId === ann.id}
                onCommit={(id, next) => {
                  void updateBody(id, next);
                  if (pendingFocusId === id) setPendingFocusId(null);
                }}
              />
              <div className={styles.cardFooter}>
                <span className={styles.meta}>
                  第 {ann.page} 页 · {formatFriendlyTime(ann.updatedAt)}
                </span>
                <Button
                  aria-label="删除批注"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void remove(ann.id);
                  }}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
