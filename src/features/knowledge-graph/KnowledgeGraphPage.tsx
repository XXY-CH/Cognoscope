/**
 * KnowledgeGraphPage - 分层研究图谱：单一画布 + 证据检查器
 * 所属页面：C · 知识图谱
 * 规范参考：UI_spec.md §6；访谈规格 keyword-graph-2026-07-30
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { EmptyState, toast } from '../../components/common';
import { listEvidenceRowsByFileIds } from '../../db/evidenceRows';
import * as metaDb from '../../db/fileDocMeta';
import { useFileStore } from '../../stores/fileStore';
import { useGraphStore } from '../../stores/graphStore';
import { useKeywordGraphStore } from '../../stores/keywordGraphStore';
import { useReaderStore } from '../../stores/readerStore';
import type {
  EvidenceRow,
  FileDocMeta,
  GraphEdge,
  GraphNode,
  KeywordNode,
} from '../../types';
import {
  canOpenGraphEvidence,
  fileIdsForGraphSelection,
  graphRelationKey,
  locatorLabel,
  projectGraphRelationEvidence,
  selectGraphEvidenceAnchors,
  sourceStateLabel,
  type GraphEvidenceAnchor,
  type GraphRelationProjection,
  verificationLabel,
} from '../../utils/graphEvidence';
import { GraphCanvas } from './GraphCanvas';
import { GraphInspector } from './GraphInspector';
import {
  GraphToolbar,
  type GraphEvidenceFilter,
  type GraphView,
} from './GraphToolbar';
import { filterGraphData, type GraphKindFilter } from './graphFilters';
import styles from './KnowledgeGraphPage.module.css';

/** 关键词节点转画布所需 GraphNode 形态。L2 概念仍由现有关键词记录提供。 */
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

function paperKeywordEdges(
  keywordNodes: KeywordNode[],
  visiblePaperIds: ReadonlySet<string>,
): GraphEdge[] {
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const keyword of keywordNodes) {
    for (const paperNodeId of keyword.paperNodeIds) {
      if (!visiblePaperIds.has(paperNodeId)) continue;
      const key = `${paperNodeId}::${keyword.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        source: paperNodeId,
        target: keyword.id,
        weight: 0.35,
        origin: 'cooccurrence',
        reason: '主题来自论文元数据或关键词提取；可用于整理与回读，不能替代主张核验',
      });
    }
  }
  return edges;
}

function graphEdgeProjection(
  edge: GraphEdge,
  relationEvidenceByKey: ReadonlyMap<string, GraphRelationProjection>,
): GraphRelationProjection {
  return (
    relationEvidenceByKey.get(graphRelationKey(edge.source, edge.target)) ?? {
      state: 'insufficient',
      label: '证据不足',
      reason: '这条关系尚未绑定到具体矩阵主张，不能直接作为引用证据。',
      rowIds: [],
    }
  );
}

function matchesEvidenceFilter(
  projection: GraphRelationProjection,
  filter: GraphEvidenceFilter,
): boolean {
  return filter === 'all' || projection.state === filter;
}

function matchesAnchorFilter(
  anchor: GraphEvidenceAnchor,
  filter: GraphEvidenceFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'stale') return anchor.sourceState !== 'available';
  if (filter === 'disputed') {
    return anchor.verification === 'disputed' || anchor.rowVerification === 'disputed';
  }
  if (filter === 'review') {
    return (
      anchor.verification === 'proposed' ||
      anchor.verification === 'unresolved' ||
      anchor.rowVerification === 'proposed' ||
      anchor.rowVerification === 'unresolved'
    );
  }
  return anchor.match === 'none' || anchor.sourceState !== 'available';
}

/**
 * 给画布投影可读的初始位置。保留用户已经拖拽过的坐标；力导向随后
 * 负责排斥与吸引，列式位置只作为新节点加入时的稳定起点。
 */
function layoutGraphNodes(nodes: GraphNode[], view: GraphView): GraphNode[] {
  const buckets = new Map<GraphNode['kind'], GraphNode[]>();
  for (const node of nodes) {
    const bucket = buckets.get(node.kind) ?? [];
    bucket.push(node);
    buckets.set(node.kind, bucket);
  }
  const offsets: Record<GraphNode['kind'], number> = {
    file: view === 'topics' ? -240 : 0,
    folder: -240,
    tag: view === 'papers' ? 240 : 240,
  };
  const positions = new Map<string, { x: number; y: number }>();
  for (const [kind, bucket] of buckets) {
    const sorted = [...bucket].sort((left, right) => left.label.localeCompare(right.label));
    const spread = Math.max(84, Math.min(132, 620 / Math.max(sorted.length, 1)));
    sorted.forEach((node, index) => {
      positions.set(node.id, {
        x: node.x ?? offsets[kind],
        y: node.y ?? (index - (sorted.length - 1) / 2) * spread,
      });
    });
  }
  return nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
}

function EvidenceView({
  anchors,
  loading,
  error,
  onOpenEvidence,
}: {
  anchors: GraphEvidenceAnchor[];
  loading: boolean;
  error: string | null;
  onOpenEvidence: (anchor: GraphEvidenceAnchor) => void;
}) {
  if (loading) return <p className={styles.paneEmpty} role="status">正在读取证据锚点…</p>;
  if (error) return <p className={styles.paneEmpty} role="alert">{error}</p>;
  if (anchors.length === 0) {
    return (
      <div className={styles.paneEmpty}>
        先选择一篇论文或一个主题；这里显示最多 20 条可回读证据。图谱关系本身不是引用材料。
      </div>
    );
  }
  return (
    <ol className={styles.evidenceList}>
      {anchors.map((anchor) => {
        const canOpen = canOpenGraphEvidence(anchor);
        return (
          <li className={styles.evidenceItem} key={anchor.id}>
            <div className={styles.evidenceItemHeader}>
              <strong>{anchor.conclusion}</strong>
              <span>{sourceStateLabel(anchor.sourceState)}</span>
            </div>
            <blockquote>{anchor.quotedText || '（没有摘录）'}</blockquote>
            <div className={styles.evidenceItemMeta}>
              <span>{anchor.fileName}</span>
              <span>{locatorLabel(anchor.locator)}</span>
              <span>{verificationLabel(anchor.rowVerification)}</span>
            </div>
            <button
              type="button"
              disabled={!canOpen}
              aria-label={canOpen ? `回读 ${anchor.fileName}` : '来源不可回读'}
              onClick={() => onOpenEvidence(anchor)}
            >
              回读来源
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * KnowledgeGraphPage - 单一画布上的论文、主题与证据视图，配合来源检查器。
 */
export function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<GraphView>('overview');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<GraphKindFilter>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<GraphEvidenceFilter>('all');
  const [selectedMeta, setSelectedMeta] = useState<FileDocMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [evidenceAnchors, setEvidenceAnchors] = useState<GraphEvidenceAnchor[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [relationRows, setRelationRows] = useState<EvidenceRow[]>([]);
  const [scopeRailCollapsed, setScopeRailCollapsed] = useState(false);
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
  const visiblePaperNodes = filteredGraph.paperNodes.slice(0, 80);
  const visibleKeywordNodes = filteredGraph.keywordNodes.slice(0, 80);
  const visiblePaperEdges = filteredGraph.paperEdges.slice(0, 160);
  const visibleKeywordEdges = filteredGraph.keywordEdges.slice(0, 160);
  const visibleKeywordGraphNodes = useMemo(
    () => keywordToGraphNodes(visibleKeywordNodes),
    [visibleKeywordNodes],
  );
  const visiblePaperIdSet = useMemo(
    () => new Set(visiblePaperNodes.map((node) => node.id)),
    [visiblePaperNodes],
  );
  const paperTopicEdges = useMemo(
    () => paperKeywordEdges(visibleKeywordNodes, visiblePaperIdSet),
    [visibleKeywordNodes, visiblePaperIdSet],
  );
  const projectedNodes = useMemo(() => {
    if (view === 'topics') return [...visiblePaperNodes, ...visibleKeywordGraphNodes];
    if (view === 'overview') return [...visiblePaperNodes, ...visibleKeywordGraphNodes];
    return visiblePaperNodes;
  }, [view, visibleKeywordGraphNodes, visiblePaperNodes]);
  const projectedEdges = useMemo(() => {
    if (view === 'topics') {
      return [...visiblePaperEdges, ...visibleKeywordEdges, ...paperTopicEdges].slice(0, 160);
    }
    if (view === 'overview') {
      return [...visiblePaperEdges, ...paperTopicEdges].slice(0, 160);
    }
    return visiblePaperEdges;
  }, [paperTopicEdges, view, visibleKeywordEdges, visiblePaperEdges]);
  const graphFileIds = useMemo(
    () =>
      nodes
        .map((node) => node.fileId)
        .filter((fileId, index, fileIds): fileId is string =>
          Boolean(fileId) && fileIds.indexOf(fileId) === index,
        ),
    [nodes],
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
    if (graphFileIds.length === 0) {
      setRelationRows([]);
      return;
    }
    void listEvidenceRowsByFileIds(graphFileIds)
      .then((rows) => {
        if (!cancelled) setRelationRows(rows);
      })
      .catch(() => {
        if (!cancelled) setRelationRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [graphFileIds]);

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

  const relationEvidenceByKey = useMemo<ReadonlyMap<string, GraphRelationProjection>>(
    () =>
      new Map(
        edges.map((edge) => [
          graphRelationKey(edge.source, edge.target),
          projectGraphRelationEvidence(edge, nodes, relationRows, files),
        ]),
      ),
    [edges, files, nodes, relationRows],
  );

  const evidenceFilteredEdges = useMemo(() => {
    if (evidenceFilter === 'all') return projectedEdges;
    return projectedEdges.filter((edge) =>
      matchesEvidenceFilter(graphEdgeProjection(edge, relationEvidenceByKey), evidenceFilter),
    );
  }, [evidenceFilter, projectedEdges, relationEvidenceByKey]);
  const evidenceFilteredNodes = useMemo(() => {
    if (evidenceFilter === 'all') return projectedNodes;
    const connectedIds = new Set<string>();
    for (const edge of evidenceFilteredEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    return projectedNodes.filter((node) => connectedIds.has(node.id));
  }, [evidenceFilter, evidenceFilteredEdges, projectedNodes]);
  const visibleEvidenceAnchors = useMemo(
    () => evidenceAnchors.filter((anchor) => matchesAnchorFilter(anchor, evidenceFilter)),
    [evidenceAnchors, evidenceFilter],
  );
  const laidOutNodes = useMemo(
    () => layoutGraphNodes(evidenceFilteredNodes, view),
    [evidenceFilteredNodes, view],
  );
  const visiblePaperIds = useMemo(
    () =>
      new Set(
        evidenceFilteredNodes
          .filter((node) => node.kind !== 'tag')
          .map((node) => node.id),
      ),
    [evidenceFilteredNodes],
  );
  const visibleKeywordIds = useMemo(
    () =>
      new Set(
        evidenceFilteredNodes
          .filter((node) => node.kind === 'tag')
          .map((node) => node.id),
      ),
    [evidenceFilteredNodes],
  );

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

  const handleProjectedNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.kind === 'tag') {
        handleKeywordClick(node);
      } else {
        handlePaperClick(node);
      }
    },
    [handleKeywordClick, handlePaperClick],
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
        view={view}
        syncing={kwSyncing}
        loading={loading || kwLoading}
        query={query}
        kindFilter={kindFilter}
        evidenceFilter={evidenceFilter}
        onQueryChange={setQuery}
        onKindFilterChange={setKindFilter}
        onEvidenceFilterChange={setEvidenceFilter}
        onViewChange={setView}
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

      <div className={`${styles.workbench}${scopeRailCollapsed ? ` ${styles.workbenchCollapsed}` : ''}`}>
        <aside
          className={`${styles.scopeRail}${scopeRailCollapsed ? ` ${styles.scopeRailCollapsed}` : ''}`}
          aria-label="图谱范围"
        >
          <button
            type="button"
            className={styles.scopeToggle}
            aria-label={scopeRailCollapsed ? '展开图谱范围' : '收起图谱范围'}
            aria-expanded={!scopeRailCollapsed}
            title={scopeRailCollapsed ? '展开图谱范围' : '收起图谱范围'}
            onClick={() => setScopeRailCollapsed((current) => !current)}
          >
            {scopeRailCollapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
          {!scopeRailCollapsed ? (
            <>
              <p className={styles.scopeLabel}>研究范围</p>
              <strong>本地研究空间</strong>
              <p className={styles.scopeMeta}>{visiblePaperNodes.length} 篇论文 · {visibleKeywordNodes.length} 个主题</p>
              <div className={styles.scopeRule} />
              <p className={styles.scopeNote}>
                论文是来源，主题是整理线索；证据锚点只在选中对象后展开。
              </p>
            </>
          ) : null}
        </aside>

        <section className={styles.canvasPane} aria-label={`${view} 图谱视图`}>
          <div className={styles.canvasHeader}>
            <div>
              <p className={styles.scopeLabel}>当前视图</p>
              <h2 className={styles.canvasTitle}>
                {view === 'overview' ? '研究空间概览' : view === 'papers' ? '论文关系' : view === 'topics' ? '主题与论文' : '证据锚点'}
              </h2>
            </div>
            <span className={styles.canvasMeta}>
              {view === 'evidence'
                ? `${visibleEvidenceAnchors.length} 条局部锚点`
                : `${laidOutNodes.length} 个节点`}
            </span>
          </div>
          <div className={styles.graph}>
            {view === 'evidence' ? (
              <EvidenceView
                anchors={visibleEvidenceAnchors}
                loading={evidenceLoading}
                error={evidenceError}
                onOpenEvidence={handleOpenEvidence}
              />
            ) : laidOutNodes.length === 0 ? (
              <p className={styles.paneEmpty}>
                {nodes.length === 0 ? '暂无论文节点；先从资料库加入研究空间。' : '没有匹配的节点'}
              </p>
            ) : (
              <GraphCanvas
                nodes={laidOutNodes}
                edges={evidenceFilteredEdges}
                selectedNodeId={selectedNodeId ?? selectedKeywordId}
                highlightedNodeIds={[...highlightedPaperIds, ...highlightedKeywordIds]}
                onNodeClick={handleProjectedNodeClick}
                onBackgroundClick={clearSelection}
                fitKey={view}
                onNodeDrag={(node, x, y) => {
                  if (node.kind === 'tag') void persistKeywordPosition(node.id, x, y);
                  else void persistNodePosition(node.id, x, y);
                }}
              />
            )}
          </div>
          {view !== 'evidence' && laidOutNodes.length > 0 ? (
            <details className={styles.graphListFallback}>
              <summary>用列表查看当前视图</summary>
              <ul>
                {laidOutNodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      aria-label={`选择${node.kind === 'tag' ? '主题' : '论文'} ${node.label}`}
                      onClick={() => handleProjectedNodeClick(node)}
                    >
                      <span>{node.label}</span>
                      <small>{node.kind === 'tag' ? '主题' : '论文'}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

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
          relationEvidenceByKey={relationEvidenceByKey}
          onSelectPaper={handlePaperClick}
          onOpenPaper={handleOpenPaper}
          onOpenEvidence={handleOpenEvidence}
          onCreateComparison={handleCreateComparison}
          onClose={clearSelection}
        />
      </div>
    </main>
  );
}
