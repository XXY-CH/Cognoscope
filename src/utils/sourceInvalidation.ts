/**
 * sourceInvalidation - 将来源失效传播到所有引用它的研究记录。
 * 这是纯数据变换；数据库事务由 db/sourceInvalidation.ts 负责。
 */
import type {
  EvidenceAnalysis,
  EvidenceRow,
  FileNode,
  ResearchLead,
  ResearchSignal,
  ResearchSourceReference,
} from '../types';
import { isCitationReadyEvidenceRow } from './evidenceCitation';
import { isResolvableLocator } from './graphEvidence';

export interface SourceInvalidationInput {
  fileIds: string[];
  invalidatedRowIds?: string[];
  rows: EvidenceRow[];
  analyses: EvidenceAnalysis[];
  signals: ResearchSignal[];
  leads: ResearchLead[];
  timestamp?: string;
}

export interface SourceInvalidationResult {
  rows: EvidenceRow[];
  analyses: EvidenceAnalysis[];
  signals: ResearchSignal[];
  leads: ResearchLead[];
  invalidatedRowIds: string[];
  changedAnalysisIds: string[];
  changedSignalIds: string[];
  changedLeadIds: string[];
}

const INVALIDATION_REASON = '引用所依赖的来源或证据行已失效，请重新核对';

function changed<T extends { id: string }>(before: T, after: T): boolean {
  return before !== after;
}

/** 只降级真正引用失效行的分析项，不扩大到同一矩阵的无关分析。 */
export function reconcileEvidenceAnalysisForRows(
  analysis: EvidenceAnalysis,
  invalidatedRowIds: Iterable<string>,
  timestamp = new Date().toISOString(),
): EvidenceAnalysis {
  const invalidated = new Set(invalidatedRowIds);
  let itemChanged = false;
  const items = analysis.items.map((item) => {
    if (
      !item.rowIds.some((rowId) => invalidated.has(rowId)) ||
      item.verification === 'unresolved'
    ) {
      return item;
    }
    itemChanged = true;
    return {
      ...item,
      verification: 'unresolved' as const,
      updatedAt: timestamp,
    };
  });
  if (!itemChanged) return analysis;
  return {
    ...analysis,
    items,
    extractionError: INVALIDATION_REASON,
    updatedAt: timestamp,
  };
}

/**
 * 将软删除来源的失效状态传播到派生记录；不会删除任何记录，也不会恢复核验状态。
 */
export function reconcileSourceRecords(
  input: SourceInvalidationInput,
): SourceInvalidationResult {
  const fileIds = new Set(input.fileIds.filter(Boolean));
  const invalidatedRowIds = new Set(input.invalidatedRowIds?.filter(Boolean));
  if (fileIds.size === 0 && invalidatedRowIds.size === 0) {
    return {
      rows: input.rows,
      analyses: input.analyses,
      signals: input.signals,
      leads: input.leads,
      invalidatedRowIds: [],
      changedAnalysisIds: [],
      changedSignalIds: [],
      changedLeadIds: [],
    };
  }

  const timestamp = input.timestamp ?? new Date().toISOString();
  const rows = input.rows.map((row) => {
    const itemInvalid = row.evidence.some((item) => fileIds.has(item.fileId));
    if (!itemInvalid) return row;
    invalidatedRowIds.add(row.id);
    let rowChanged = row.verification !== 'unresolved';
    const evidence = row.evidence.map((item) => {
      if (!fileIds.has(item.fileId) || item.verification === 'unresolved') {
        return item;
      }
      rowChanged = true;
      return { ...item, verification: 'unresolved' as const };
    });
    if (!rowChanged) return row;
    return {
      ...row,
      evidence,
      verification: 'unresolved' as const,
      updatedAt: timestamp,
    };
  });

  const analyses = input.analyses.map((analysis) => {
    return reconcileEvidenceAnalysisForRows(analysis, invalidatedRowIds, timestamp);
  });

  const signals = input.signals.map((signal) => {
    if (
      signal.status === 'stale' ||
      !signal.sourceRefs.some(
        (ref) =>
          fileIds.has(ref.fileId) ||
          ref.rowIds.some((rowId) => invalidatedRowIds.has(rowId)),
      )
    ) {
      return signal;
    }
    return { ...signal, status: 'stale' as const, updatedAt: timestamp };
  });
  const staleSignalIds = new Set(
    signals.filter((signal) => signal.status === 'stale').map((signal) => signal.id),
  );

  const leads = input.leads.map((lead) => {
    const sourceInvalid =
      lead.fileIds.some((fileId) => fileIds.has(fileId)) ||
      lead.sourceRefs.some((ref) => fileIds.has(ref.fileId)) ||
      lead.rowIds.some((rowId) => invalidatedRowIds.has(rowId)) ||
      lead.signalIds.some((signalId) => staleSignalIds.has(signalId));
    if (!sourceInvalid || lead.status === 'stale') return lead;
    return { ...lead, status: 'stale' as const, updatedAt: timestamp };
  });

  return {
    rows,
    analyses,
    signals,
    leads,
    invalidatedRowIds: [...invalidatedRowIds],
    changedAnalysisIds: analyses
      .filter((analysis, index) => changed(input.analyses[index], analysis))
      .map((analysis) => analysis.id),
    changedSignalIds: signals
      .filter((signal, index) => changed(input.signals[index], signal))
      .map((signal) => signal.id),
    changedLeadIds: leads
      .filter((lead, index) => changed(input.leads[index], lead))
      .map((lead) => lead.id),
  };
}

/**
 * 找出一行中无法再回读的来源；数据库写入也使用它，抵御跨标签页的旧结果写回。
 */
export function unavailableSourceIdsForRow(
  row: EvidenceRow,
  files: FileNode[],
): string[] {
  const fileById = new Map(files.map((file) => [file.id, file]));
  return [
    ...new Set(
      row.evidence
        .filter((item) => {
          const file = fileById.get(item.fileId);
          return (
            !file ||
            file.deletedAt !== null ||
            file.type === 'folder' ||
            !isResolvableLocator(item.locator, file.type)
          );
        })
        .map((item) => item.fileId),
    ),
  ];
}

/** 检查不经过矩阵行的研究来源引用，避免直接 locator 旧写入复活。 */
export function unavailableSourceIdsForReferences(
  references: ResearchSourceReference[],
  files: FileNode[],
): string[] {
  const fileById = new Map(files.map((file) => [file.id, file]));
  return [
    ...new Set(
      references
        .filter((reference) => {
          const file = fileById.get(reference.fileId);
          return (
            !file ||
            file.deletedAt !== null ||
            file.type === 'folder' ||
            (reference.locator !== null &&
              !isResolvableLocator(reference.locator, file.type))
          );
        })
        .map((reference) => reference.fileId),
    ),
  ];
}

/** 当前快照中不能继续支撑引用的行，供间接信号/线索写入防止旧状态复活。 */
export function nonCitationReadyRowIds(
  rows: EvidenceRow[],
  files: FileNode[],
): string[] {
  return rows
    .filter((row) => !isCitationReadyEvidenceRow(row, files))
    .map((row) => row.id);
}

/** 按当前文件快照撤销一行的 citation-ready 状态；无失效来源时保持原对象。 */
export function reconcileEvidenceRowForFiles(
  row: EvidenceRow,
  files: FileNode[],
  timestamp?: string,
): EvidenceRow {
  const unavailable = unavailableSourceIdsForRow(row, files);
  if (unavailable.length === 0) return row;
  return (
    reconcileSourceRecords({
      fileIds: unavailable,
      rows: [row],
      analyses: [],
      signals: [],
      leads: [],
      timestamp,
    }).rows[0] ?? row
  );
}
