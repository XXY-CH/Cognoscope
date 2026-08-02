/**
 * SidePanel - AI 问答 + 批注（右侧）
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.6 / §8.9 整理习得
 *
 * 折叠入口仅保留 TopBar 的侧栏按钮，避免与「整理习得」旁重复
 */
import { useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Button, IconButton, Tooltip, toast } from '../../../components/common';
import {
  useHorizontalResize,
  useVerticalResize,
} from '../../../hooks/usePanelResize';
import { useAnnotationStore } from '../../../stores/annotationStore';
import { useFileStore } from '../../../stores/fileStore';
import { useReaderStore } from '../../../stores/readerStore';
import { useUiStore } from '../../../stores/uiStore';
import { runDigest } from '../../../utils/runDigest';
import { DigestDialog } from '../DigestDialog';
import { AnnotationPanel } from './AnnotationPanel';
import { QAPanel } from './QAPanel';
import styles from './SidePanel.module.css';

/**
 * SidePanel - 可折叠、可拖宽；上下区由分隔条调节；整理习得接 AI
 */
export function SidePanel() {
  const open = useReaderStore((s) => s.sideOpen);
  const width = useReaderStore((s) => s.sideWidth);
  const qaRatio = useReaderStore((s) => s.qaRatio);
  const fileId = useReaderStore((s) => s.fileId);
  const setSideWidth = useReaderStore((s) => s.setSideWidth);
  const toggleSide = useReaderStore((s) => s.toggleSide);
  const setQaRatio = useReaderStore((s) => s.setQaRatio);
  const cycleSideSplit = useReaderStore((s) => s.cycleSideSplit);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** 拖拽中关闭 width 过渡，保证右缘贴窗 */
  const [dragging, setDragging] = useState(false);

  const isOnline = useUiStore((s) => s.isOnline);
  const aiSettings = useUiStore((s) => s.aiSettings);
  const openSettings = useUiStore((s) => s.openSettings);
  const annotations = useAnnotationStore(useShallow((s) => s.items));
  const files = useFileStore(useShallow((s) => s.files));

  const [digesting, setDigesting] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestMarkdown, setDigestMarkdown] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const hResize = useHorizontalResize((dx) => {
    // 手柄在左侧：向右拖应减小宽度
    setSideWidth(useReaderStore.getState().sideWidth - dx);
  });

  const vResize = useVerticalResize((dy) => {
    const height = bodyRef.current?.clientHeight ?? 1;
    const delta = dy / height;
    setQaRatio(useReaderStore.getState().qaRatio + delta);
  });

  const qaCollapsed = qaRatio < 0.08;
  const annoCollapsed = qaRatio > 0.92;

  const file = fileId
    ? files.find((f) => f.id === fileId && f.deletedAt === null)
    : undefined;

  const handleDigest = async () => {
    if (digesting) return;
    if (!isOnline) {
      toast.warning('需要连接 AI 服务');
      return;
    }
    if (!aiSettings.apiKey.trim()) {
      toast.warning('请先在设置中配置 API Key');
      openSettings();
      return;
    }
    if (!file || !fileId) {
      toast.error('未打开文件');
      return;
    }

    const meaningful = annotations.filter(
      (a) => a.body.trim() || (a.quotedText?.trim() ?? ''),
    );
    if (meaningful.length === 0) {
      toast.show('暂无可整理的批注或问答');
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setDigesting(true);
    try {
      const result = await runDigest({
        file,
        annotations: meaningful,
        ai: aiSettings,
        signal: ac.signal,
      });
      setDigestMarkdown(result.markdown);
      setDigestOpen(true);
      if (!result.usedTranscript && file.type === 'pdf') {
        toast.warning('未能提取 PDF 文字层，已仅依据批注整理');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : '整理习得失败');
    } finally {
      setDigesting(false);
    }
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
      style={{ '--side-width': `${width}px` } as CSSProperties}
      aria-label="侧边栏"
      aria-hidden={!open}
    >
      <div
        className={styles.resizer}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        onPointerDown={(e) => {
          setDragging(true);
          hResize.onPointerDown(e);
        }}
        onPointerMove={hResize.onPointerMove}
        onPointerUp={(e) => {
          hResize.onPointerUp(e);
          setDragging(false);
        }}
      />

      <div className={styles.inner}>
        <header className={styles.header}>
          {isOnline && aiSettings.apiKey.trim() ? (
            <Button
              aria-label={digesting ? '整理中' : '整理习得'}
              variant="secondary"
              size="sm"
              leftIcon={
                digesting ? (
                  <Loader2
                    className={styles.spin}
                    size={16}
                    strokeWidth={1.5}
                  />
                ) : (
                  <Sparkles size={16} strokeWidth={1.5} />
                )
              }
              disabled={digesting || !fileId}
              onClick={() => void handleDigest()}
            >
              {digesting ? '整理中…' : '整理习得'}
            </Button>
          ) : (
            <Tooltip content="需要连接 AI 服务" aria-label="整理习得不可用说明">
              <Button
                aria-label="整理习得"
                variant="secondary"
                size="sm"
                leftIcon={<Sparkles size={16} strokeWidth={1.5} />}
                disabled
              >
                整理习得
              </Button>
            </Tooltip>
          )}
          <IconButton
            className={styles.mobileClose}
            aria-label="关闭侧边栏"
            onClick={toggleSide}
          >
            <X size={18} strokeWidth={1.5} />
          </IconButton>
        </header>

        <div
          ref={bodyRef}
          className={styles.body}
          style={{ '--qa-ratio': String(qaRatio) } as CSSProperties}
        >
          {!qaCollapsed ? (
            <div
              className={[
                styles.qa,
                annoCollapsed ? styles.qaFill : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <QAPanel />
            </div>
          ) : null}

          <div
            className={styles.rowResizer}
            role="separator"
            aria-orientation="horizontal"
            aria-label="调整问答与批注高度，双击切换预设"
            onPointerDown={vResize.onPointerDown}
            onPointerMove={vResize.onPointerMove}
            onPointerUp={vResize.onPointerUp}
            onDoubleClick={cycleSideSplit}
          />

          {!annoCollapsed ? (
            <div className={styles.anno}>
              <AnnotationPanel />
            </div>
          ) : null}

          {qaCollapsed && annoCollapsed ? (
            <div className={styles.bothCollapsed}>
              <Button
                aria-label="展开问答区"
                variant="secondary"
                size="sm"
                onClick={() => setQaRatio(0.5)}
              >
                展开问答
              </Button>
              <Button
                aria-label="展开批注区"
                variant="secondary"
                size="sm"
                onClick={() => setQaRatio(0.5)}
              >
                展开批注
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <DigestDialog
        open={digestOpen}
        fileName={file?.name ?? '文献'}
        markdown={digestMarkdown}
        onClose={() => setDigestOpen(false)}
      />
    </aside>
  );
}
