/**
 * GraphCanvas - 2D 力导向知识图谱画布
 * 使用 react-force-graph-2d 实现，符合 UI_spec.md §6.3 节点规格
 */
import { useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphNode, GraphEdge } from '../../stores/graphStore';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onNodeClick: (node: GraphNode) => void;
  onNodeDrag: (node: GraphNode, x: number, y: number) => void;
}

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  onNodeClick,
  onNodeDrag,
}: GraphCanvasProps) {
  const graphRef = useRef<any>();

  // Convert to force-graph format
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
    })),
  };

  useEffect(() => {
    // 移除自动缩放，让用户自己控制视图
    // 仅在首次加载时设置合理的初始缩放
    if (graphRef.current && nodes.length > 0) {
      const hasInitialized = graphRef.current.__initialized;
      if (!hasInitialized) {
        graphRef.current.__initialized = true;
        // 仅首次居中，不改变缩放级别
        graphRef.current.centerAt(0, 0, 0);
      }
    }
  }, [nodes.length]);

  const getNodeColor = (node: any) => {
    const cssVars = getComputedStyle(document.documentElement);
    if (node.id === selectedNodeId) {
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
        return '#999';
    }
  };

  const getNodeSize = (node: any) => {
    // 更小的节点尺寸
    const baseSize = node.id === selectedNodeId ? 1.2 : 1.0;
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
      nodeLabel={(node: any) => node.label}
      nodeColor={getNodeColor}
      nodeVal={getNodeSize}
      nodeCanvasObject={(node: any, ctx, globalScale) => {
        const label = node.label;
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px Inter, sans-serif`;
        
        // 绘制节点圆
        ctx.beginPath();
        ctx.arc(node.x, node.y, getNodeSize(node), 0, 2 * Math.PI);
        ctx.fillStyle = getNodeColor(node);
        ctx.fill();
        
        // 绘制选中光环
        if (node.id === selectedNodeId) {
          ctx.strokeStyle = getNodeColor(node);
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }
        
        // 绘制标签
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-primary')
          .trim() || '#1A1A1E';
        ctx.fillText(label, node.x, node.y + getNodeSize(node) + 2);
      }}
      linkWidth={(link: any) => Math.max(1, link.weight * 1.5)}
      linkColor={() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--border-default')
          .trim() || '#C8C8D2'
      }
      linkDirectionalParticles={2}
      linkDirectionalParticleWidth={(link: any) => link.weight * 2}
      linkDirectionalParticleSpeed={0.005}
      onNodeClick={(node: any) => {
        const original = nodes.find((n) => n.id === node.id);
        if (original) onNodeClick(original);
      }}
      onNodeDragEnd={(node: any) => {
        const original = nodes.find((n) => n.id === node.id);
        if (original) onNodeDrag(original, node.x, node.y);
      }}
      cooldownTicks={100}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
    />
  );
}