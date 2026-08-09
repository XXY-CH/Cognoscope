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
import { toast } from './toastStore';

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
   * 将文件加入图谱：先校验并持久化节点/成员，再尽力用摘要/关键词增强；
   * AI 关系与关键词增强失败时仍保留论文节点。
   * @returns 最终入图状态
   */
  addFileToGraph: (fileId: string) => Promise<GraphMemberStatus>;
  /** 对已入图但尚未完成增强的论文重试 AI 关联/关键词流水线。 */
  retryGraphEnrichment: (fileId: string) => Promise<GraphMemberStatus>;
  /** 批量：导入后对新 PDF 尝试入图 */
  addFilesToGraph: (fileIds: string[]) => Promise<void>;
  /** 删除文档后：从论文图与关键词图移除 */
  removeFilesFromGraph: (fileIds: string[]) => Promise<void>;
}

interface GraphJoinOperationController {
  begin: (fileId: string) => number;
  isCurrent: (fileId: string, token: number) => boolean;
  finish: (fileId: string, token: number) => void;
  invalidateMany: (fileIds: string[]) => void;
  invalidateAll: () => void;
}

function createGraphJoinOperationController(): GraphJoinOperationController {
  let seq = 0;
  const activeTokens = new Map<string, number>();

  return {
    begin: (fileId) => {
      const token = ++seq;
      activeTokens.set(fileId, token);
      return token;
    },
    isCurrent: (fileId, token) => activeTokens.get(fileId) === token,
    finish: (fileId, token) => {
      if (activeTokens.get(fileId) === token) activeTokens.delete(fileId);
    },
    invalidateMany: (fileIds) => {
      for (const fileId of fileIds) activeTokens.delete(fileId);
    },
    invalidateAll: () => {
      activeTokens.clear();
    },
  };
}

const graphJoinOperationController = createGraphJoinOperationController();

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

export const useGraphStore = create<GraphState>((set, get) => {
  const finishJoinOperation = async (
    fileId: string,
    node: GraphNode,
    operationToken: number,
    notify: boolean,
  ): Promise<GraphMemberStatus> => {
    const isCurrent = () =>
      graphJoinOperationController.isCurrent(fileId, operationToken);
    const updateMember = async (errorMessage: string | null) => {
      if (!isCurrent()) return false;
      const next = memberRecord(fileId, 'in', {
        nodeId: node.id,
        errorMessage,
      });
      await graphDb.putGraphMember(next);
      if (!isCurrent()) return false;
      set((state) => ({
        membersByFileId: {
          ...state.membersByFileId,
          [fileId]: next,
        },
      }));
      return true;
    };

    if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';

    const ui = useUiStore.getState();
    const aiAvailable = isAiAvailable(ui.aiSettings, ui.isOnline);
    if (!aiAvailable) {
      const message = ui.isOnline
        ? '未配置 AI，关联与关键词增强未运行，请稍后重试'
        : '当前离线，关联与关键词增强未运行，请联网后重试';
      await updateMember(message);
      if (notify) toast.warning(`论文已加入图谱，${message}`);
      return get().membersByFileId[fileId]?.status ?? 'in';
    }

    let keywords: string[] = [];
    let abstract: string | null = null;
    try {
      const meta = await metaDb.getFileDocMeta(fileId);
      keywords = meta?.keywords ?? [];
      abstract = meta?.abstract ?? null;
    } catch {
      const message = '文档元数据暂不可用，关联与关键词增强未运行，请稍后重试';
      await updateMember(message);
      if (notify) toast.warning(`论文已加入图谱，${message}`);
      return get().membersByFileId[fileId]?.status ?? 'in';
    }

    let enrichmentIssue: string | null = null;
    try {
      if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';
      const existingNodes = get().nodes.filter((n) => n.id !== node.id);
      const existingPayload: ExistingGraphPaper[] = [];
      for (const existingNode of existingNodes) {
        if (!existingNode.fileId) continue;
        if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';
        const meta = await metaDb.getFileDocMeta(existingNode.fileId);
        existingPayload.push({
          nodeId: existingNode.id,
          title: existingNode.label,
          keywords: meta?.keywords ?? [],
          abstract: meta?.abstract ?? null,
        });
      }

      let newEdges: GraphEdge[] = [];
      if (existingPayload.length > 0) {
        try {
          newEdges = await suggestGraphEdgesWithAi({
            settings: ui.aiSettings,
            paper: {
              nodeId: node.id,
              fileId,
              title: node.label,
              keywords,
              abstract,
            },
            existing: existingPayload,
          });
        } catch {
          enrichmentIssue = 'AI 关联分析暂不可用，可稍后重试';
        }
      }

      if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';
      if (newEdges.length > 0) await graphDb.putGraphEdges(newEdges);
      if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';

      const edgeKey = (edge: GraphEdge) =>
        edge.source < edge.target
          ? `${edge.source}__${edge.target}`
          : `${edge.target}__${edge.source}`;
      const edgeMap = new Map(get().edges.map((edge) => [edgeKey(edge), edge]));
      for (const edge of newEdges) edgeMap.set(edgeKey(edge), edge);
      set((state) =>
        isCurrent()
          ? {
              edges: [...edgeMap.values()],
            }
          : state,
      );
    } catch {
      enrichmentIssue = 'AI 关联分析暂不可用，可稍后重试';
    }

    if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';

    await useKeywordGraphStore.getState().syncAfterPaperIn({
      paperNodeId: node.id,
      title: node.label,
      pdfKeywords: keywords,
      abstract,
      shouldContinue: isCurrent,
    });
    if (!isCurrent()) return get().membersByFileId[fileId]?.status ?? 'out';

    const keywordError = useKeywordGraphStore.getState().error;
    if (!enrichmentIssue && keywordError) {
      enrichmentIssue = '关键词增强暂不可用，可稍后重试';
    }
    if (enrichmentIssue) {
      await updateMember(enrichmentIssue);
      if (notify) toast.warning(`论文已加入图谱，${enrichmentIssue}`);
    } else {
      await updateMember(null);
    }
    return get().membersByFileId[fileId]?.status ?? 'in';
  };

  const beginEnrichment = async (
    fileId: string,
    node: GraphNode,
    notify: boolean,
  ): Promise<GraphMemberStatus> => {
    const operationToken = graphJoinOperationController.begin(fileId);
    set({ joiningIds: [...get().joiningIds, fileId] });
    try {
      return await finishJoinOperation(fileId, node, operationToken, notify);
    } catch (error) {
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      const message =
        error instanceof Error ? error.message : '关联与关键词增强失败，请稍后重试';
      const current = get().membersByFileId[fileId];
      if (current?.status === 'in') {
        const next = memberRecord(fileId, 'in', {
          nodeId: node.id,
          errorMessage: message,
        });
        await graphDb.putGraphMember(next);
        if (graphJoinOperationController.isCurrent(fileId, operationToken)) {
          set((state) => ({
            membersByFileId: {
              ...state.membersByFileId,
              [fileId]: next,
            },
          }));
        }
      }
      return get().membersByFileId[fileId]?.status ?? 'in';
    } finally {
      const isCurrent = graphJoinOperationController.isCurrent(
        fileId,
        operationToken,
      );
      if (isCurrent) {
        graphJoinOperationController.finish(fileId, operationToken);
        set((state) => ({
          joiningIds: state.joiningIds.filter((id) => id !== fileId),
        }));
      }
    }
  };

  return {
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
    graphJoinOperationController.invalidateAll();
    await graphDb.clearGraphAll();
    await useKeywordGraphStore.getState().clearKeywordGraph();
    set({
      nodes: [],
      edges: [],
      membersByFileId: {},
      selectedNodeId: null,
      error: null,
      joiningIds: [],
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
    if (get().membersByFileId[fileId]?.status === 'in') return 'in';

    const operationToken = graphJoinOperationController.begin(fileId);
    set({ joiningIds: [...get().joiningIds, fileId] });
    try {
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      const pending = memberRecord(fileId, 'pending');
      await graphDb.putGraphMember(pending);
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      set((state) => ({
        membersByFileId: { ...state.membersByFileId, [fileId]: pending },
      }));

      const file = await filesDb.getFile(fileId);
      if (!file || file.deletedAt || file.type === 'folder') {
        const failed = memberRecord(fileId, 'failed', {
          errorMessage: '文件不存在或不可用',
        });
        if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
          return get().membersByFileId[fileId]?.status ?? 'out';
        }
        await graphDb.putGraphMember(failed);
        if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
          return get().membersByFileId[fileId]?.status ?? 'out';
        }
        set((state) => ({
          membersByFileId: { ...state.membersByFileId, [fileId]: failed },
        }));
        return 'failed';
      }
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }

      const node: GraphNode = {
        id: graphNodeIdForFile(fileId),
        fileId,
        label: file.name.replace(/\.[^.]+$/, '') || file.name,
        kind: 'file',
        fileType: file.type,
        x: null,
        y: null,
      };
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      await graphDb.putGraphNode(node);
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      const ok = memberRecord(fileId, 'in', { nodeId: node.id });
      await graphDb.putGraphMember(ok);
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      set((state) => ({
        nodes: [...state.nodes.filter((n) => n.id !== node.id), node],
        membersByFileId: { ...state.membersByFileId, [fileId]: ok },
      }));

      return await finishJoinOperation(fileId, node, operationToken, true);
    } catch (error) {
      if (!graphJoinOperationController.isCurrent(fileId, operationToken)) {
        return get().membersByFileId[fileId]?.status ?? 'out';
      }
      const failed = memberRecord(fileId, 'failed', {
        errorMessage: error instanceof Error ? error.message : '入图失败',
      });
      await graphDb.putGraphMember(failed);
      if (graphJoinOperationController.isCurrent(fileId, operationToken)) {
        set((state) => ({
          membersByFileId: { ...state.membersByFileId, [fileId]: failed },
        }));
      }
      return 'failed';
    } finally {
      const isCurrent = graphJoinOperationController.isCurrent(
        fileId,
        operationToken,
      );
      if (isCurrent) {
        graphJoinOperationController.finish(fileId, operationToken);
        set((state) => ({
          joiningIds: state.joiningIds.filter((id) => id !== fileId),
        }));
      }
    }
  },

  retryGraphEnrichment: async (fileId) => {
    if (get().joiningIds.includes(fileId)) {
      return get().membersByFileId[fileId]?.status ?? 'pending';
    }
    const member = get().membersByFileId[fileId];
    if (!member || member.status !== 'in' || !member.nodeId) {
      return member?.status ?? 'out';
    }
    let node = get().nodes.find((candidate) => candidate.id === member.nodeId);
    if (!node) {
      const nodes = await graphDb.listGraphNodes();
      node = nodes.find((candidate) => candidate.id === member.nodeId);
    }
    if (!node || node.fileId !== fileId) {
      return 'in';
    }
    return beginEnrichment(fileId, node, false);
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

    graphJoinOperationController.invalidateMany(fileIds);
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
  };
});

export type { GraphNode, GraphEdge };
export { createGraphJoinOperationController };
