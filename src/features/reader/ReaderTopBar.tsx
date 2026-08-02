/**
 * ReaderTopBar - 阅读顶栏
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.2；检测指示来自 Python monitor
 */
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Expand,
  List,
  PanelRight,
  StretchHorizontal,
} from 'lucide-react';
import { IconButton, Tooltip, toast } from '../../components/common';
import { useMonitorStatus } from '../../hooks/useMonitorStatus';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useReaderStore, type PageMode } from '../../stores/readerStore';
import { ReaderFindBox } from './ReaderFindBox';
import styles from './ReaderTopBar.module.css';

const PAGE_MODES: { id: PageMode; label: string }[] = [
  { id: 'single', label: '单页' },
  { id: 'double', label: '双页' },
  { id: 'scroll', label: '连续滚动' },
];

/**
 * ReaderTopBarProps
 * @param onEnterFullscreen - 进入浏览器全屏
 */
export interface ReaderTopBarProps {
  onEnterFullscreen: () => void;
}

/**
 * ReaderTopBar - 返回、文件名、页面模式、文内搜索、适应宽度、书签、全屏
 */
export function ReaderTopBar({ onEnterFullscreen }: ReaderTopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const matrixId = new URLSearchParams(location.search).get('matrixId');
  const returnPath = matrixId
    ? `/evidence-matrix/${encodeURIComponent(matrixId)}`
    : '/';
  const returnLabel = matrixId ? '证据矩阵' : '当前研究';
  const fileId = useReaderStore((s) => s.fileId);
  const fileName = useReaderStore((s) => s.fileName);
  const fileType = useReaderStore((s) => s.fileType);
  const pageMode = useReaderStore((s) => s.pageMode);
  const currentPage = useReaderStore((s) => s.currentPage);
  const tocOpen = useReaderStore((s) => s.tocOpen);
  const sideOpen = useReaderStore((s) => s.sideOpen);
  const setPageMode = useReaderStore((s) => s.setPageMode);
  const toggleToc = useReaderStore((s) => s.toggleToc);
  const toggleSide = useReaderStore((s) => s.toggleSide);
  const openTocTab = useReaderStore((s) => s.openTocTab);
  const requestFitWidth = useReaderStore((s) => s.requestFitWidth);
  const fitWidthActive = useReaderStore((s) => s.fitWidthActive);
  const addBookmark = useBookmarkStore((s) => s.add);
  const monitorStatus = useMonitorStatus(true);

  const camLabel =
    monitorStatus === 'running'
      ? 'Python 检测中（本机摄像头）'
      : monitorStatus === 'offline'
        ? 'monitor 未连接'
        : '检测未运行';

  const onAddBookmark = async () => {
    if (!fileId) return;
    await addBookmark({
      fileId,
      page: currentPage,
      label: `第 ${currentPage} 页`,
      color: 'blue',
      quotedText: null,
    });
    openTocTab('bookmarks');
    toast.success('已添加书签');
  };

  return (
    <header className={styles.root}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.back}
          aria-label={`返回${returnLabel}`}
          onClick={() => navigate(returnPath)}
        >
          <ArrowLeft size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>{returnLabel}</span>
        </button>
        <Tooltip content={fileName || '未命名'} aria-label="完整文件名">
          <h1 className={styles.fileName}>{fileName || '未命名文档'}</h1>
        </Tooltip>
      </div>

      <div className={styles.center}>
        {fileType === 'pdf' ? (
          <div
            className={styles.segment}
            role="group"
            aria-label="页面模式"
          >
            {PAGE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={[
                  styles.segmentBtn,
                  pageMode === mode.id ? styles.segmentActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={pageMode === mode.id}
                aria-label={mode.label}
                onClick={() => setPageMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.right}>
        <ReaderFindBox />

        <Tooltip
          content={fitWidthActive ? '还原宽度' : '适应宽度'}
          aria-label={fitWidthActive ? '还原宽度提示' : '适应宽度提示'}
          placement="bottom"
        >
          <IconButton
            aria-label={
              fitWidthActive
                ? '还原为适应宽度前的缩放'
                : '适应宽度，使页面填满中间窗口'
            }
            aria-pressed={fitWidthActive}
            onClick={requestFitWidth}
          >
            <StretchHorizontal strokeWidth={1.5} />
          </IconButton>
        </Tooltip>

        <Tooltip content="添加书签" aria-label="添加书签提示" placement="bottom">
          <IconButton aria-label="添加书签" onClick={() => void onAddBookmark()}>
            <Bookmark strokeWidth={1.5} />
          </IconButton>
        </Tooltip>

        <Tooltip content="全屏" aria-label="全屏提示" placement="bottom">
          <IconButton aria-label="进入全屏" onClick={onEnterFullscreen}>
            <Expand strokeWidth={1.5} />
          </IconButton>
        </Tooltip>

        <Tooltip content={camLabel} aria-label="检测状态提示">
          <span
            className={[
              styles.camDot,
              monitorStatus === 'running' ? styles.camLive : '',
              monitorStatus === 'idle' ? styles.camPaused : '',
              monitorStatus === 'offline' ? styles.camBad : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="status"
            aria-label={camLabel}
          />
        </Tooltip>

        <Tooltip
          content={tocOpen ? '隐藏目录' : '显示目录'}
          aria-label="目录开关提示"
          placement="bottom"
        >
          <IconButton
            aria-label={tocOpen ? '隐藏目录' : '显示目录'}
            onClick={toggleToc}
          >
            <List strokeWidth={1.5} />
          </IconButton>
        </Tooltip>

        <Tooltip
          content={sideOpen ? '隐藏侧边栏' : '显示侧边栏'}
          aria-label="侧边栏开关提示"
          placement="bottom"
        >
          <IconButton
            aria-label={sideOpen ? '隐藏侧边栏' : '显示侧边栏'}
            onClick={toggleSide}
          >
            <PanelRight strokeWidth={1.5} />
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
