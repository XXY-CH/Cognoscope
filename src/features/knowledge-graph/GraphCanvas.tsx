/**
 * GraphCanvas - 2D 力导向知识图谱画布
 * 使用 react-force-graph-2d；支持选中与联动高亮（dim 非高亮节点）
 * 规范参考：UI_spec.md §6.3
 */
import { useEffect, useMemo, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphNode, GraphEdge } from '../../types';
import {
  useReducedMotion,
  type RenderGraphData,
} from './graphCanvasPhysics';

/** Keep zoom-to-fit from making sparse graphs visually dominate the workbench. */
const GRAPH_MIN_ZOOM = 0.25;
const GRAPH_MAX_ZOOM = 4;

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  /** 联动高亮；为空则不高亮过滤 */
  highlightedNodeIds?: string[];
  onNodeClick: (node: GraphNode) => void;
  onBackgroundClick?: () => void;
  onNodeDrag: (node: GraphNode, x: number, y: number) => void;
  /** 视图或筛选变化时重新 fit；拖拽后的坐标变化不会触发视图跳动。 */
  fitKey?: string;
}

/**
 * @param nodes - 图节点
 * @param edges - 图边
 * @param selectedNodeId - 当前选中
 * @param highlightedNodeIds - 联动高亮集合
 * @param onNodeClick - 点击节点
 * @param onBackgroundClick - 点击空白取消选中
 * @param onNodeDrag - 拖拽结束持久化坐标
 */
export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  highlightedNodeIds = [],
  onNodeClick,
  onBackgroundClick,
  onNodeDrag,
  fitKey = '',
}: GraphCanvasProps) {
  // react-force-graph-2d 的 ref 类型与自定义字段不兼容，用宽松类型
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const graphDataRef = useRef<RenderGraphData | null>(null);
  const graphDataKeyRef = useRef<string | null>(null);
  const graphDataContentRef = useRef<string | null>(null);
  const fitRequestedRef = useRef(true);
  const previousGraphKeyRef = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();

  const highlightSet = new Set(highlightedNodeIds);
  const hasHighlight = highlightSet.size > 0;

  const graphKey = useMemo(
    () =>
      [
        fitKey,
        nodes.map((node) => node.id).join(','),
        edges.map((edge) => `${edge.source}:${edge.target}`).join(','),
      ].join('|'),
    [edges, fitKey, nodes],
  );

  const graphData = useMemo<RenderGraphData>(() => {
    const contentKey = [
      nodes.map((node) => `${node.id}:${node.label}:${node.kind}`).join('|'),
      edges
        .map(
          (edge) =>
            `${edge.source}:${edge.target}:${edge.weight}:${edge.origin ?? 'unknown'}:${edge.reason ?? ''}`,
        )
        .join('|'),
    ].join('||');
    const sameLayout =
      graphDataKeyRef.current === graphKey && graphDataRef.current !== null;

    // A persisted drag only changes the source-of-truth coordinates. Keep the
    // force graph's live node objects so that writing the drop position does
    // not restart the simulation and move the node away from the cursor.
    if (
      sameLayout &&
      graphDataContentRef.current === contentKey &&
      graphDataRef.current
    ) {
      return graphDataRef.current;
    }

    const previousNodes = sameLayout
      ? new Map(graphDataRef.current?.nodes.map((node) => [node.id, node]))
      : null;
    const next: RenderGraphData = {
      nodes: nodes.map((node) => {
        const previous = previousNodes?.get(node.id);
        return previous
          ? {
              ...previous,
              label: node.label,
              kind: node.kind,
            }
          : {
              id: node.id,
              label: node.label,
              kind: node.kind,
              x: node.x ?? undefined,
              y: node.y ?? undefined,
            };
      }),
      links: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        origin: edge.origin ?? 'unknown',
        reason: edge.reason,
      })),
    };
    graphDataRef.current = next;
    graphDataKeyRef.current = graphKey;
    graphDataContentRef.current = contentKey;
    return next;
  }, [edges, graphKey, nodes]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || nodes.length === 0) return;

    if (previousGraphKeyRef.current !== graphKey) {
      fitRequestedRef.current = true;
      previousGraphKeyRef.current = graphKey;
    }

    // Keep the scholarly starting positions, then let the graph settle like
    // Obsidian: connected nodes attract, unrelated nodes repel, and the
    // center force keeps sparse graphs inside the workbench.
    const charge = graph.d3Force('charge');
    charge?.strength(-180).distanceMax(720);
    const link = graph.d3Force('link');
    link
      ?.distance((edge: any) => (edge.origin === 'cooccurrence' ? 96 : 122))
      .strength((edge: any) => Math.max(0.24, Math.min(0.8, edge.weight ?? 0.5)));
    graph.d3Force('center')?.strength(0.08);
    graph.d3ReheatSimulation();
  }, [graphData, graphKey, nodes.length, reducedMotion]);

  const isEmphasized = (id: string) =>
    id === selectedNodeId || (hasHighlight && highlightSet.has(id));

  const getNodeColor = (node: { id: string; kind: string }) => {
    const cssVars = getComputedStyle(document.documentElement);
    if (node.id === selectedNodeId) {
      return cssVars.getPropertyValue('--accent').trim() || '#2f6f85';
    }
    if (hasHighlight && highlightSet.has(node.id)) {
      return cssVars.getPropertyValue('--accent').trim() || '#2f6f85';
    }
    switch (node.kind) {
      case 'file':
        return cssVars.getPropertyValue('--text-primary').trim() || '#1a1a1e';
      case 'folder':
        return cssVars.getPropertyValue('--accent-subtle').trim() || '#e7f0f2';
      case 'tag':
        return cssVars.getPropertyValue('--success').trim() || '#33745b';
      default:
        return cssVars.getPropertyValue('--text-tertiary').trim() || '#7b8781';
    }
  };

  const getNodeSize = (node: { id: string; kind: string }) => {
    const baseSize = isEmphasized(node.id) ? 1.1 : 1.0;
    switch (node.kind) {
      case 'file':
        return 5 * baseSize;
      case 'folder':
        return 7 * baseSize;
      case 'tag':
        return 4 * baseSize;
      default:
        return 4 * baseSize;
    }
  };

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={graphData}
      nodeLabel={(node: any) => node.label ?? ''}
      nodeColor={getNodeColor}
      nodeVal={getNodeSize}
      minZoom={GRAPH_MIN_ZOOM}
      maxZoom={GRAPH_MAX_ZOOM}
      nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (node.x == null || node.y == null || !node.id) return;
        const dim =
          hasHighlight &&
          !highlightSet.has(node.id) &&
          node.id !== selectedNodeId;
        ctx.save();
        if (dim) ctx.globalAlpha = 0.22;

        const label = node.label ?? '';
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px sans-serif`;

        const size = getNodeSize({
          id: node.id,
          kind: node.kind ?? 'file',
        });
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = getNodeColor({
          id: node.id,
          kind: node.kind ?? 'file',
        });
        ctx.fill();

        if (node.id === selectedNodeId || highlightSet.has(node.id)) {
          ctx.strokeStyle = getNodeColor({
            id: node.id,
            kind: node.kind ?? 'file',
          });
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--text-primary')
            .trim() || '#1a1a1e';
        ctx.fillText(label, node.x, node.y + size + 2);
        ctx.restore();
      }}
      linkWidth={(link: any) => Math.max(1, (link.weight ?? 0.5) * 1.5)}
      linkColor={(link: any) => {
        const cssVars = getComputedStyle(document.documentElement);
        const token =
          link.origin === 'ai'
            ? '--accent'
            : link.origin === 'cooccurrence'
              ? '--success'
              : link.origin === 'mixed'
                ? '--accent'
              : link.origin === 'manual'
                ? '--warning'
                : '--border-default';
        return cssVars.getPropertyValue(token).trim() || '#b9c5c0';
      }}
      linkDirectionalParticles={0}
      warmupTicks={reducedMotion ? 80 : 24}
      cooldownTicks={reducedMotion ? 0 : 220}
      cooldownTime={reducedMotion ? 0 : 4500}
      d3AlphaDecay={reducedMotion ? 1 : 0.04}
      d3VelocityDecay={reducedMotion ? 1 : 0.42}
      onEngineStop={() => {
        const graph = graphRef.current;
        if (!graph || !fitRequestedRef.current) return;
        fitRequestedRef.current = false;
        graph.zoomToFit(reducedMotion ? 0 : 260, 48);
      }}
      onNodeClick={(node: any) => {
        const original = nodes.find((n) => n.id === node.id);
        if (original) onNodeClick(original);
      }}
      onBackgroundClick={() => onBackgroundClick?.()}
      onNodeDragEnd={(node: any) => {
        const original = nodes.find((n) => n.id === node.id);
        if (original && node.x != null && node.y != null) {
          // 保持手动布局：其它节点继续受力，用户刚放下的节点留在落点。
          node.fx = node.x;
          node.fy = node.y;
          onNodeDrag(original, node.x, node.y);
        }
      }}
    />
  );
}
