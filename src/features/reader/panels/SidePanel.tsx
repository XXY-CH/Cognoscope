/**
 * SidePanel - AI 问答 + 批注（右侧）
 * 所属页面：E · 阅读界面
 * 规范参考：UI_spec.md §8.6
 *
 * 折叠入口仅保留 TopBar 的侧栏按钮，避免与「整理习得」旁重复
 */
import { useRef, useState, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, toast } from '../../../components/common';
import {
  useHorizontalResize,
  useVerticalResize,
} from '../../../hooks/usePanelResize';
import { useReaderStore } from '../../../stores/readerStore';
import { generateContentGraph } from '../../../services/aiApi';
import { AnnotationPanel } from './AnnotationPanel';
import { QAPanel } from './QAPanel';
import styles from './SidePanel.module.css';

/**
 * SidePanel - 可折叠、可拖宽；上下区由分隔条调节
 */
export function SidePanel() {
  const open = useReaderStore((s) => s.sideOpen);
  const width = useReaderStore((s) => s.sideWidth);
  const qaRatio = useReaderStore((s) => s.qaRatio);
  const fileId = useReaderStore((s) => s.fileId);
  const setSideWidth = useReaderStore((s) => s.setSideWidth);
  const setQaRatio = useReaderStore((s) => s.setQaRatio);
  const cycleSideSplit = useReaderStore((s) => s.cycleSideSplit);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** 拖拽中关闭 width 过渡，保证右缘贴窗 */
  const [dragging, setDragging] = useState(false);
  const [organizing, setOrganizing] = useState(false);

  const hResize = useHorizontalResize((dx) => {
    // 手柄在左侧：向右拖应减小宽度
    setSideWidth(useReaderStore.getState().sideWidth - dx);
  });

  const vResize = useVerticalResize((dy) => {
    const height = bodyRef.current?.clientHeight ?? 1;
    const delta = dy / height;
    setQaRatio(useReaderStore.getState().qaRatio + delta);
  });

  const handleOrganizeKnowledge = async () => {
    if (!fileId) {
      toast.error('未打开文档');
      return;
    }

    setOrganizing(true);
    try {
      // TODO: 从 PDF.js 获取文档文本内容
      // 目前使用占位文本
      const documentText = '这是文档的占位文本内容。实际应从 PDF.js textLayer 提取。';
      
      const result = await generateContentGraph(fileId, documentText, 20);
      
      toast.show(`✓ 提取了 ${result.nodes.length} 个概念节点和 ${result.edges.length} 条关系`);
      
      // TODO: 将提取的节点和边添加到知识图谱
      console.log('提取的内容节点：', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '整理失败';
      toast.error(message);
    } finally {
      setOrganizing(false);
    }
  };

  const qaCollapsed = qaRatio < 0.08;
  const annoCollapsed = qaRatio > 0.92;

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
          <Button
            aria-label="整理习得"
            variant="secondary"
            size="sm"
            leftIcon={<Sparkles size={16} strokeWidth={1.5} />}
            disabled={organizing || !fileId}
            onClick={() => void handleOrganizeKnowledge()}
          >
            {organizing ? '整理中...' : '整理习得'}
          </Button>
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
    </aside>
  );
}
