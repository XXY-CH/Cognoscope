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
import { listEvidenceMatrices } from '../../db/evidenceMatrices';
import * as metaDb from '../../db/fileDocMeta';
import { useFileStore } from '../../stores/fileStore';
import { useGraphStore } from '../../stores/graphStore';
import { useKeywordGraphStore } from '../../stores/keywordGraphStore';
import { useReaderStore } from '../../stores/readerStore';
import type {
  EvidenceRow,
  EvidenceMatrix,
  FileDocMeta,
  GraphEdge,
  GraphNode,
  KeywordNode,
} from '../../types';
import {
  canOpenGraphEvidence,
  fileIdsForGraphSelection,
  graphRelationKey,
  projectGraphRelationEvidence,
  selectGraphEvidenceAnchors,
  type GraphEvidenceAnchor,
  type GraphRelationProjection,
} from '../../utils/graphEvidence';
import { GraphCanvas } from './GraphCanvas';
import { GraphInspector } from './GraphInspector';
import { ArgumentView } from './ArgumentView';
import { ComparisonEvolutionView } from './ComparisonEvolutionView';
import { MaterialsHierarchyView } from './MaterialsHierarchyView';
import {
  buildArgumentProjection,
  buildComparisonProjection,
  buildEvolutionEvents,
  buildMaterialsHierarchy,
} from './researchMapProjections';
import { buildExploreProjection } from './exploreProjection';
import {
  GraphToolbar,
  type GraphEvidenceFilter,
  type GraphView,
} from './GraphToolbar';
import { filterGraphData, type GraphKindFilter } from './graphFilters';
import { useReducedMotion } from './graphCanvasPhysics';
import styles from './KnowledgeGraphPage.module.css';

const VIEW_TITLE: Record<GraphView, string> = {
  materials: '资料',
  argument: '论证',
  comparison: '比较',
  evolution: '演化',
  explore: '探索',
};

const EXPLORE_NODE_TARGET = 30;
const EXPLORE_HOP_LIMIT = 2;
const EXPLORE_LIST_TARGET = 120;

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

function keywordToGraphNode(keyword: KeywordNode): GraphNode {
  return {
    id: keyword.id,
    fileId: null,
    label: keyword.label,
    kind: 'tag' as const,
    x: keyword.x,
    y: keyword.y,
  };
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
    file: view === 'explore' ? 0 : 0,
    folder: -240,
    tag: 240,
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

/**
 * KnowledgeGraphPage - 资料、论证、比较、演化和局部探索五种任务投影，配合来源检查器。
 */
export function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<GraphView>('materials');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<GraphKindFilter>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<GraphEvidenceFilter>('all');
  const [selectedMeta, setSelectedMeta] = useState<FileDocMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [evidenceAnchors, setEvidenceAnchors] = useState<GraphEvidenceAnchor[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [relationRows, setRelationRows] = useState<EvidenceRow[]>([]);
  const [matrices, setMatrices] = useState<EvidenceMatrix[]>([]);
  const [matricesLoading, setMatricesLoading] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [scopeRailCollapsed, setScopeRailCollapsed] = useState(false);
  const restoredSelectionRef = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();

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

  useEffect(() => {
    let cancelled = false;
    setMatricesLoading(true);
    void listEvidenceMatrices()
      .then((nextMatrices) => {
        if (cancelled) return;
        setMatrices(nextMatrices);
        setSelectedQuestionId((current) =>
          current && nextMatrices.some((matrix) => matrix.id === current)
            ? current
            : nextMatrices[0]?.id ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setMatrices([]);
      })
      .finally(() => {
        if (!cancelled) setMatricesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const materialsData = useMemo(
    () => buildMaterialsHierarchy(filteredGraph.paperNodes, filteredGraph.keywordNodes),
    [filteredGraph.keywordNodes, filteredGraph.paperNodes],
  );
  const graphFileIds = useMemo(
    () =>
      nodes
        .map((node) => node.fileId)
        .filter((fileId, index, fileIds): fileId is string =>
          Boolean(fileId) && fileIds.indexOf(fileId) === index,
        ),
    [nodes],
  );
  const evidenceFileIds = useMemo(
    () =>
      [...new Set([
        ...graphFileIds,
        ...matrices.flatMap((matrix) => matrix.fileIds),
      ])],
    [graphFileIds, matrices],
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
    if (evidenceFileIds.length === 0) {
      setRelationRows([]);
      return;
    }
    void listEvidenceRowsByFileIds(evidenceFileIds)
      .then((rows) => {
        if (!cancelled) setRelationRows(rows);
      })
      .catch(() => {
        if (!cancelled) setRelationRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [evidenceFileIds]);

  const argumentProjection = useMemo(
    () => buildArgumentProjection(matrices, relationRows, files),
    [files, matrices, relationRows],
  );
  const selectedMatrix = useMemo(
    () => matrices.find((matrix) => matrix.id === selectedQuestionId) ?? null,
    [matrices, selectedQuestionId],
  );
  const allEvidenceAnchors = useMemo(
    () =>
      selectGraphEvidenceAnchors(
        relationRows,
        files,
        evidenceFileIds,
        2000,
      ),
    [evidenceFileIds, files, relationRows],
  );
  const comparisonProjection = useMemo(
    () => buildComparisonProjection(selectedMatrix, relationRows, files, allEvidenceAnchors),
    [allEvidenceAnchors, files, relationRows, selectedMatrix],
  );
  const evolutionEvents = useMemo(
    () => buildEvolutionEvents(relationRows, files, allEvidenceAnchors),
    [allEvidenceAnchors, files, relationRows],
  );
  const argumentClaimById = useMemo(
    () => new Map(argumentProjection.claims.map((claim) => [claim.id, claim])),
    [argumentProjection.claims],
  );

  useEffect(() => {
    const claimsForQuestion = argumentProjection.claims.filter(
      (claim) => claim.questionId === selectedQuestionId,
    );
    setSelectedClaimId((current) =>
      current && claimsForQuestion.some((claim) => claim.id === current)
        ? current
        : claimsForQuestion[0]?.id ?? null,
    );
  }, [argumentProjection.claims, selectedQuestionId]);

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

  const exploreSeed = useMemo(() => {
    if (selectedPaper) return selectedPaper;
    if (selectedKeyword) return keywordToGraphNode(selectedKeyword);
    return null;
  }, [selectedKeyword, selectedPaper]);
  const exploreProjection = useMemo(
    () =>
      buildExploreProjection({
        seed: exploreSeed,
        nodes: [...visiblePaperNodes, ...visibleKeywordGraphNodes],
        edges: [...visiblePaperEdges, ...visibleKeywordEdges, ...paperTopicEdges],
        nodeCap: EXPLORE_NODE_TARGET,
        hopLimit: EXPLORE_HOP_LIMIT,
      }),
    [
      exploreSeed,
      paperTopicEdges,
      visibleKeywordEdges,
      visibleKeywordGraphNodes,
      visiblePaperEdges,
      visiblePaperNodes,
    ],
  );
  const exploreCanvasNodes = useMemo(
    () =>
      layoutGraphNodes(
        exploreProjection.frames
          .slice(0, EXPLORE_NODE_TARGET)
          .map((frame) => frame.node),
        view,
      ),
    [exploreProjection.frames, view],
  );
  const exploreNodeIds = useMemo(
    () => new Set(exploreProjection.frames.map((frame) => frame.node.id)),
    [exploreProjection.frames],
  );
  const exploreListFallback =
    view === 'explore' &&
    (!exploreProjection.hasSeed ||
      exploreProjection.overflowCount > 0 ||
      reducedMotion);
  const evidenceFilteredEdges = useMemo(() => {
    const activeEdges = view === 'explore' ? exploreProjection.edges : [];
    if (evidenceFilter === 'all') return activeEdges;
    return activeEdges.filter((edge) =>
      matchesEvidenceFilter(graphEdgeProjection(edge, relationEvidenceByKey), evidenceFilter),
    );
  }, [evidenceFilter, exploreProjection.edges, relationEvidenceByKey, view]);
  const exploreListFrames = useMemo(() => {
    if (evidenceFilter === 'all') return exploreProjection.frames;
    const connectedIds = new Set<string>();
    for (const edge of evidenceFilteredEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    return exploreProjection.frames.filter((frame) => connectedIds.has(frame.node.id));
  }, [evidenceFilter, evidenceFilteredEdges, exploreProjection.frames]);
  const exploreListNodes = useMemo(
    () =>
      exploreListFrames
        .slice(0, EXPLORE_LIST_TARGET)
        .map((frame) => frame.node),
    [exploreListFrames],
  );
  const exploreHiddenListCount = Math.max(
    0,
    exploreListFrames.length - EXPLORE_LIST_TARGET,
  );
  const exploreFallbackReason = exploreProjection.hasSeed
    ? evidenceFilter !== 'all' && exploreListFrames.length === 0
      ? '当前证据筛选没有匹配的局部关系。'
      : exploreProjection.overflowCount > 0
        ? `当前邻域超过 ${EXPLORE_NODE_TARGET} 个节点，已折叠为列表。`
        : reducedMotion
          ? '已开启减少动效，局部探索使用列表替代画布。'
          : ''
    : '请先选中一个论文或主题，再查看它附近的一到两跳线索。';
  const evidenceFilteredNodes = useMemo(() => {
    const activeNodes = view === 'explore' ? exploreCanvasNodes : [];
    if (evidenceFilter === 'all') return activeNodes;
    const connectedIds = new Set<string>();
    for (const edge of evidenceFilteredEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    return activeNodes.filter((node) => connectedIds.has(node.id));
  }, [evidenceFilter, evidenceFilteredEdges, exploreCanvasNodes, view]);
  const laidOutNodes = useMemo(
    () => layoutGraphNodes(evidenceFilteredNodes, view),
    [evidenceFilteredNodes, view],
  );
  const visiblePaperIds = useMemo(
    () =>
      new Set(
        exploreProjection.frames
          .filter((frame) => frame.node.kind !== 'tag')
          .map((frame) => frame.node.id),
      ),
    [exploreProjection.frames],
  );
  const visibleKeywordIds = useMemo(
    () =>
      new Set(
        exploreProjection.frames
          .filter((frame) => frame.node.kind === 'tag')
          .map((frame) => frame.node.id),
      ),
    [exploreProjection.frames],
  );

  useEffect(() => {
    if (view !== 'explore') return;
    if (selectedNodeId && !exploreNodeIds.has(selectedNodeId)) {
      setSelectedNode(null);
    }
    if (selectedKeywordId && !exploreNodeIds.has(selectedKeywordId)) {
      setSelectedKeyword(null);
      setHighlightedKeywords([]);
    }
  }, [
    exploreNodeIds,
    selectedKeywordId,
    selectedNodeId,
    setHighlightedKeywords,
    setSelectedKeyword,
    setSelectedNode,
    view,
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

  const handleOpenEvidenceMatrix = (matrixId: string, rowId?: string) => {
    const query = rowId ? `?rowId=${encodeURIComponent(rowId)}` : '';
    navigate(`/evidence-matrix/${encodeURIComponent(matrixId)}${query}`);
  };

  const handleArgumentMatrixAction = (claimId: string, rowIds: string[]) => {
    const rowId = rowIds[0];
    const claim = argumentClaimById.get(claimId);
    const matrixId = claim?.questionId;
    if (!matrixId) {
      toast.warning('该主张尚未绑定证据矩阵');
      return;
    }
    handleOpenEvidenceMatrix(matrixId, rowId);
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
              <p className={styles.scopeMeta}>{filteredGraph.paperNodes.length} 篇论文 · {filteredGraph.keywordNodes.length} 个主题</p>
              <div className={styles.scopeRule} />
              <p className={styles.scopeNote}>
                论文是来源，主题是整理线索；证据锚点只在选中对象后展开。
              </p>
            </>
          ) : null}
        </aside>

        <section className={styles.canvasPane} aria-label={`${view} 研究地图视图`}>
          <div className={styles.canvasHeader}>
            <div>
              <p className={styles.scopeLabel}>当前视图</p>
              <h2 className={styles.canvasTitle}>
                {VIEW_TITLE[view]}
              </h2>
            </div>
            <span className={styles.canvasMeta}>
              {view === 'materials'
                ? `${materialsData.clusters.length} 个主题簇`
                : view === 'argument'
                  ? `${argumentProjection.claims.filter((claim) => claim.questionId === selectedQuestionId).length} 条主张`
                  : view === 'comparison'
                    ? `${comparisonProjection.claims.length} 条主张`
                    : view === 'evolution'
                      ? `${evolutionEvents.length} 个判断节点`
                      : `${laidOutNodes.length} 个节点`}
            </span>
          </div>
          <div className={styles.graph}>
            {view === 'materials' ? (
              <MaterialsHierarchyView
                data={materialsData}
                selectedId={selectedPaper?.id ?? selectedKeyword?.id}
                onNavigate={(target) => {
                  if (target.kind !== 'paper') return;
                  const node = nodes.find((candidate) => candidate.id === target.id);
                  if (node) handlePaperClick(node);
                }}
              />
            ) : view === 'argument' ? (
              <ArgumentView
                questions={argumentProjection.questions}
                selectedQuestionId={selectedQuestionId}
                onSelectQuestion={setSelectedQuestionId}
                claims={argumentProjection.claims}
                relations={argumentProjection.relations}
                evidenceAnchors={argumentProjection.anchors}
                selectedClaimId={selectedClaimId}
                onSelectClaim={setSelectedClaimId}
                referenceLabels={argumentProjection.referenceLabels}
                loading={matricesLoading}
                onOpenEvidenceMatrix={handleArgumentMatrixAction}
                onAddToEvidenceMatrix={handleArgumentMatrixAction}
                onOpenReader={handleOpenEvidence}
              />
            ) : view === 'comparison' ? (
              <ComparisonEvolutionView
                mode="comparison"
                question={comparisonProjection.question}
                columns={comparisonProjection.columns}
                claims={comparisonProjection.claims}
                events={[]}
                onOpenEvidenceMatrix={handleOpenEvidenceMatrix}
                onOpenReader={handleOpenEvidence}
              />
            ) : view === 'evolution' ? (
              <ComparisonEvolutionView
                mode="evolution"
                question={selectedMatrix?.comparisonQuestion ?? ''}
                columns={[]}
                claims={[]}
                events={evolutionEvents}
                onOpenEvidenceMatrix={handleOpenEvidenceMatrix}
                onOpenReader={handleOpenEvidence}
              />
            ) : exploreListFallback ? (
              <div>
                <p className={styles.paneEmpty}>
                  {exploreFallbackReason}
                  {exploreProjection.hasSeed
                    ? ` 当前显示 ${exploreListNodes.length} 个局部节点，范围为 ${EXPLORE_HOP_LIMIT} 跳。${
                        exploreHiddenListCount > 0
                          ? ` 其余 ${exploreHiddenListCount} 个节点仍保持折叠。`
                          : ''
                      }`
                    : ''}
                </p>
                <details className={styles.graphListFallback} open>
                  <summary>用列表查看局部探索</summary>
                  <ul>
                    {exploreListNodes.map((node) => (
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
              </div>
            ) : laidOutNodes.length === 0 ? (
              <p className={styles.paneEmpty}>
                {nodes.length === 0 ? '暂无论文节点；先从资料库加入研究空间。' : '没有匹配的节点'}
              </p>
            ) : (
              <GraphCanvas
                nodes={exploreProjection.hasSeed ? exploreCanvasNodes : laidOutNodes}
                edges={exploreProjection.hasSeed ? evidenceFilteredEdges : []}
                selectedNodeId={selectedNodeId ?? selectedKeywordId}
                highlightedNodeIds={[...highlightedPaperIds, ...highlightedKeywordIds]}
                onNodeClick={handleProjectedNodeClick}
                onBackgroundClick={clearSelection}
                fitKey={exploreProjection.hasSeed ? `explore:${exploreProjection.seedId ?? 'seed'}` : view}
                onNodeDrag={(node, x, y) => {
                  if (node.kind === 'tag') void persistKeywordPosition(node.id, x, y);
                  else void persistNodePosition(node.id, x, y);
                }}
              />
            )}
          </div>
          {view === 'explore' && !exploreListFallback && exploreCanvasNodes.length > 0 ? (
            <details className={styles.graphListFallback}>
              <summary>用列表查看局部探索</summary>
              <ul>
                {exploreCanvasNodes.map((node) => (
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
