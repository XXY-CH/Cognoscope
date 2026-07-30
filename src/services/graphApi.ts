const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface GraphNode {
  id: string;
  fileId: string | null;
  label: string;
  kind: 'file' | 'folder' | 'tag';
  fileType: string | null;
  x: number | null;
  y: number | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphNodesResponse {
  nodes: GraphNode[];
}

interface GraphEdgesResponse {
  edges: GraphEdge[];
}

interface GraphSyncResponse {
  synced_count: number;
}

interface GraphBuildResponse {
  task_id: string | null;
  created_count: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export async function fetchGraphNodes(): Promise<GraphNode[]> {
  const response = await fetch(`${API_BASE}/graph/nodes`);
  if (!response.ok) {
    throw new Error(`Failed to fetch nodes: ${response.statusText}`);
  }
  const data: GraphNodesResponse = await response.json();
  return data.nodes;
}

export async function fetchGraphEdges(): Promise<GraphEdge[]> {
  const response = await fetch(`${API_BASE}/graph/edges`);
  if (!response.ok) {
    throw new Error(`Failed to fetch edges: ${response.statusText}`);
  }
  const data: GraphEdgesResponse = await response.json();
  return data.edges;
}

export async function syncGraphNodes(): Promise<number> {
  const response = await fetch(`${API_BASE}/graph/sync`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to sync nodes: ${response.statusText}`);
  }
  const data: GraphSyncResponse = await response.json();
  return data.synced_count;
}

export async function triggerGraphBuild(useAI: boolean = false): Promise<GraphBuildResponse> {
  const url = new URL(`${API_BASE}/graph/build`);
  if (useAI) {
    url.searchParams.set('use_ai', 'true');
  }
  const response = await fetch(url.toString(), { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to trigger build: ${response.statusText}`);
  }
  return await response.json();
}