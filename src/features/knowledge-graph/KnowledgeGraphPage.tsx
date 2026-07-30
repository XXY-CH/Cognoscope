/**
 * KnowledgeGraphPage - 知识图谱主页面：左论文关系图 | 右关键词图谱
 * 所属页面：C · 知识图谱
 * 规范参考：UI_spec.md §6；访谈规格 keyword-graph-2026-07-30
 */
import { useEffect, useMemo } from 'react';
import { Network, RefreshCw, Trash2 } from 'lucide-react';
import { Button, EmptyState, toast } from '../../components/common';
import { useGraphStore } from '../../stores/graphStore';
import { useKeywordGraphStore } from '../../stores/keywordGraphStore';
import type { GraphNode, KeywordNode } from '../../types';
import { GraphCanvas } from './GraphCanvas';
import styles from './KnowledgeGraphPage.module.css';

/** 关键词节点转力导向画布所需 GraphNode 形态 */
function keywordToGraphNodes(kws: KeywordNode[]): GraphNode[] {
  return kws.map((k) => ({
    id: k.id,
    fileId: null,
    label: k.label,
    kind: 'tag' as const,
    x: k.x,
    y: k.y,
  }));
}

/**
 * KnowledgeGraphPage - 左右分栏：论文图 + 关键词图，双向联动高亮
 */
export function KnowledgeGraphPage() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const persistNodePosition = useGraphStore((s) => s.persistNodePosition);

  const kwNodes = useKeywordGraphStore((s) => s.nodes);
  const kwEdges = useKeywordGraphStore((s) => s.edges);
  const kwLoading = useKeywordGraphStore((s) => s.loading);
  const kwSyncing = useKeywordGraphStore((s) => s.syncing);
  const selectedKeywordId = useKeywordGraphStore((s) => s.selectedKeywordId);
  const highlightedKeywordIds = useKeywordGraphStore(
    (s) => s.highlightedKeywordIds,
  );
  const loadKeywordGraph = useKeywordGraphStore((s) => s.loadKeywordGraph);
  const setSelectedKeyword = useKeywordGraphStore((s) => s.setSelectedKeyword);
  const setHighlightedKeywords = useKeywordGraphStore(
    (s) => s.setHighlightedKeywords,
  );
  const persistKeywordPosition = useKeywordGraphStore(
    (s) => s.persistKeywordPosition,
  );

  useEffect(() => {
    void loadGraph();
    void loadKeywordGraph();
  }, [loadGraph, loadKeywordGraph]);

  /** 点词时高亮的论文节点 id */
  const highlightedPaperIds = useMemo(() => {
    if (!selectedKeywordId) return [] as string[];
    const kw = kwNodes.find((k) => k.id === selectedKeywordId);
    return kw?.paperNodeIds ?? [];
  }, [selectedKeywordId, kwNodes]);

  const kwGraphNodes = useMemo(
    () => keywordToGraphNodes(kwNodes),
    [kwNodes],
  );

  const handleClear = async () => {
    await clearGraph();
    toast.show('已清除本地图谱数据');
  };

  const clearSelection = () => {
    setSelectedNode(null);
    setSelectedKeyword(null);
    setHighlightedKeywords([]);
  };

  const handlePaperClick = (node: GraphNode) => {
    setSelectedNode(node.id);
    setSelectedKeyword(null);
    // 高亮挂接该论文的关键词
    const linked = kwNodes
      .filter((k) => k.paperNodeIds.includes(node.id))
      .map((k) => k.id);
    setHighlightedKeywords(linked);
  };

  const handleKeywordClick = (node: GraphNode) => {
    setSelectedKeyword(node.id);
    setSelectedNode(null);
    setHighlightedKeywords([node.id]);
  };

  if ((loading || kwLoading) && nodes.length === 0 && kwNodes.length === 0) {
    return (
      <main className={styles.container} aria-label="知识图谱">
        <p className={styles.hint} role="status">
          加载图谱…
        </p>
      </main>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <main className={styles.container} aria-label="知识图谱">
        <EmptyState
          aria-label="图谱加载失败"
          icon={<Network strokeWidth={1.5} />}
          title="加载失败"
          description={error}
          actionLabel="重试"
          actionAriaLabel="重新加载知识图谱"
          onAction={() => {
            void loadGraph();
            void loadKeywordGraph();
          }}
        />
      </main>
    );
  }

  if (nodes.length === 0 && kwNodes.length === 0) {
    return (
      <main className={styles.container} aria-label="知识图谱">
        <EmptyState
          aria-label="图谱空状态"
          icon={<Network strokeWidth={1.5} />}
          title="暂无图谱节点"
          description="导入 PDF 后将在可用 AI 时自动入图；也可在文件目录对失败项手动「加入图谱」。"
        />
      </main>
    );
  }

  return (
    <main className={styles.container} aria-label="知识图谱">
      <div className={styles.toolbar}>
        <p className={styles.meta}>
          论文 {nodes.length} 节点 · {edges.length} 边
          {' · '}
          关键词 {kwNodes.length} 节点 · {kwEdges.length} 边
          {kwSyncing ? ' · 关键词同步中…' : ''}
        </p>
        <div className={styles.actions}>
          <Button
            aria-label="刷新图谱"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={16} strokeWidth={1.5} />}
            disabled={loading || kwLoading}
            onClick={() => {
              void loadGraph();
              void loadKeywordGraph();
            }}
          >
            刷新
          </Button>
          <Button
            aria-label="清除图谱"
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 size={16} strokeWidth={1.5} />}
            disabled={loading || kwLoading}
            onClick={() => void handleClear()}
          >
            清除
          </Button>
        </div>
      </div>

      <div className={styles.split}>
        <section className={styles.pane} aria-label="论文关系图">
          <h2 className={styles.paneTitle}>论文关系</h2>
          <div className={styles.graph}>
            {nodes.length === 0 ? (
              <p className={styles.paneEmpty}>暂无论文节点</p>
            ) : (
              <GraphCanvas
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                highlightedNodeIds={highlightedPaperIds}
                onNodeClick={handlePaperClick}
                onBackgroundClick={clearSelection}
                onNodeDrag={(node, x, y) => {
                  void persistNodePosition(node.id, x, y);
                }}
              />
            )}
          </div>
        </section>

        <section className={styles.pane} aria-label="关键词图谱">
          <h2 className={styles.paneTitle}>关键词图谱</h2>
          <div className={styles.graph}>
            {kwNodes.length === 0 ? (
              <p className={styles.paneEmpty}>
                {kwSyncing
                  ? '正在从摘要生成关键词…'
                  : '入图成功后将自动生成关键词关联'}
              </p>
            ) : (
              <GraphCanvas
                nodes={kwGraphNodes}
                edges={kwEdges}
                selectedNodeId={selectedKeywordId}
                highlightedNodeIds={highlightedKeywordIds}
                onNodeClick={handleKeywordClick}
                onBackgroundClick={clearSelection}
                onNodeDrag={(node, x, y) => {
                  void persistKeywordPosition(node.id, x, y);
                }}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
