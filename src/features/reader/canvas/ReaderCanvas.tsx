/**
 * ReaderCanvas - 阅读画布容器（调度 PDF / EPUB 渲染器）
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.3
 */
import { useReaderStore } from '../../../stores/readerStore';
import { EpubRenderer } from './EpubRenderer';
import { PdfRenderer } from './PdfRenderer';
import { SelectionToolbar } from './SelectionToolbar';
import styles from './ReaderCanvas.module.css';

/**
 * ReaderCanvas - 无外部 props；状态来自 readerStore
 * 缩放由各渲染器自行处理（PDF.js viewport scale），此处不做 CSS transform，避免糊屏与双重缩放
 */
export function ReaderCanvas() {
  const fileId = useReaderStore((s) => s.fileId);
  const fileType = useReaderStore((s) => s.fileType);
  const pageMode = useReaderStore((s) => s.pageMode);

  return (
    <div
      className={styles.root}
      data-mode={pageMode}
      aria-label="阅读画布"
    >
      <div className={styles.stage}>
        {!fileId || !fileType ? (
          <p className={styles.empty}>未打开文件</p>
        ) : fileType === 'pdf' ? (
          <PdfRenderer fileId={fileId} />
        ) : fileType === 'epub' ? (
          <EpubRenderer fileId={fileId} />
        ) : (
          <div className={styles.empty} role="status">
            <p>「{fileType.toUpperCase()}」纯文本阅读将在后续步骤支持</p>
            <p className={styles.hint}>当前为布局占位</p>
          </div>
        )}
      </div>
      <SelectionToolbar />
    </div>
  );
}
