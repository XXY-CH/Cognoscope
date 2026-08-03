/**
 * KnowledgeGraphPage - 知识图谱主页面：左论文关系图 | 右关键词图谱
 * 所属页面：C · 知识图谱
 * 规范参考：UI_spec.md §6；访谈规格 keyword-graph-2026-07-30
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import { EmptyState, toast } from '../../components/common';
import { listEvidenceRowsByFileIds } from '../../db/evidenceRows';
import * as metaDb from '../../db/fileDocMeta';
import { useFileStore } from '../../stores/fileStore';
import { useGraphStore } from '../../stores/graphStore';
import { useKeywordGraphStore } from '../../stores/keywordGraphStore';
import { useReaderStore } from '../../stores/readerStore';
import type { FileDocMeta, GraphNode, KeywordNode } from '../../types';
import {
  canOpenGraphEvidence,
  fileIdsForGraphSelection,
  selectGraphEvidenceAnchors,
  type GraphEvidenceAnchor,
} from '../../utils/graphEvidence';
import { GraphCanvas } from './GraphCanvas';
import { GraphInspector } from './GraphInspector';
import { GraphToolbar } from './GraphToolbar';
import { filterGraphData, type GraphKindFilter } from './graphFilters';
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
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<GraphKindFilter>('all');
  const [selectedMeta, setSelectedMeta] = useState<FileDocMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [evidenceAnchors, setEvidenceAnchors] = useState<GraphEvidenceAnchor[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const restoredSelectionRef = useRef<string | null>(null);

  const files = useFileStore((s) => s.files);
  const loadFiles = useFileStore((s) => s.loadFiles);
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
    if (files.length === 0) void loadFiles();
  }, [files.length, loadFiles, loadGraph, loadKeywordGraph]);

  /** 点词时高亮的论文节点 id */
  const highlightedPaperIds = useMemo(() => {
    if (!selectedKeywordId) return [] as string[];
    const kw = kwNodes.find((k) => k.id === selectedKeywordId);
    return kw?.paperNodeIds ?? [];
  }, [selectedKeywordId, kwNodes]);

  const kwGraphNodes = useMemo(() => keywordToGraphNodes(kwNodes), [kwNodes]);

  const filteredGraph = useMemo(
    () =>
      filterGraphData({
        nodes,
        edges,
        keywordNodes: kwNodes,
        keywordEdges: kwEdges,
        query,
        kind: kindFilter,
      }),
    [edges, kindFilter, kwEdges, kwNodes, nodes, query],
  );
  const visiblePaperNodes = filteredGraph.paperNodes;
  const visibleKeywordNodes = filteredGraph.keywordNodes;
  const visiblePaperEdges = filteredGraph.paperEdges;
  const visibleKeywordEdges = filteredGraph.keywordEdges;
  const visiblePaperIds = useMemo(
    () => new Set(visiblePaperNodes.map((node) => node.id)),
    [visiblePaperNodes],
  );
  const visibleKeywordIds = useMemo(
    () => new Set(visibleKeywordNodes.map((node) => node.id)),
    [visibleKeywordNodes],
  );

  const selectedPaper = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedKeyword = useMemo(
    () => kwNodes.find((node) => node.id === selectedKeywordId) ?? null,
    [kwNodes, selectedKeywordId],
  );
  const readableFileIds = useMemo(
    () =>
      new Set(
        files
          .filter((file) => file.deletedAt === null && file.type !== 'folder')
          .map((file) => file.id),
      ),
    [files],
  );

  const selectedFileIds = useMemo(
    () =>
      fileIdsForGraphSelection({
        selectedPaper,
        selectedKeyword,
        paperNodes: nodes,
      }),
    [nodes, selectedKeyword, selectedPaper],
  );

  useEffect(() => {
    let cancelled = false;
    setEvidenceError(null);
    if (selectedFileIds.length === 0) {
      setEvidenceAnchors([]);
      setEvidenceLoading(false);
      return;
    }
    setEvidenceLoading(true);
    void listEvidenceRowsByFileIds(selectedFileIds)
      .then((rows) => {
        if (cancelled) return;
        setEvidenceAnchors(selectGraphEvidenceAnchors(rows, files, selectedFileIds));
      })
      .catch(() => {
        if (!cancelled) {
          setEvidenceAnchors([]);
          setEvidenceError('本地证据记录暂时无法读取');
        }
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [files, selectedFileIds]);

  useEffect(() => {
    if (selectedNodeId && !visiblePaperIds.has(selectedNodeId)) {
      setSelectedNode(null);
    }
    if (selectedKeywordId && !visibleKeywordIds.has(selectedKeywordId)) {
      setSelectedKeyword(null);
      setHighlightedKeywords([]);
    }
  }, [
    selectedKeywordId,
    selectedNodeId,
    setHighlightedKeywords,
    setSelectedKeyword,
    setSelectedNode,
    visibleKeywordIds,
    visiblePaperIds,
  ]);

  useEffect(() => {
    const fileId = selectedPaper?.fileId;
    if (!fileId) {
      setSelectedMeta(null);
      setMetaLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedMeta(null);
    setMetaLoading(true);
    void metaDb
      .getFileDocMeta(fileId)
      .then((meta) => {
        if (!cancelled) setSelectedMeta(meta ?? null);
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPaper?.fileId]);

  const handleClear = async () => {
    await clearGraph();
    toast.show('已清除本地图谱数据');
  };

  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedKeyword(null);
    setHighlightedKeywords([]);
  }, [setHighlightedKeywords, setSelectedKeyword, setSelectedNode]);

  const handlePaperClick = useCallback(
    (node: GraphNode) => {
      if (!visiblePaperIds.has(node.id)) {
        setQuery('');
        setKindFilter('all');
      }
      setSelectedNode(node.id);
      setSelectedKeyword(null);
      // 高亮挂接该论文的关键词
      const linked = kwNodes
        .filter((k) => k.paperNodeIds.includes(node.id))
        .map((k) => k.id);
      setHighlightedKeywords(linked);
    },
    [kwNodes, setHighlightedKeywords, setSelectedKeyword, setSelectedNode, visiblePaperIds],
  );

  const handleKeywordClick = useCallback(
    (node: GraphNode) => {
      if (!visibleKeywordIds.has(node.id)) {
        setQuery('');
        setKindFilter('all');
      }
      setSelectedKeyword(node.id);
      setSelectedNode(null);
      setHighlightedKeywords([node.id]);
    },
    [setHighlightedKeywords, setSelectedKeyword, setSelectedNode, visibleKeywordIds],
  );

  // Reader 返回图谱时，通过内部 query 恢复原先的选中节点；普通直达不受影响。
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nodeId = params.get('node');
    const kind = params.get('kind');
    if (!nodeId || (kind !== 'paper' && kind !== 'keyword')) return;
    const key = `${kind}:${nodeId}`;
    if (restoredSelectionRef.current === key) return;
    if (kind === 'paper') {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      handlePaperClick(node);
    } else {
      const node = kwNodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      handleKeywordClick({
        id: node.id,
        fileId: null,
        label: node.label,
        kind: 'tag',
        x: node.x,
        y: node.y,
      });
    }
    restoredSelectionRef.current = key;
  }, [handleKeywordClick, handlePaperClick, kwNodes, location.search, nodes]);

  const graphReturnParams = () => {
    const selectedId = selectedPaper?.id ?? selectedKeyword?.id;
    const selectedKind = selectedPaper ? 'paper' : selectedKeyword ? 'keyword' : null;
    const params = new URLSearchParams({ returnTo: 'knowledge-graph' });
    if (selectedId && selectedKind) {
      params.set('returnNodeId', selectedId);
      params.set('returnNodeKind', selectedKind);
    }
    return params;
  };

  const handleOpenPaper = (fileId: string) => {
    if (!readableFileIds.has(fileId)) {
      toast.warning('来源文件不存在或已移入回收站');
      return;
    }
    const params = graphReturnParams();
    navigate(`/read/${encodeURIComponent(fileId)}?${params.toString()}`);
  };

  const handleOpenEvidence = (anchor: GraphEvidenceAnchor) => {
    if (!canOpenGraphEvidence(anchor)) return;
    const params = graphReturnParams();
    params.set('matrixId', anchor.matrixId);
    params.set('rowId', anchor.rowId);
    useReaderStore.getState().setPendingLocator({
      fileId: anchor.fileId,
      matrixId: anchor.matrixId,
      rowId: anchor.rowId,
      locator: anchor.locator,
    });
    navigate(`/read/${encodeURIComponent(anchor.fileId)}?${params.toString()}`);
  };

  const handleCreateComparison = (fileIds: string[]) => {
    const uniqueFileIds = [...new Set(fileIds)].slice(0, 5);
    if (uniqueFileIds.length < 3) {
      toast.warning('当前论文簇不足 3 篇，无法创建证据矩阵');
      return;
    }
    const queryParams = uniqueFileIds
      .map((fileId) => `files=${encodeURIComponent(fileId)}`)
      .join('&');
    navigate(`/evidence-matrix?${queryParams}`);
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

  return (
    <main className={styles.container} aria-label="知识图谱">
      <GraphToolbar
        paperCount={nodes.length}
        paperEdgeCount={edges.length}
        keywordCount={kwNodes.length}
        keywordEdgeCount={kwEdges.length}
        syncing={kwSyncing}
        loading={loading || kwLoading}
        query={query}
        kindFilter={kindFilter}
        onQueryChange={setQuery}
        onKindFilterChange={setKindFilter}
        onRefresh={() => {
          void loadGraph();
          void loadKeywordGraph();
        }}
        onClear={() => void handleClear()}
      />

      {selectedPaper || selectedKeyword ? (
        <button
          type="button"
          className={styles.mobileInspectorScrim}
          aria-label="关闭节点详情"
          onClick={clearSelection}
        />
      ) : null}

      <GraphInspector
        selectedPaper={selectedPaper}
        selectedKeyword={selectedKeyword}
        paperNodes={nodes}
        paperEdges={edges}
        keywordNodes={kwNodes}
        keywordEdges={kwEdges}
        selectedMeta={selectedMeta}
        metaLoading={metaLoading}
        readableFileIds={readableFileIds}
        evidenceAnchors={evidenceAnchors}
        evidenceLoading={evidenceLoading}
        evidenceError={evidenceError}
        onSelectPaper={handlePaperClick}
        onOpenPaper={handleOpenPaper}
        onOpenEvidence={handleOpenEvidence}
        onCreateComparison={handleCreateComparison}
        onClose={clearSelection}
      />

      <div className={styles.split}>
        <section className={styles.pane} aria-label="论文关系图">
          <h2 className={styles.paneTitle}>论文关系</h2>
          <div className={styles.graph}>
            {visiblePaperNodes.length === 0 ? (
              <p className={styles.paneEmpty}>
                {nodes.length === 0 ? '暂无论文节点' : '没有匹配的论文节点'}
              </p>
            ) : (
              <GraphCanvas
                nodes={visiblePaperNodes}
                edges={visiblePaperEdges}
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
            {visibleKeywordNodes.length === 0 ? (
              <p className={styles.paneEmpty}>
                {kwNodes.length === 0 && kwSyncing
                  ? '正在从摘要生成关键词…'
                  : kwNodes.length === 0
                    ? '入图成功后将自动生成关键词关联'
                    : '没有匹配的关键词节点'}
              </p>
            ) : (
              <GraphCanvas
                nodes={kwGraphNodes.filter((node) => visibleKeywordIds.has(node.id))}
                edges={visibleKeywordEdges}
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
