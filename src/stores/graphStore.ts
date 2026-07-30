/**
 * graphStore - 本地知识图谱（节点 / 边 / 入图状态）
 * 所属：C · 知识图谱 / A · 文件目录标签
 * 规范参考：UI_spec.md §6 / §9 / §13 决策4；边仅由 AI 产生，无 demo 串边
 */
import { create } from 'zustand';
import * as graphDb from '../db/graph';
import * as metaDb from '../db/fileDocMeta';
import * as filesDb from '../db/files';
import type {
  GraphEdge,
  GraphMember,
  GraphMemberStatus,
  GraphNode,
} from '../types';
import {
  graphNodeIdForFile,
  isAiAvailable,
  suggestGraphEdgesWithAi,
  type ExistingGraphPaper,
} from '../utils/graphLinkAi';
import { useUiStore } from './uiStore';
import { useKeywordGraphStore } from './keywordGraphStore';

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** fileId → 入图状态 */
  membersByFileId: Record<string, GraphMember>;
  selectedNodeId: string | null;
  buildProgress: number | null;
  loading: boolean;
  error: string | null;
  /** 正在入图的 fileId */
  joiningIds: string[];

  loadGraph: () => Promise<void>;
  /** 清除全部本地图谱数据（去掉 demo / 重建） */
  clearGraph: () => Promise<void>;
  setSelectedNode: (id: string | null) => void;
  persistNodePosition: (id: string, x: number, y: number) => Promise<void>;
  /**
   * 将文件加入图谱：检查 AI → 建节点 → 用摘要/关键词与既有图建边
   * @returns 最终入图状态
   */
  addFileToGraph: (fileId: string) => Promise<GraphMemberStatus>;
  /** 批量：导入后对新 PDF 尝试入图 */
  addFilesToGraph: (fileIds: string[]) => Promise<void>;
  /** 删除文档后：从论文图与关键词图移除 */
  removeFilesFromGraph: (fileIds: string[]) => Promise<void>;
}

function memberRecord(
  fileId: string,
  status: GraphMemberStatus,
  patch: Partial<Pick<GraphMember, 'nodeId' | 'errorMessage'>> = {},
): GraphMember {
  return {
    fileId,
    status,
    nodeId: patch.nodeId ?? null,
    errorMessage: patch.errorMessage ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  membersByFileId: {},
  selectedNodeId: null,
  buildProgress: null,
  loading: false,
  error: null,
  joiningIds: [],

  loadGraph: async () => {
    set({ loading: true, error: null });
    try {
      const [nodes, edges, members] = await Promise.all([
        graphDb.listGraphNodes(),
        graphDb.listGraphEdges(),
        graphDb.listGraphMembers(),
      ]);
      const membersByFileId: Record<string, GraphMember> = {};
      for (const m of members) membersByFileId[m.fileId] = m;
      set({ nodes, edges, membersByFileId, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '加载图谱失败',
      });
    }
  },

  clearGraph: async () => {
    await graphDb.clearGraphAll();
    await useKeywordGraphStore.getState().clearKeywordGraph();
    set({
      nodes: [],
      edges: [],
      membersByFileId: {},
      selectedNodeId: null,
      error: null,
    });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  persistNodePosition: async (id, x, y) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    const next: GraphNode = { ...node, x, y };
    await graphDb.putGraphNode(next);
    set({
      nodes: get().nodes.map((n) => (n.id === id ? next : n)),
    });
  },

  addFileToGraph: async (fileId) => {
    if (get().joiningIds.includes(fileId)) {
      return get().membersByFileId[fileId]?.status ?? 'pending';
    }
    // 已成功入图则跳过
    if (get().membersByFileId[fileId]?.status === 'in') return 'in';

    set({ joiningIds: [...get().joiningIds, fileId] });
    const pending = memberRecord(fileId, 'pending');
    await graphDb.putGraphMember(pending);
    set({
      membersByFileId: { ...get().membersByFileId, [fileId]: pending },
    });

    try {
      const ui = useUiStore.getState();
      if (!isAiAvailable(ui.aiSettings, ui.isOnline)) {
        const failed = memberRecord(fileId, 'failed', {
          errorMessage: ui.isOnline
            ? '未配置 AI，请先在设置中填写 API Key'
            : '离线状态下无法调用 AI 入图',
        });
        await graphDb.putGraphMember(failed);
        set({
          membersByFileId: { ...get().membersByFileId, [fileId]: failed },
        });
        return 'failed';
      }

      const file = await filesDb.getFile(fileId);
      if (!file || file.deletedAt || file.type === 'folder') {
        const failed = memberRecord(fileId, 'failed', {
          errorMessage: '文件不存在或不可用',
        });
        await graphDb.putGraphMember(failed);
        set({
          membersByFileId: { ...get().membersByFileId, [fileId]: failed },
        });
        return 'failed';
      }

      const meta = await metaDb.getFileDocMeta(fileId);
      const keywords = meta?.keywords ?? [];
      const abstract = meta?.abstract ?? null;
      const nodeId = graphNodeIdForFile(fileId);
      const node: GraphNode = {
        id: nodeId,
        fileId,
        label: file.name.replace(/\.[^.]+$/, '') || file.name,
        kind: 'file',
        fileType: file.type,
        x: null,
        y: null,
      };

      // 收集已有节点的摘要/关键词，供 AI 对照
      const existingNodes = get().nodes.filter((n) => n.id !== nodeId);
      const existingPayload: ExistingGraphPaper[] = [];
      for (const n of existingNodes) {
        if (!n.fileId) continue;
        const m = await metaDb.getFileDocMeta(n.fileId);
        existingPayload.push({
          nodeId: n.id,
          title: n.label,
          keywords: m?.keywords ?? [],
          abstract: m?.abstract ?? null,
        });
      }

      let newEdges: GraphEdge[] = [];
      if (existingPayload.length > 0) {
        newEdges = await suggestGraphEdgesWithAi({
          settings: ui.aiSettings,
          paper: {
            nodeId,
            fileId,
            title: node.label,
            keywords,
            abstract,
          },
          existing: existingPayload,
        });
      }

      await graphDb.putGraphNode(node);
      if (newEdges.length > 0) await graphDb.putGraphEdges(newEdges);

      const ok = memberRecord(fileId, 'in', { nodeId });
      await graphDb.putGraphMember(ok);

      // 合并内存态：节点去重，边追加
      const nodes = [
        ...get().nodes.filter((n) => n.id !== nodeId),
        node,
      ];
      const edgeKey = (e: GraphEdge) =>
        e.source < e.target
          ? `${e.source}__${e.target}`
          : `${e.target}__${e.source}`;
      const edgeMap = new Map(get().edges.map((e) => [edgeKey(e), e]));
      for (const e of newEdges) edgeMap.set(edgeKey(e), e);

      set({
        nodes,
        edges: [...edgeMap.values()],
        membersByFileId: { ...get().membersByFileId, [fileId]: ok },
      });

      // 入图成功后一并跑关键词流水线（失败不影响论文入图状态）
      void useKeywordGraphStore.getState().syncAfterPaperIn({
        paperNodeId: nodeId,
        title: node.label,
        pdfKeywords: keywords,
        abstract,
      });

      return 'in';
    } catch (e) {
      const failed = memberRecord(fileId, 'failed', {
        errorMessage: e instanceof Error ? e.message : '入图失败',
      });
      await graphDb.putGraphMember(failed);
      set({
        membersByFileId: { ...get().membersByFileId, [fileId]: failed },
      });
      return 'failed';
    } finally {
      set({
        joiningIds: get().joiningIds.filter((id) => id !== fileId),
      });
    }
  },

  addFilesToGraph: async (fileIds) => {
    for (const id of fileIds) {
      await get().addFileToGraph(id);
    }
  },

  removeFilesFromGraph: async (fileIds) => {
    if (fileIds.length === 0) return;
    const nodeIds = fileIds.map((id) => graphNodeIdForFile(id));
    const nodeIdSet = new Set(nodeIds);
    const fileIdSet = new Set(fileIds);

    await graphDb.removeFilesFromGraphDb(fileIds);
    await useKeywordGraphStore.getState().detachPapers(nodeIds);

    const membersByFileId = { ...get().membersByFileId };
    for (const fid of fileIds) delete membersByFileId[fid];

    const selected = get().selectedNodeId;
    set({
      nodes: get().nodes.filter((n) => !nodeIdSet.has(n.id)),
      edges: get().edges.filter(
        (e) => !nodeIdSet.has(e.source) && !nodeIdSet.has(e.target),
      ),
      membersByFileId,
      selectedNodeId: selected && nodeIdSet.has(selected) ? null : selected,
      joiningIds: get().joiningIds.filter((id) => !fileIdSet.has(id)),
    });
  },
}));

export type { GraphNode, GraphEdge };
