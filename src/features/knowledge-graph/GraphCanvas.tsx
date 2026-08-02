/**
 * GraphCanvas - 2D 力导向知识图谱画布
 * 使用 react-force-graph-2d；支持选中与联动高亮（dim 非高亮节点）
 * 规范参考：UI_spec.md §6.3
 */
import { useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphNode, GraphEdge } from '../../types';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  /** 联动高亮；为空则不高亮过滤 */
  highlightedNodeIds?: string[];
  onNodeClick: (node: GraphNode) => void;
  onBackgroundClick?: () => void;
  onNodeDrag: (node: GraphNode, x: number, y: number) => void;
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
}: GraphCanvasProps) {
  // react-force-graph-2d 的 ref 类型与自定义字段不兼容，用宽松类型
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  const highlightSet = new Set(highlightedNodeIds);
  const hasHighlight = highlightSet.size > 0;

  const graphData = {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      x: n.x ?? undefined,
      y: n.y ?? undefined,
    })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      origin: e.origin ?? 'unknown',
      reason: e.reason,
    })),
  };

  useEffect(() => {
    if (graphRef.current && nodes.length > 0) {
      if (!graphRef.current.__initialized) {
        graphRef.current.__initialized = true;
        graphRef.current.centerAt(0, 0, 0);
      }
    }
  }, [nodes.length]);

  const isEmphasized = (id: string) =>
    id === selectedNodeId || (hasHighlight && highlightSet.has(id));

  const getNodeColor = (node: { id: string; kind: string }) => {
    const cssVars = getComputedStyle(document.documentElement);
    if (node.id === selectedNodeId) {
      return cssVars.getPropertyValue('--accent').trim() || '#4A6CF7';
    }
    if (hasHighlight && highlightSet.has(node.id)) {
      return cssVars.getPropertyValue('--accent').trim() || '#4A6CF7';
    }
    switch (node.kind) {
      case 'file':
        return cssVars.getPropertyValue('--text-primary').trim() || '#1A1A1E';
      case 'folder':
        return cssVars.getPropertyValue('--accent-subtle').trim() || '#EEF1FE';
      case 'tag':
        return cssVars.getPropertyValue('--success').trim() || '#34C759';
      default:
        return cssVars.getPropertyValue('--text-tertiary').trim() || '#999';
    }
  };

  const getNodeSize = (node: { id: string; kind: string }) => {
    const baseSize = isEmphasized(node.id) ? 1.25 : 1.0;
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
            .trim() || '#1A1A1E';
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
        return cssVars.getPropertyValue(token).trim() || '#C8C8D2';
      }}
      linkDirectionalParticles={2}
      linkDirectionalParticleWidth={(link: any) => (link.weight ?? 0.5) * 2}
      linkDirectionalParticleSpeed={0.005}
      onNodeClick={(node: any) => {
        const original = nodes.find((n) => n.id === node.id);
        if (original) onNodeClick(original);
      }}
      onBackgroundClick={() => onBackgroundClick?.()}
      onNodeDragEnd={(node: any) => {
        const original = nodes.find((n) => n.id === node.id);
        if (original && node.x != null && node.y != null) {
          onNodeDrag(original, node.x, node.y);
        }
      }}
      cooldownTicks={100}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
    />
  );
}
