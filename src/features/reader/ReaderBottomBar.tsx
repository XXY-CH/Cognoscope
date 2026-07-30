/**
 * ReaderBottomBar - 阅读底栏
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.5；摄像头指示经 useCamera（§5.2 / §13 决策7）
 */
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { IconButton, Tooltip } from '../../components/common';
import { useCamera } from '../../hooks/useCamera';
import { useReaderStore } from '../../stores/readerStore';
import styles from './ReaderBottomBar.module.css';

/**
 * ReaderBottomBar - 页码、进度、已读行数、缩放、摄像头状态
 */
export function ReaderBottomBar() {
  const currentPage = useReaderStore((s) => s.currentPage);
  const totalPages = useReaderStore((s) => s.totalPages);
  const linesRead = useReaderStore((s) => s.linesRead);
  const zoomPercent = useReaderStore((s) => s.zoomPercent);
  const pageMode = useReaderStore((s) => s.pageMode);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const setZoomPercent = useReaderStore((s) => s.setZoomPercent);
  const bumpZoom = useReaderStore((s) => s.bumpZoom);

  const {
    status: cameraStatus,
    deviceId,
    previewVisible,
    startDetection,
    pauseDetection,
    resumeDetection,
  } = useCamera();

  const progress =
    totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  const camLabel =
    cameraStatus === 'active'
      ? '摄像头检测中（本地）'
      : cameraStatus === 'paused'
        ? '检测已暂停'
        : cameraStatus === 'denied'
          ? '摄像头权限被拒绝'
          : '摄像头不可用';

  const onCameraClick = () => {
    // 底栏迷你控件：点击切换启停，与仪表盘共用同一本地流
    if (cameraStatus === 'active') pauseDetection();
    else if (cameraStatus === 'paused') resumeDetection();
    else void startDetection();
  };

  return (
    <footer className={styles.root}>
      <div className={styles.left}>
        <label className={styles.pageLabel} htmlFor="reader-page-input">
          页码
        </label>
        <input
          id="reader-page-input"
          className={styles.pageInput}
          type="number"
          min={1}
          max={Math.max(1, totalPages)}
          value={currentPage}
          aria-label="当前页码"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            const max = Math.max(1, totalPages || 1);
            setCurrentPage(Math.min(max, Math.max(1, n)));
          }}
        />
        <span className={styles.total}>
          / {totalPages || '—'}
        </span>

        <Tooltip content={camLabel} aria-label="摄像头状态说明">
          <button
            type="button"
            className={styles.camChip}
            aria-label={camLabel}
            aria-pressed={cameraStatus === 'active'}
            data-device={deviceId ?? undefined}
            data-preview={previewVisible ? '1' : '0'}
            onClick={onCameraClick}
          >
            <span
              className={[
                styles.camDot,
                cameraStatus === 'active' ? styles.camLive : '',
                cameraStatus === 'paused' ? styles.camPaused : '',
                cameraStatus === 'denied' || cameraStatus === 'unavailable'
                  ? styles.camBad
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
            <span className={styles.camText}>
              {cameraStatus === 'active'
                ? '检测中'
                : cameraStatus === 'paused'
                  ? '已暂停'
                  : '摄像头'}
            </span>
          </button>
        </Tooltip>
      </div>

      <div className={styles.center}>
        {pageMode === 'single' || pageMode === 'double' ? (
          <IconButton
            aria-label="上一页"
            onClick={() =>
              setCurrentPage(currentPage - (pageMode === 'double' ? 2 : 1))
            }
            disabled={currentPage <= 1}
          >
            <ChevronLeft strokeWidth={1.5} />
          </IconButton>
        ) : null}
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={100}
          value={progress}
          aria-label="阅读进度"
          onChange={(e) => {
            if (!totalPages) return;
            const pct = Number(e.target.value) / 100;
            setCurrentPage(Math.max(1, Math.round(pct * totalPages)));
          }}
        />
        {pageMode === 'single' || pageMode === 'double' ? (
          <IconButton
            aria-label="下一页"
            onClick={() =>
              setCurrentPage(currentPage + (pageMode === 'double' ? 2 : 1))
            }
            disabled={totalPages > 0 && currentPage >= totalPages}
          >
            <ChevronRight strokeWidth={1.5} />
          </IconButton>
        ) : null}
      </div>

      <div className={styles.right}>
        <span className={styles.lines}>
          已读 {linesRead.toLocaleString('zh-CN')} 行
        </span>
        <div className={styles.zoom}>
          <IconButton
            aria-label="缩小"
            onClick={() => bumpZoom(-10)}
          >
            <Minus strokeWidth={1.5} />
          </IconButton>
          <select
            className={styles.zoomSelect}
            aria-label="缩放比例"
            value={zoomPercent}
            onChange={(e) => setZoomPercent(Number(e.target.value))}
          >
            {[50, 75, 100, 125, 150, 175, 200].map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
          <IconButton
            aria-label="放大"
            onClick={() => bumpZoom(10)}
          >
            <Plus strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>
    </footer>
  );
}
