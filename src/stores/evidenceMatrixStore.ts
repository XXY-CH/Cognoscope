/**
 * evidenceMatrixStore - 跨论文证据矩阵的本地工作流状态。
 * AI 请求的 AbortController 保存在模块级 registry，Zustand 只保存可序列化身份。
 */
import { create } from 'zustand';
import * as evidenceMatricesDb from '../db/evidenceMatrices';
import * as evidenceRowsDb from '../db/evidenceRows';
import * as evidenceAnalysesDb from '../db/evidenceAnalyses';
import type {
  EvidenceAnalysis,
  EvidenceAnalysisItem,
  EvidenceMatrix,
  EvidenceRow,
  EvidenceVerificationState,
} from '../types';
import { buildEvidenceInputBundle } from '../utils/evidenceInput';
import { buildEvidenceMessages } from '../utils/evidencePrompt';
import { parseEvidenceProposals } from '../utils/evidenceParse';
import { buildEvidenceAnalysisMessages } from '../utils/evidenceAnalysisPrompt';
import { parseEvidenceAnalysis } from '../utils/evidenceAnalysisParse';
import { chatCompletion } from '../utils/aiChat';
import { createId } from '../utils/id';
import { normalizeEvidenceText } from '../utils/evidenceMatch';
import { useFileStore } from './fileStore';
import { useUiStore } from './uiStore';

type MatrixLoadStatus = 'idle' | 'loading' | 'error';

const requestControllers = new Map<string, AbortController>();
const analysisControllers = new Map<string, AbortController>();
const persistenceQueues = new Map<string, Promise<void>>();
let navigationEpoch = 0;
let matrixListEpoch = 0;

/**
 * 同一矩阵的 IndexedDB 写入按调用顺序串行化，并在真正执行时再次检查请求身份。
 * 这样取消/重试期间，已经排队但已过期的结果不会覆盖较新的状态。
 */
function enqueuePersistence(
  key: string,
  write: () => Promise<void>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const previous = persistenceQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrent()) return;
      await write();
    });
  persistenceQueues.set(key, next);
  void next
    .finally(() => {
      if (persistenceQueues.get(key) === next) persistenceQueues.delete(key);
    })
    .catch(() => undefined);
  return next;
}

function matrixPersistenceKey(matrixId: string): string {
  return `evidence-matrix:${matrixId}`;
}

function now(): string {
  return new Date().toISOString();
}

function createMatrix(fileIds: string[], comparisonQuestion = ''): EvidenceMatrix {
  const timestamp = now();
  return {
    id: createId('evidence-matrix'),
    comparisonQuestion,
    fileIds,
    extractionState: 'idle',
    extractionError: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function rowCanVerify(row: EvidenceRow): boolean {
  return row.evidence.length > 0 && row.evidence.every(
    (item) =>
      item.quotedText.trim().length > 0 &&
      item.match !== 'none' &&
      item.locator.kind !== 'unresolved',
  );
}

interface EvidenceMatrixState {
  matrices: EvidenceMatrix[];
  activeMatrix: EvidenceMatrix | null;
  rows: EvidenceRow[];
  analysis: EvidenceAnalysis | null;
  selectedFileIds: string[];
  selectedRowIds: string[];
  loadStatus: MatrixLoadStatus;
  errorMessage: string | null;
  requestId: string | null;
  analysisRequestId: string | null;
  loadMatrices: () => Promise<void>;
  create: (fileIds: string[], comparisonQuestion?: string) => Promise<string>;
  open: (matrixId: string) => Promise<void>;
  setComparisonQuestion: (question: string) => Promise<void>;
  generateProposals: () => Promise<void>;
  cancelExtraction: () => Promise<void>;
  generateAnalysis: () => Promise<void>;
  cancelAnalysis: () => Promise<void>;
  updateConclusion: (rowId: string, conclusion: string) => Promise<void>;
  updateEvidenceNote: (rowId: string, evidenceId: string, note: string) => Promise<void>;
  setVerification: (
    rowId: string,
    state: Extract<EvidenceVerificationState, 'verified' | 'disputed' | 'unresolved'>,
  ) => Promise<boolean>;
  updateAnalysisItem: (itemId: string, statement: string, rationale: string) => Promise<void>;
  setAnalysisVerification: (
    itemId: string,
    state: Extract<EvidenceVerificationState, 'verified' | 'disputed' | 'unresolved'>,
  ) => Promise<boolean>;
  toggleRowSelection: (rowId: string) => void;
  clearRowSelection: () => void;
  deleteActive: () => Promise<void>;
  clearActive: () => void;
}

export const useEvidenceMatrixStore = create<EvidenceMatrixState>((set, get) => {
  const abortPendingRequest = (): void => {
    const pendingRequestId = get().requestId;
    if (!pendingRequestId) return;
    requestControllers.get(pendingRequestId)?.abort();
    requestControllers.delete(pendingRequestId);
    set({ requestId: null });
  };

  const abortPendingAnalysis = (): void => {
    const pendingId = get().analysisRequestId;
    if (!pendingId) return;
    analysisControllers.get(pendingId)?.abort();
    analysisControllers.delete(pendingId);
    set({ analysisRequestId: null });
  };

  const markAnalysisStale = async (reason: string, rowIds?: string[]): Promise<void> => {
    const analysis = get().analysis;
    if (!analysis) return;
    const analysisId = analysis.id;
    const analysisUpdatedAt = analysis.updatedAt;
    const requestAtStart = get().analysisRequestId;
    const navigationAtStart = navigationEpoch;
    const affected = rowIds ? new Set(rowIds) : null;
    let changed = analysis.extractionState === 'extracting';
    const items = analysis.items.map((item) => {
      const referencesAffected = !affected || item.rowIds.some((rowId) => affected.has(rowId));
      if (!referencesAffected || item.verification === 'unresolved') return item;
      changed = true;
      return {
        ...item,
        verification: 'unresolved' as const,
        updatedAt: now(),
      };
    });
    if (!changed) return;
    const next: EvidenceAnalysis = {
      ...analysis,
      items,
      extractionState: analysis.extractionState === 'extracting' ? 'cancelled' : analysis.extractionState,
      extractionError: reason,
      updatedAt: now(),
    };
    const isCurrent = (): boolean =>
      get().activeMatrix?.id === analysis.matrixId &&
      get().analysis?.id === analysisId &&
      get().analysis?.updatedAt === analysisUpdatedAt &&
      get().analysisRequestId === requestAtStart &&
      navigationAtStart === navigationEpoch;
    await enqueuePersistence(
      matrixPersistenceKey(analysis.matrixId),
      () => evidenceAnalysesDb.putEvidenceAnalysis(next),
      isCurrent,
    );
    if (isCurrent()) set({ analysis: next });
  };

  const persistMatrix = async (
    matrix: EvidenceMatrix,
    isCurrent: () => boolean = () => true,
  ): Promise<void> => {
    await enqueuePersistence(
      matrixPersistenceKey(matrix.id),
      () => evidenceMatricesDb.putEvidenceMatrix(matrix),
      isCurrent,
    );
    if (!isCurrent()) return;
    set((state) => ({
      matrices: state.matrices.some((item) => item.id === matrix.id)
        ? state.matrices.map((item) => (item.id === matrix.id ? matrix : item))
        : [matrix, ...state.matrices],
      activeMatrix:
        state.activeMatrix?.id === matrix.id ? matrix : state.activeMatrix,
    }));
  };

  return {
    matrices: [],
    activeMatrix: null,
    rows: [],
    analysis: null,
    selectedFileIds: [],
    selectedRowIds: [],
    loadStatus: 'idle',
    errorMessage: null,
    requestId: null,
    analysisRequestId: null,

    loadMatrices: async () => {
      const currentMatrixListEpoch = ++matrixListEpoch;
      set({ loadStatus: 'loading', errorMessage: null });
      try {
        const matrices = await evidenceMatricesDb.listEvidenceMatrices();
        if (currentMatrixListEpoch !== matrixListEpoch) return;
        set({ matrices, loadStatus: 'idle' });
      } catch (error) {
        if (currentMatrixListEpoch !== matrixListEpoch) return;
        set({
          loadStatus: 'error',
          errorMessage: error instanceof Error ? error.message : '无法读取证据矩阵',
        });
      }
    },

    create: async (fileIds, comparisonQuestion = '') => {
      const currentNavigationEpoch = ++navigationEpoch;
      abortPendingRequest();
      abortPendingAnalysis();
      const matrix = createMatrix([...new Set(fileIds)], comparisonQuestion.trim());
      await enqueuePersistence(
        matrixPersistenceKey(matrix.id),
        () => evidenceMatricesDb.putEvidenceMatrix(matrix),
        () => currentNavigationEpoch === navigationEpoch,
      );
      if (currentNavigationEpoch !== navigationEpoch) return matrix.id;
      set((state) => ({
        matrices: [matrix, ...state.matrices.filter((item) => item.id !== matrix.id)],
        activeMatrix: matrix,
        rows: [],
        analysis: null,
        selectedFileIds: matrix.fileIds,
        selectedRowIds: [],
        requestId: null,
        analysisRequestId: null,
        errorMessage: null,
      }));
      return matrix.id;
    },

    open: async (matrixId) => {
      const currentNavigationEpoch = ++navigationEpoch;
      abortPendingRequest();
      abortPendingAnalysis();
      set({
        loadStatus: 'loading',
        errorMessage: null,
        activeMatrix: null,
        rows: [],
        analysis: null,
        requestId: null,
        analysisRequestId: null,
      });
      try {
        const [matrix, rows, analysis] = await Promise.all([
          evidenceMatricesDb.getEvidenceMatrix(matrixId),
          evidenceRowsDb.listEvidenceRowsByMatrix(matrixId),
          evidenceAnalysesDb.getEvidenceAnalysisByMatrix(matrixId),
        ]);
        if (!matrix) throw new Error('找不到该证据矩阵');
        const normalizedMatrix =
          matrix.extractionState === 'extracting'
            ? { ...matrix, extractionState: 'cancelled' as const }
            : matrix;
        if (currentNavigationEpoch !== navigationEpoch) return;
        if (normalizedMatrix !== matrix) {
          await enqueuePersistence(
            matrixPersistenceKey(normalizedMatrix.id),
            () => evidenceMatricesDb.putEvidenceMatrix(normalizedMatrix),
            () => currentNavigationEpoch === navigationEpoch,
          );
        }
        const normalizedAnalysis = analysis?.extractionState === 'extracting'
          ? {
              ...analysis,
              extractionState: 'cancelled' as const,
              extractionError: '研究分析在离开页面时被取消',
              updatedAt: now(),
            }
          : analysis;
        if (currentNavigationEpoch !== navigationEpoch) return;
        if (normalizedAnalysis && normalizedAnalysis !== analysis) {
          await enqueuePersistence(
            matrixPersistenceKey(normalizedAnalysis.matrixId),
            () => evidenceAnalysesDb.putEvidenceAnalysis(normalizedAnalysis),
            () => currentNavigationEpoch === navigationEpoch,
          );
        }
        if (currentNavigationEpoch !== navigationEpoch) return;
        set({
          activeMatrix: normalizedMatrix,
          rows,
          analysis: normalizedAnalysis ?? null,
          matrices: get().matrices.some((item) => item.id === normalizedMatrix.id)
            ? get().matrices.map((item) => (item.id === normalizedMatrix.id ? normalizedMatrix : item))
            : [normalizedMatrix, ...get().matrices],
          selectedFileIds: normalizedMatrix.fileIds,
          selectedRowIds: [],
          loadStatus: 'idle',
          errorMessage: null,
        });
      } catch (error) {
        if (currentNavigationEpoch !== navigationEpoch) return;
        set({
          loadStatus: 'error',
          errorMessage: error instanceof Error ? error.message : '无法打开证据矩阵',
        });
      }
    },

    setComparisonQuestion: async (question) => {
      const matrix = get().activeMatrix;
      if (!matrix) return;
      abortPendingRequest();
      abortPendingAnalysis();
      const next = { ...matrix, comparisonQuestion: question, updatedAt: now() };
      const currentNavigationEpoch = navigationEpoch;
      await persistMatrix(
        next,
        () =>
          currentNavigationEpoch === navigationEpoch &&
          get().activeMatrix?.id === matrix.id,
      );
      if (currentNavigationEpoch !== navigationEpoch || get().activeMatrix?.id !== matrix.id) return;
      await markAnalysisStale('比较问题已变更，请重新生成并核对研究分析');
    },

    generateProposals: async () => {
      const matrix = get().activeMatrix;
      if (!matrix) return;
      abortPendingRequest();
      abortPendingAnalysis();
      const comparisonQuestion = matrix.comparisonQuestion.trim();
      if (!comparisonQuestion) {
        set({ errorMessage: '请先填写比较问题' });
        return;
      }
      const ui = useUiStore.getState();
      if (!ui.isOnline) {
        set({ errorMessage: '当前处于离线状态，无法发起新的 AI 提取' });
        return;
      }
      if (!ui.aiSettings.apiKey.trim()) {
        set({ errorMessage: '请先在设置中填写 API Key' });
        return;
      }

      const requestId = createId('evidence-request');
      const controller = new AbortController();
      requestControllers.set(requestId, controller);
      const started = {
        ...matrix,
        extractionState: 'extracting' as const,
        extractionError: null,
        updatedAt: now(),
      };
      set({ activeMatrix: started, requestId, errorMessage: null });
      const isCurrentRequest = (): boolean =>
        get().activeMatrix?.id === matrix.id && get().requestId === requestId;

      try {
        await enqueuePersistence(
          matrixPersistenceKey(matrix.id),
          () => evidenceMatricesDb.putEvidenceMatrix(started),
          isCurrentRequest,
        );
        const requestMatrixId = matrix.id;
        const files = useFileStore
          .getState()
          .files.filter(
            (file) => matrix.fileIds.includes(file.id) && file.type !== 'folder' && file.deletedAt === null,
          );
        if (files.length !== matrix.fileIds.length) {
          throw new Error('部分来源已移入回收站或不存在，请恢复后再提取');
        }
        if (get().activeMatrix?.id !== matrix.id || get().requestId !== requestId) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const bundle = await buildEvidenceInputBundle(files, controller.signal);
        if (get().activeMatrix?.id !== requestMatrixId || get().requestId !== requestId) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const messages = buildEvidenceMessages({
          comparisonQuestion,
          bundle,
          answerLanguage: ui.aiSettings.answerLanguage,
        });
        const raw = await chatCompletion({
          settings: ui.aiSettings,
          messages,
          maxTokens: Math.min(Math.max(ui.aiSettings.maxTokens, 2048), 8192),
          signal: controller.signal,
        });
        if (get().activeMatrix?.id !== requestMatrixId || get().requestId !== requestId) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const parsed = parseEvidenceProposals({
          raw,
          sources: bundle.sources,
        });
        const parsedRows = parsed.rows.map((row) => ({
          ...row,
          matrixId: matrix.id,
        }));
        const previousRows = await evidenceRowsDb.listEvidenceRowsByMatrix(matrix.id);
        const previousVerified = previousRows.filter((row) => row.verification === 'verified');
        const previousKeys = new Set(previousVerified.map((row) => normalizeEvidenceText(row.conclusion)));
        const nextRows = [
          ...previousVerified,
          ...parsedRows.filter((row) => !previousKeys.has(normalizeEvidenceText(row.conclusion))),
        ];
        await enqueuePersistence(
          matrixPersistenceKey(matrix.id),
          async () => {
            await evidenceRowsDb.deleteEvidenceRowsByMatrix(matrix.id);
            await evidenceRowsDb.putEvidenceRows(nextRows);
          },
          isCurrentRequest,
        );
        const ready = {
          ...started,
          extractionState: 'ready' as const,
          extractionError: parsed.warnings.length > 0
            ? parsed.warnings.join('；')
            : bundle.truncated
              ? '部分本地输入已截断，请核对原文'
              : null,
          updatedAt: now(),
        };
        await enqueuePersistence(
          matrixPersistenceKey(matrix.id),
          () => evidenceMatricesDb.putEvidenceMatrix(ready),
          isCurrentRequest,
        );
        if (isCurrentRequest()) {
          set({
            activeMatrix: ready,
            rows: nextRows,
            requestId: null,
            errorMessage: null,
          });
        }
      } catch (error) {
        const aborted = isAbortError(error) || controller.signal.aborted;
        const current = get().activeMatrix;
        if (current?.id === matrix.id && get().requestId === requestId) {
          const failed = {
            ...started,
            extractionState: aborted ? ('cancelled' as const) : ('error' as const),
            extractionError: aborted
              ? '提取已取消'
              : error instanceof Error
                ? error.message
                : '证据提取失败',
            updatedAt: now(),
          };
          await enqueuePersistence(
            matrixPersistenceKey(matrix.id),
            () => evidenceMatricesDb.putEvidenceMatrix(failed),
            isCurrentRequest,
          );
          if (isCurrentRequest()) {
            set({ activeMatrix: failed, requestId: null, errorMessage: failed.extractionError });
          }
        }
      } finally {
        requestControllers.delete(requestId);
      }
    },

    generateAnalysis: async () => {
      const matrix = get().activeMatrix;
      if (!matrix) return;
      abortPendingAnalysis();
      const verifiedRows = get().rows.filter((row) => row.verification === 'verified');
      if (verifiedRows.length === 0) {
        set({ errorMessage: '请先确认至少一条证据结论，再生成研究分析' });
        return;
      }
      const ui = useUiStore.getState();
      if (!ui.isOnline) {
        set({ errorMessage: '当前处于离线状态，无法生成新的研究分析' });
        return;
      }
      if (!ui.aiSettings.apiKey.trim()) {
        set({ errorMessage: '请先在设置中填写 API Key' });
        return;
      }

      const requestId = createId('evidence-analysis-request');
      const controller = new AbortController();
      analysisControllers.set(requestId, controller);
      const timestamp = now();
      const started: EvidenceAnalysis = {
        ...(get().analysis ?? {
          id: createId('evidence-analysis'),
          matrixId: matrix.id,
          comparisonQuestion: matrix.comparisonQuestion,
          items: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
        comparisonQuestion: matrix.comparisonQuestion,
        extractionState: 'extracting',
        extractionError: null,
        updatedAt: timestamp,
      };
      set({ analysis: started, analysisRequestId: requestId, errorMessage: null });
      const isCurrentAnalysis = (): boolean =>
        get().activeMatrix?.id === matrix.id && get().analysisRequestId === requestId;

      try {
        await enqueuePersistence(
          matrixPersistenceKey(matrix.id),
          () => evidenceAnalysesDb.putEvidenceAnalysis(started),
          isCurrentAnalysis,
        );
        const files = useFileStore.getState().files.filter(
          (file) => matrix.fileIds.includes(file.id) && file.type !== 'folder' && file.deletedAt === null,
        );
        if (files.length !== matrix.fileIds.length) {
          throw new Error('部分来源已不存在，无法生成研究分析');
        }
        if (get().activeMatrix?.id !== matrix.id || get().analysisRequestId !== requestId) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const messages = buildEvidenceAnalysisMessages({
          comparisonQuestion: matrix.comparisonQuestion,
          rows: verifiedRows,
          files,
          answerLanguage: ui.aiSettings.answerLanguage,
        });
        const raw = await chatCompletion({
          settings: ui.aiSettings,
          messages,
          maxTokens: Math.min(Math.max(ui.aiSettings.maxTokens, 2048), 8192),
          signal: controller.signal,
        });
        if (get().activeMatrix?.id !== matrix.id || get().analysisRequestId !== requestId) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const parsed = parseEvidenceAnalysis({
          raw,
          rows: verifiedRows,
          analysisId: started.id,
        });
        const previousVerified = started.items.filter((item) => item.verification === 'verified');
        const previousKeys = new Set(previousVerified.map((item) => `${item.section}:${item.statement.trim().toLocaleLowerCase()}`));
        const nextItems: EvidenceAnalysisItem[] = [
          ...previousVerified,
          ...parsed.items.filter((item) => !previousKeys.has(`${item.section}:${item.statement.trim().toLocaleLowerCase()}`)),
        ];
        const ready: EvidenceAnalysis = {
          ...started,
          items: nextItems,
          extractionState: 'ready',
          extractionError: parsed.warnings.length > 0 ? parsed.warnings.join('；') : null,
          updatedAt: now(),
        };
        await enqueuePersistence(
          matrixPersistenceKey(matrix.id),
          () => evidenceAnalysesDb.putEvidenceAnalysis(ready),
          isCurrentAnalysis,
        );
        if (isCurrentAnalysis()) {
          set({ analysis: ready, analysisRequestId: null, errorMessage: null });
        }
      } catch (error) {
        const aborted = isAbortError(error) || controller.signal.aborted;
        if (get().activeMatrix?.id === matrix.id && get().analysisRequestId === requestId) {
          const failed: EvidenceAnalysis = {
            ...started,
            extractionState: aborted ? 'cancelled' : 'error',
            extractionError: aborted
              ? '研究分析已取消'
              : error instanceof Error
                ? error.message
                : '研究分析失败',
            updatedAt: now(),
          };
          await enqueuePersistence(
            matrixPersistenceKey(matrix.id),
            () => evidenceAnalysesDb.putEvidenceAnalysis(failed),
            isCurrentAnalysis,
          );
          if (isCurrentAnalysis()) {
            set({ analysis: failed, analysisRequestId: null, errorMessage: failed.extractionError });
          }
        }
      } finally {
        analysisControllers.delete(requestId);
      }
    },

    cancelAnalysis: async () => {
      const requestId = get().analysisRequestId;
      const analysis = get().analysis;
      if (!requestId || !analysis) return;
      analysisControllers.get(requestId)?.abort();
      set({ analysisRequestId: null });
      const cancelled: EvidenceAnalysis = {
        ...analysis,
        extractionState: 'cancelled',
        extractionError: '研究分析已取消',
        updatedAt: now(),
      };
      const isCancelledStateCurrent = (): boolean =>
        get().activeMatrix?.id === analysis.matrixId && get().analysisRequestId === null;
      await enqueuePersistence(
        matrixPersistenceKey(analysis.matrixId),
        () => evidenceAnalysesDb.putEvidenceAnalysis(cancelled),
        isCancelledStateCurrent,
      );
      if (isCancelledStateCurrent()) set({ analysis: cancelled, errorMessage: null });
    },

    cancelExtraction: async () => {
      const requestId = get().requestId;
      const matrix = get().activeMatrix;
      if (!requestId || !matrix) return;
      requestControllers.get(requestId)?.abort();
      set({ requestId: null });
      const cancelled = {
        ...matrix,
        extractionState: 'cancelled' as const,
        extractionError: '提取已取消',
        updatedAt: now(),
      };
      const isCancelledStateCurrent = (): boolean =>
        get().activeMatrix?.id === matrix.id && get().requestId === null;
      await enqueuePersistence(
        matrixPersistenceKey(matrix.id),
        () => evidenceMatricesDb.putEvidenceMatrix(cancelled),
        isCancelledStateCurrent,
      );
      if (isCancelledStateCurrent()) set({ activeMatrix: cancelled, errorMessage: null });
    },

    updateConclusion: async (rowId, conclusion) => {
      const row = get().rows.find((item) => item.id === rowId);
      if (!row) return;
      abortPendingRequest();
      abortPendingAnalysis();
      const currentNavigationEpoch = navigationEpoch;
      const next: EvidenceRow = {
        ...row,
        conclusion,
        verification:
          row.verification === 'verified' ||
          row.verification === 'proposed' ||
          row.verification === 'disputed'
            ? 'edited'
            : row.verification,
        updatedAt: now(),
      };
      const isCurrent = (): boolean =>
        currentNavigationEpoch === navigationEpoch && get().activeMatrix?.id === row.matrixId;
      await enqueuePersistence(
        matrixPersistenceKey(row.matrixId),
        () => evidenceRowsDb.putEvidenceRow(next),
        isCurrent,
      );
      if (isCurrent()) {
        set({ rows: get().rows.map((item) => (item.id === rowId ? next : item)) });
      }
      if (!isCurrent()) return;
      await markAnalysisStale('矩阵行已编辑，请重新核对引用它的研究分析', [rowId]);
    },

    updateEvidenceNote: async (rowId, evidenceId, note) => {
      const row = get().rows.find((item) => item.id === rowId);
      if (!row) return;
      abortPendingRequest();
      abortPendingAnalysis();
      const currentNavigationEpoch = navigationEpoch;
      const next: EvidenceRow = {
        ...row,
        evidence: row.evidence.map((item) => (item.id === evidenceId ? { ...item, note } : item)),
        verification:
          row.verification === 'verified' ||
          row.verification === 'proposed' ||
          row.verification === 'disputed'
            ? 'edited'
            : row.verification,
        updatedAt: now(),
      };
      const isCurrent = (): boolean =>
        currentNavigationEpoch === navigationEpoch && get().activeMatrix?.id === row.matrixId;
      await enqueuePersistence(
        matrixPersistenceKey(row.matrixId),
        () => evidenceRowsDb.putEvidenceRow(next),
        isCurrent,
      );
      if (isCurrent()) {
        set({ rows: get().rows.map((item) => (item.id === rowId ? next : item)) });
      }
      if (!isCurrent()) return;
      await markAnalysisStale('证据备注已编辑，请重新核对引用它的研究分析', [rowId]);
    },

    setVerification: async (rowId, state) => {
      const row = get().rows.find((item) => item.id === rowId);
      if (!row) return false;
      abortPendingRequest();
      abortPendingAnalysis();
      const currentNavigationEpoch = navigationEpoch;
      if (state === 'verified' && !rowCanVerify(row)) {
        set({ errorMessage: '该行的摘录或定位尚未通过本地证据核对' });
        return false;
      }
      const next = { ...row, verification: state, updatedAt: now() };
      const nextEvidence = next.evidence.map((item) => ({
        ...item,
        verification: state,
      }));
      const persisted = { ...next, evidence: nextEvidence };
      const isCurrent = (): boolean =>
        currentNavigationEpoch === navigationEpoch && get().activeMatrix?.id === row.matrixId;
      await enqueuePersistence(
        matrixPersistenceKey(row.matrixId),
        () => evidenceRowsDb.putEvidenceRow(persisted),
        isCurrent,
      );
      if (isCurrent()) {
        set({ rows: get().rows.map((item) => (item.id === rowId ? persisted : item)), errorMessage: null });
      }
      if (!isCurrent()) return false;
      await markAnalysisStale('矩阵行状态已变更，请重新核对引用它的研究分析', [rowId]);
      return true;
    },

    updateAnalysisItem: async (itemId, statement, rationale) => {
      const analysis = get().analysis;
      const item = analysis?.items.find((candidate) => candidate.id === itemId);
      if (!analysis || !item) return;
      abortPendingAnalysis();
      const currentNavigationEpoch = navigationEpoch;
      const nextItem: EvidenceAnalysisItem = {
        ...item,
        statement: statement.trim(),
        rationale: rationale.trim(),
        verification:
          item.verification === 'verified' || item.verification === 'proposed' || item.verification === 'disputed'
            ? 'edited'
            : item.verification,
        updatedAt: now(),
      };
      const next = { ...analysis, items: analysis.items.map((candidate) => candidate.id === itemId ? nextItem : candidate), updatedAt: now() };
      const isCurrent = (): boolean =>
        currentNavigationEpoch === navigationEpoch &&
        get().activeMatrix?.id === analysis.matrixId &&
        get().analysis?.id === analysis.id;
      await enqueuePersistence(
        matrixPersistenceKey(analysis.matrixId),
        () => evidenceAnalysesDb.putEvidenceAnalysis(next),
        isCurrent,
      );
      if (isCurrent()) {
        set({ analysis: next });
      }
    },

    setAnalysisVerification: async (itemId, state) => {
      const analysis = get().analysis;
      const item = analysis?.items.find((candidate) => candidate.id === itemId);
      if (!analysis || !item) return false;
      abortPendingAnalysis();
      const currentNavigationEpoch = navigationEpoch;
      if (state === 'verified') {
        const rowIds = new Set(get().rows.filter((row) => row.verification === 'verified').map((row) => row.id));
        if (item.rowIds.length === 0 || item.rowIds.some((rowId) => !rowIds.has(rowId))) {
          set({ errorMessage: '该分析项缺少有效的已确认矩阵行引用' });
          return false;
        }
      }
      const nextItem = { ...item, verification: state, updatedAt: now() };
      const next = { ...analysis, items: analysis.items.map((candidate) => candidate.id === itemId ? nextItem : candidate), updatedAt: now() };
      const isCurrent = (): boolean =>
        currentNavigationEpoch === navigationEpoch &&
        get().activeMatrix?.id === analysis.matrixId &&
        get().analysis?.id === analysis.id;
      await enqueuePersistence(
        matrixPersistenceKey(analysis.matrixId),
        () => evidenceAnalysesDb.putEvidenceAnalysis(next),
        isCurrent,
      );
      if (isCurrent()) {
        set({ analysis: next, errorMessage: null });
      }
      return true;
    },

    toggleRowSelection: (rowId) => {
      const current = get().selectedRowIds;
      set({
        selectedRowIds: current.includes(rowId)
          ? current.filter((id) => id !== rowId)
          : [...current, rowId],
      });
    },

    clearRowSelection: () => set({ selectedRowIds: [] }),

    deleteActive: async () => {
      const matrix = get().activeMatrix;
      if (!matrix) return;
      const currentNavigationEpoch = ++navigationEpoch;
      abortPendingRequest();
      abortPendingAnalysis();
      await enqueuePersistence(
        matrixPersistenceKey(matrix.id),
        () => evidenceMatricesDb.deleteEvidenceMatrix(matrix.id),
        () => currentNavigationEpoch === navigationEpoch,
      );
      if (currentNavigationEpoch !== navigationEpoch) return;
      set((state) => ({
        matrices: state.matrices.filter((item) => item.id !== matrix.id),
        activeMatrix: null,
        rows: [],
        analysis: null,
        selectedRowIds: [],
        requestId: null,
      }));
    },

    clearActive: () => {
      navigationEpoch += 1;
      abortPendingRequest();
      abortPendingAnalysis();
      set({ activeMatrix: null, rows: [], analysis: null, selectedRowIds: [], requestId: null, analysisRequestId: null });
    },
  };
});
