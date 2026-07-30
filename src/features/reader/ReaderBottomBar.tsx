/**
 * ReaderBottomBar - 阅读底栏
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.5；检测状态来自 Python monitor（非浏览器摄像头）
 */
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { IconButton, Tooltip } from '../../components/common';
import { useMonitorStatus } from '../../hooks/useMonitorStatus';
import { useReaderStore } from '../../stores/readerStore';
import styles from './ReaderBottomBar.module.css';

/**
 * ReaderBottomBar - 页码、进度、已读行数、缩放、monitor 检测状态
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
  const monitorStatus = useMonitorStatus(true);

  const progress =
    totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  const camLabel =
    monitorStatus === 'running'
      ? 'Python 检测中（本机摄像头）'
      : monitorStatus === 'offline'
        ? 'monitor 未连接'
        : '检测未运行';

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
        <span className={styles.total}>/ {totalPages || '—'}</span>

        {/* 只读指示：摄像头由 Python 打开，前端不可点开浏览器流 */}
        <Tooltip content={camLabel} aria-label="检测状态说明">
          <span
            className={styles.camChip}
            role="status"
            aria-label={camLabel}
          >
            <span
              className={[
                styles.camDot,
                monitorStatus === 'running' ? styles.camLive : '',
                monitorStatus === 'offline' ? styles.camBad : '',
                monitorStatus === 'idle' ? styles.camPaused : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
            <span className={styles.camText}>
              {monitorStatus === 'running'
                ? '检测中'
                : monitorStatus === 'offline'
                  ? '未连接'
                  : '空闲'}
            </span>
          </span>
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
          <IconButton aria-label="缩小" onClick={() => bumpZoom(-10)}>
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
          <IconButton aria-label="放大" onClick={() => bumpZoom(10)}>
            <Plus strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>
    </footer>
  );
}
