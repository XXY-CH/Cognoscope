import type { GraphEdge, GraphNode } from '../../types';

export interface ExploreFrame {
  node: GraphNode;
  depth: number;
  degree: number;
}

export interface ExploreProjection {
  seedId: string | null;
  seedLabel: string;
  frames: ExploreFrame[];
  edges: GraphEdge[];
  overflowCount: number;
  hasSeed: boolean;
}

export interface ExploreProjectionInput {
  seed: GraphNode | null;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  nodeCap?: number;
  hopLimit?: number;
}

export function buildExploreProjection({
  seed,
  nodes,
  edges,
  nodeCap = 30,
  hopLimit = 2,
}: ExploreProjectionInput): ExploreProjection {
  if (!seed) {
    return {
      seedId: null,
      seedLabel: '',
      frames: [],
      edges: [],
      overflowCount: 0,
      hasSeed: false,
    };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const seedNode = nodeById.get(seed.id);
  if (!seedNode) {
    return {
      seedId: null,
      seedLabel: seed.label,
      frames: [],
      edges: [],
      overflowCount: 0,
      hasSeed: false,
    };
  }

  const adjacency = new Map<string, { id: string; edge: GraphEdge }[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    const sourceList = adjacency.get(edge.source) ?? [];
    sourceList.push({ id: edge.target, edge });
    adjacency.set(edge.source, sourceList);

    const targetList = adjacency.get(edge.target) ?? [];
    targetList.push({ id: edge.source, edge });
    adjacency.set(edge.target, targetList);
  }

  const distance = new Map<string, number>([[seedNode.id, 0]]);
  const queue: string[] = [seedNode.id];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const depth = distance.get(id);
    if (depth == null || depth >= hopLimit) continue;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (distance.has(neighbor.id)) continue;
      distance.set(neighbor.id, depth + 1);
      queue.push(neighbor.id);
    }
  }

  const frames = [...distance.entries()]
    .map(([id, depth]) => {
      const node = nodeById.get(id);
      if (!node) return null;
      return {
        node,
        depth,
        degree: adjacency.get(id)?.length ?? 0,
      };
    })
    .filter((frame): frame is ExploreFrame => frame !== null)
    .sort((left, right) => {
      if (left.depth !== right.depth) return left.depth - right.depth;
      if (left.degree !== right.degree) return right.degree - left.degree;
      const labelCmp = left.node.label.localeCompare(right.node.label);
      if (labelCmp !== 0) return labelCmp;
      return left.node.id.localeCompare(right.node.id);
    });

  const frameIds = new Set(frames.map((frame) => frame.node.id));
  const projectedEdges = edges.filter(
    (edge) => frameIds.has(edge.source) && frameIds.has(edge.target),
  );

  return {
    seedId: seedNode.id,
    seedLabel: seedNode.label,
    frames,
    edges: projectedEdges,
    overflowCount: Math.max(0, frames.length - nodeCap),
    hasSeed: true,
  };
}
