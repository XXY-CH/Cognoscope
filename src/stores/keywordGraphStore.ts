/**
 * keywordGraphStore - 关键词图谱状态与入图后流水线
 * 所属：C · 知识图谱 > 关键词画布
 * 规格：docs/interviews/keyword-graph-2026-07-30/_summary.md
 */
import { create } from 'zustand';
import * as kwDb from '../db/keywordGraph';
import type { KeywordEdge, KeywordNode } from '../types';
import {
  MAX_KEYWORDS_PER_PAPER,
  buildCoOccurrenceEdges,
  generateKeywordsFromAbstract,
  keywordIdFromLabel,
  mergeKeywordClusters,
  mergeKeywordEdges,
  normalizeKeywordKey,
  selectClustersForPaper,
  suggestKeywordEdgesWithAi,
  takeUniqueKeywords,
} from '../utils/keywordGraphAi';
import { useUiStore } from './uiStore';

/** 串行化关键词同步，避免并行入图互相覆盖内存态 */
let keywordSyncChain: Promise<void> = Promise.resolve();
/** 队列中尚未结束的同步次数（用于准确显示 syncing） */
let keywordSyncInFlight = 0;

interface KeywordGraphState {
  nodes: KeywordNode[];
  edges: KeywordEdge[];
  selectedKeywordId: string | null;
  /** 联动高亮（来自点论文或点词） */
  highlightedKeywordIds: string[];
  loading: boolean;
  syncing: boolean;
  error: string | null;

  loadKeywordGraph: () => Promise<void>;
  clearKeywordGraph: () => Promise<void>;
  setSelectedKeyword: (id: string | null) => void;
  setHighlightedKeywords: (ids: string[]) => void;
  persistKeywordPosition: (id: string, x: number, y: number) => Promise<void>;
  /** 论文离开图谱时摘除挂接并清理孤儿词节点 */
  detachPapers: (paperNodeIds: string[]) => Promise<void>;
  /**
   * 论文入图成功后：补词（≤5）→ 近义合并 → 挂接 → 共现边 + AI 语义边
   */
  syncAfterPaperIn: (input: {
    paperNodeId: string;
    title: string;
    pdfKeywords: string[];
    abstract: string | null;
  }) => Promise<void>;
}

export const useKeywordGraphStore = create<KeywordGraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedKeywordId: null,
  highlightedKeywordIds: [],
  loading: false,
  syncing: false,
  error: null,

  loadKeywordGraph: async () => {
    set({ loading: true, error: null });
    try {
      const [nodes, edges] = await Promise.all([
        kwDb.listKeywordNodes(),
        kwDb.listKeywordEdges(),
      ]);
      set({ nodes, edges, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '加载关键词图谱失败',
      });
    }
  },

  clearKeywordGraph: async () => {
    await kwDb.clearKeywordGraph();
    set({
      nodes: [],
      edges: [],
      selectedKeywordId: null,
      highlightedKeywordIds: [],
      error: null,
    });
  },

  setSelectedKeyword: (id) => set({ selectedKeywordId: id }),

  setHighlightedKeywords: (ids) => set({ highlightedKeywordIds: ids }),

  persistKeywordPosition: async (id, x, y) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    const next: KeywordNode = { ...node, x, y };
    await kwDb.putKeywordNode(next);
    set({
      nodes: get().nodes.map((n) => (n.id === id ? next : n)),
    });
  },

  detachPapers: async (paperNodeIds) => {
    if (paperNodeIds.length === 0) return;
    const { nodes, edges } = await kwDb.detachPapersFromKeywords(paperNodeIds);
    const selected = get().selectedKeywordId;
    set({
      nodes,
      edges,
      selectedKeywordId:
        selected && nodes.some((n) => n.id === selected) ? selected : null,
      highlightedKeywordIds: get().highlightedKeywordIds.filter((id) =>
        nodes.some((n) => n.id === id),
      ),
    });
  },

  syncAfterPaperIn: ({ paperNodeId, title, pdfKeywords, abstract }) => {
    // 排队执行：后一篇等前一篇写完再读 IDB，防止旧词被 stale set 冲掉
    const run = async () => {
      const ui = useUiStore.getState();
      keywordSyncInFlight += 1;
      set({ syncing: true, error: null });
      try {
        // 以 IndexedDB 为权威源，不依赖可能过期的内存快照
        const [existingBefore, existingEdges] = await Promise.all([
          kwDb.listKeywordNodes(),
          kwDb.listKeywordEdges(),
        ]);
        const existingIdsBefore = existingBefore.map((n) => n.id);

        // 原文词先截断，保证单篇最终 ≤5
        const pdfLimited = takeUniqueKeywords(
          pdfKeywords,
          MAX_KEYWORDS_PER_PAPER,
        );
        const remainingSlots = MAX_KEYWORDS_PER_PAPER - pdfLimited.length;

        const aiKeywords =
          remainingSlots > 0
            ? await generateKeywordsFromAbstract({
                settings: ui.aiSettings,
                title,
                abstract,
                existingPdfKeywords: pdfLimited,
                maxCount: remainingSlots,
              })
            : [];

        const merged = await mergeKeywordClusters({
          settings: ui.aiSettings,
          pdfKeywords: pdfLimited,
          aiKeywords,
          existing: existingBefore,
        });
        // 近义合并后仍可能超限，原文优先再截断
        const clusters = selectClustersForPaper(
          merged,
          pdfLimited,
          MAX_KEYWORDS_PER_PAPER,
        );

        if (clusters.length === 0) {
          set({
            nodes: existingBefore,
            edges: existingEdges,
            syncing: keywordSyncInFlight > 1,
          });
          return;
        }

        const byId = new Map(existingBefore.map((n) => [n.id, { ...n }]));
        const touchedIds: string[] = [];

        for (const c of clusters) {
          const id = c.existingId ?? keywordIdFromLabel(c.label);
          const prev = byId.get(id);
          if (prev) {
            const paperSet = new Set(prev.paperNodeIds);
            paperSet.add(paperNodeId);
            const aliasSet = new Set(prev.aliases);
            for (const a of c.aliases) {
              if (normalizeKeywordKey(a) !== normalizeKeywordKey(prev.label)) {
                aliasSet.add(a);
              }
            }
            // 原文优先：若本簇 label 来自 PDF 且与旧 label 不同，升为展示名
            const pdfPrefer =
              pdfLimited.some(
                (p) => normalizeKeywordKey(p) === normalizeKeywordKey(c.label),
              ) &&
              normalizeKeywordKey(c.label) !== normalizeKeywordKey(prev.label);
            if (pdfPrefer) {
              aliasSet.add(prev.label);
              aliasSet.delete(c.label);
            }
            const next: KeywordNode = {
              ...prev,
              label: pdfPrefer ? c.label : prev.label,
              aliases: [...aliasSet],
              paperNodeIds: [...paperSet],
            };
            byId.set(id, next);
            touchedIds.push(id);
          } else {
            const node: KeywordNode = {
              id,
              label: c.label,
              aliases: c.aliases,
              paperNodeIds: [paperNodeId],
              x: null,
              y: null,
            };
            byId.set(id, node);
            touchedIds.push(id);
          }
        }

        const upserts = touchedIds.map((id) => byId.get(id)!);
        await kwDb.putKeywordNodes(upserts);

        // 先本地共现建边（同篇 ≥2 词即有边，不依赖 AI / 不要求已有旧词）
        const kwSnapshot = [...byId.values()].map((n) => ({
          id: n.id,
          label: n.label,
          paperNodeIds: n.paperNodeIds,
        }));
        const byIdForEdges = new Map(
          kwSnapshot.map((n) => [
            n.id,
            { id: n.id, paperNodeIds: n.paperNodeIds },
          ]),
        );
        const coEdges = buildCoOccurrenceEdges({
          keywordsById: byIdForEdges,
          currentPaperKeywordIds: touchedIds,
          existingKeywordIds: existingIdsBefore,
        });

        // 再请 AI 打语义分并与共现综合；失败则保留共现边
        let aiEdges: KeywordEdge[] = [];
        try {
          aiEdges = await suggestKeywordEdgesWithAi({
            settings: ui.aiSettings,
            keywords: kwSnapshot,
            currentPaperKeywordIds: touchedIds,
            existingKeywordIds: existingIdsBefore,
            currentPaperTitle: title,
          });
        } catch {
          // 语义失败不阻断：共现边已足够形成联系
          aiEdges = [];
        }

        const newEdges = mergeKeywordEdges(coEdges, aiEdges);
        if (newEdges.length > 0) await kwDb.putKeywordEdges(newEdges);

        // 写完后从 IDB 全量回读，保证 UI 与持久化一致、旧词不丢
        const [nodes, edges] = await Promise.all([
          kwDb.listKeywordNodes(),
          kwDb.listKeywordEdges(),
        ]);
        set({
          nodes,
          edges,
          syncing: keywordSyncInFlight > 1,
        });
      } catch (e) {
        // 关键词失败不回滚论文入图；仅记录错误
        set({
          syncing: keywordSyncInFlight > 1,
          error: e instanceof Error ? e.message : '关键词图谱同步失败',
        });
      } finally {
        keywordSyncInFlight = Math.max(0, keywordSyncInFlight - 1);
        if (keywordSyncInFlight === 0 && get().syncing) {
          set({ syncing: false });
        }
      }
    };

    const queued = keywordSyncChain.then(run, run);
    // 链不断开：单次失败也不阻塞后续入图同步
    keywordSyncChain = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  },
}));
