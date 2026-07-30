import { create } from 'zustand';

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

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  buildProgress: number | null;
  loading: boolean;
  error: string | null;

  setNodes: (nodes: GraphNode[]) => void;
  setEdges: (edges: GraphEdge[]) => void;
  setSelectedNode: (id: string | null) => void;
  setBuildProgress: (progress: number | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  buildProgress: null,
  loading: false,
  error: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setBuildProgress: (progress) => set({ buildProgress: progress }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));