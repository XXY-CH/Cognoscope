/**
 * ReaderPage - 阅读界面全屏外壳（无全局 Sidebar）
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.1 / §14
 *
 * 真全屏用 Fullscreen API；退出仅依赖 Esc（无自定义圆形叉）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from '../../components/common';
import { OfflineBanner } from '../../components/layout/OfflineBanner';
import { SettingsDrawer } from '../../components/layout/SettingsDrawer';
import { useAppShortcuts } from '../../hooks/useAppShortcuts';
import { useLinesReadSync } from '../../hooks/useLinesReadSync';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useReadingSession } from '../../hooks/useReadingSession';
import { useSystemThemeListener } from '../../hooks/useSystemThemeListener';
import * as sessionsDb from '../../db/sessions';
import { listEvidenceRowsByMatrix } from '../../db/evidenceRows';
import { useFileStore } from '../../stores/fileStore';
import { useReaderStore } from '../../stores/readerStore';
import { convertToReadingSession } from '../../utils/monitorAdapter';
import {
  getSessionFrames,
  MONITOR_API_BASE,
  startDetection,
  stopDetection,
  type StartResult,
} from '../../utils/monitorApi';
import { ReaderCanvas } from './canvas/ReaderCanvas';
import { ReaderBottomBar } from './ReaderBottomBar';
import { ReaderTopBar } from './ReaderTopBar';
import { SidePanel } from './panels/SidePanel';
import { TocPanel } from './panels/TocPanel';
import styles from './ReaderPage.module.css';

/**
 * ReaderPage - 根据路由 fileId 打开文件；布局：TopBar / Toc+Canvas+Side / BottomBar
 */
export function ReaderPage() {
  useSystemThemeListener();
  // 阅读路由无 AppShell，需单独挂载网络监听与快捷键
  useNetworkStatus();
  useAppShortcuts();
  const rootRef = useRef<HTMLDivElement>(null);
  const zoomBeforeFsRef = useRef(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { fileId } = useParams<{ fileId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const files = useFileStore((s) => s.files);
  const loadFiles = useFileStore((s) => s.loadFiles);
  const openFile = useReaderStore((s) => s.openFile);
  const clearFile = useReaderStore((s) => s.clearFile);
  const setPendingLocator = useReaderStore((s) => s.setPendingLocator);
  const activeFileId = useReaderStore((s) => s.fileId);
  useLinesReadSync(activeFileId);

  // 直接刷新阅读器时，从 URL + IndexedDB 恢复矩阵行的来源定位。
  useEffect(() => {
    if (!fileId) return;
    const params = new URLSearchParams(location.search);
    const matrixId = params.get('matrixId');
    const rowId = params.get('rowId');
    if (!matrixId || !rowId) return;
    let cancelled = false;
    void listEvidenceRowsByMatrix(matrixId).then((rows) => {
      if (cancelled) return;
      const row = rows.find((candidate) => candidate.id === rowId);
      const item = row?.evidence.find((candidate) => candidate.fileId === fileId);
      if (!item) return;
      setPendingLocator({ fileId, matrixId, rowId, locator: item.locator });
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, location.search, setPendingLocator]);

  // Python monitor 会话 ID（由 startDetection 返回，stop 后用于拉取数据）
  const pySessionIdRef = useRef<string | null>(null);

  // 会话结束时合并 monitor 检测数据到 IndexedDB 会话
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const mergeMonitorData = useCallback(
    async (dbSessionId: string) => {
      const pySid = pySessionIdRef.current;
      if (!pySid || !mountedRef.current) return;
      try {
        const { frames } = await getSessionFrames(pySid);
        if (!frames || frames.length === 0 || !mountedRef.current) return;
        // 大量帧同步处理会阻塞主线程 → yield 后再转换，并限制帧数
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (!mountedRef.current) return;
        const capped = frames.length > 6000 ? frames.slice(-6000) : frames;
        const monitorSession = convertToReadingSession(capped, activeFileId!);
        if (!monitorSession || !mountedRef.current) return;
        const cur = await sessionsDb.getSession(dbSessionId);
        if (!cur) return;
        await sessionsDb.putSession({
          ...cur,
          focusSamples: monitorSession.focusSamples,
          fatigueSamples: monitorSession.fatigueSamples,
          distractions: monitorSession.distractions,
        });
      } catch {
        /* monitor 不可用时静默 */
      }
    },
    [activeFileId],
  );

  useReadingSession(activeFileId, mergeMonitorData);

  // 打开论文 → 自动启动/停止 Python 行为检测
  useEffect(() => {
    if (!activeFileId) return;
    // Puppeteer/omp 等无头页也会挂 /read/；webdriver 为 true 时跳过，避免误开摄像头
    if (navigator.webdriver) return;

    // 先确保之前的检测已停止
    void stopDetection();

    // 启动检测
    const timer = setTimeout(() => {
      void (async () => {
        // 延迟后再次确认：HMR/自动化可能在等待期间注入 webdriver 标记
        if (navigator.webdriver) return;
        const result = await Promise.race([
          startDetection(activeFileId),
          new Promise<StartResult>((r) =>
            setTimeout(() => r({ status: 'unreachable' }), 2000),
          ),
        ]);
        if (result.sessionId) {
          pySessionIdRef.current = result.sessionId;
        }
      })();
    }, 500);

    const handleUnload = () => {
      if (navigator.webdriver) return;
      navigator.sendBeacon(`${MONITOR_API_BASE}/api/detect/stop`);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', handleUnload);
      if (!navigator.webdriver) void stopDetection();
    };
  }, [activeFileId]);
  const tocOpen = useReaderStore((s) => s.tocOpen);
  const sideOpen = useReaderStore((s) => s.sideOpen);
  const tocWidth = useReaderStore((s) => s.tocWidth);
  const sideWidth = useReaderStore((s) => s.sideWidth);
  const toggleToc = useReaderStore((s) => s.toggleToc);

  // 紧凑视口中面板是 Sheet：Escape 应一次性退出临时层。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const reader = useReaderStore.getState();
      if (!reader.tocOpen && !reader.sideOpen) return;
      if (reader.tocOpen) reader.toggleToc();
      if (reader.sideOpen) reader.toggleSide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeMobilePanels = () => {
    const reader = useReaderStore.getState();
    if (reader.tocOpen) reader.toggleToc();
    if (reader.sideOpen) reader.toggleSide();
  };

  useEffect(() => {
    if (files.length === 0) void loadFiles();
  }, [files.length, loadFiles]);

  useEffect(() => {
    if (!fileId) return;
    const node = files.find((f) => f.id === fileId && f.deletedAt === null);
    if (!node) {
      // 文件尚未加载完时先等；已加载仍找不到则回目录
      if (files.length > 0) navigate('/', { replace: true });
      return;
    }
    if (node.type === 'folder') {
      navigate('/', { replace: true });
      return;
    }
    openFile({
      id: node.id,
      name: node.name,
      type: node.type,
    });
    return () => clearFile();
  }, [fileId, files, navigate, openFile, clearFile]);

  // 与 files 更新解耦：仅在成功打开的文件 id 变化时写入最后阅读
  useEffect(() => {
    if (!activeFileId) return;
    void useFileStore.getState().recordLastRead(activeFileId);
  }, [activeFileId]);

  // Canvas 最小 480：两侧展开导致过窄时优先收起 Toc（§8.1）
  useEffect(() => {
    const check = () => {
      const toc = tocOpen ? tocWidth : 0;
      const side = sideOpen ? sideWidth : 0;
      const available = window.innerWidth - toc - side;
      if (available < 480 && tocOpen) {
        toggleToc();
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [tocOpen, sideOpen, tocWidth, sideWidth, toggleToc]);

  // 同步浏览器全屏；Esc 退出时恢复缩放
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === rootRef.current;
      setIsFullscreen(fs);
      if (!fs) {
        useReaderStore.getState().setZoomPercent(zoomBeforeFsRef.current);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enterFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    const reader = useReaderStore.getState();
    zoomBeforeFsRef.current = reader.zoomPercent;
    try {
      // navigationUI: hide 尽量隐藏浏览器导航 UI；退出仅用 Esc
      const req = el.requestFullscreen.bind(el) as (
        options?: FullscreenOptions,
      ) => Promise<void>;
      try {
        await req({ navigationUI: 'hide' });
      } catch {
        await el.requestFullscreen();
      }
      reader.setZoomPercent(
        Math.min(200, Math.round(zoomBeforeFsRef.current * 1.2)),
      );
      toast.show('按 Esc 退出全屏');
    } catch {
      toast.error('无法进入全屏');
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className={[styles.root, isFullscreen ? styles.fullscreen : ''].join(' ')}
    >
      {!isFullscreen ? <OfflineBanner /> : null}
      {!isFullscreen ? (
        <ReaderTopBar onEnterFullscreen={() => void enterFullscreen()} />
      ) : null}
      <div className={styles.body}>
        {!isFullscreen ? <TocPanel /> : null}
        <ReaderCanvas />
        {!isFullscreen && (tocOpen || sideOpen) ? (
          <button
            type="button"
            className={styles.mobilePanelScrim}
            aria-label="关闭阅读面板"
            onClick={closeMobilePanels}
          />
        ) : null}
        {!isFullscreen ? <SidePanel /> : null}
      </div>
      {!isFullscreen ? <ReaderBottomBar /> : null}
      {/* 阅读页独立于 AppShell，需自挂设置抽屉供快捷键打开 */}
      <SettingsDrawer />
    </div>
  );
}
