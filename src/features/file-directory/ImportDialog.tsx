/**
 * ImportDialog - 文件导入对话框
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4.2 导入 Dialog
 */
import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button, Dialog, toast } from '../../components/common';
import { useFileStore } from '../../stores/fileStore';
import { IMPORT_MAX_BYTES, IMPORT_MAX_COUNT } from '../../utils/fileType';
import styles from './ImportDialog.module.css';

/**
 * ImportDialog - 开关与进度来自 fileStore
 */
export function ImportDialog() {
  const open = useFileStore((s) => s.importOpen);
  const items = useFileStore((s) => s.importItems);
  const closeImport = useFileStore((s) => s.closeImport);
  const importFiles = useFileStore((s) => s.importFiles);
  const cancelImportItem = useFileStore((s) => s.cancelImportItem);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (files.length > IMPORT_MAX_COUNT) {
      toast.warning(`单次最多导入 ${IMPORT_MAX_COUNT} 个文件`);
    }
    setBusy(true);
    try {
      const count = await importFiles(files);
      if (count > 0) {
        toast.success(`成功导入 ${count} 个文件`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) closeImport();
      }}
      title="导入文件"
      aria-label="导入文件"
      size="form"
      footer={
        <Button
          aria-label="完成导入"
          variant="primary"
          disabled={busy}
          onClick={closeImport}
        >
          完成
        </Button>
      }
    >
      <div
        className={[styles.dropzone, dragging ? styles.dropzoneActive : '']
          .filter(Boolean)
          .join(' ')}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Upload size={32} strokeWidth={1.5} aria-hidden="true" />
        <p className={styles.dropTitle}>拖拽文件到此处，或点击选择</p>
        <Button
          aria-label="选择要导入的文件"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          选择文件
        </Button>
        <input
          ref={inputRef}
          type="file"
          className={styles.hiddenInput}
          accept=".pdf,.epub,.md,.markdown,.txt,application/pdf,application/epub+zip,text/markdown,text/plain"
          multiple
          aria-label="选择导入文件"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <p className={styles.hint}>
        支持 PDF、EPUB、Markdown、TXT；单次最多 {IMPORT_MAX_COUNT} 个，单文件最大{' '}
        {IMPORT_MAX_BYTES / (1024 * 1024)} MB。
      </p>

      {items.length > 0 ? (
        <ul className={styles.list} aria-label="导入进度">
          {items.map((item) => (
            <li key={item.localKey} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemName}>{item.fileName}</span>
                {item.status === 'pending' || item.status === 'importing' ? (
                  <button
                    type="button"
                    className={styles.cancel}
                    aria-label={`取消导入 ${item.fileName}`}
                    onClick={() => cancelImportItem(item.localKey)}
                  >
                    取消
                  </button>
                ) : (
                  <span className={styles.status}>{item.status}</span>
                )}
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuenow={item.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.fileName} 进度`}
              >
                <div
                  className={[
                    styles.progressBar,
                    styles[
                      `p${Math.min(100, Math.round(item.progress / 20) * 20)}` as
                        | 'p0'
                        | 'p20'
                        | 'p40'
                        | 'p60'
                        | 'p80'
                        | 'p100'
                    ],
                  ].join(' ')}
                />
              </div>
              {item.error ? (
                <p className={styles.error}>{item.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Dialog>
  );
}
