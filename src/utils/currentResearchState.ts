/**
 * currentResearchState - 将已有本地事实组合为“当前研究状态”快照。
 * 该模块只做纯聚合，不创建新的事实源，也不把 AI 推断伪装成已确认内容。
 */
import type {
  EvidenceAnalysis,
  EvidenceMatrix,
  EvidenceRow,
  FileNode,
  GraphNode,
  ReadingSession,
  ResearchDigest,
  ResearchLead,
  ResearchSignal,
} from '../types';
import { isCitationReadyEvidenceRow } from './evidenceCitation';
import { isResolvableLocator } from './graphEvidence';

export interface CurrentResearchStateInput {
  files: FileNode[];
  sessions: ReadingSession[];
  matrices: EvidenceMatrix[];
  rows: EvidenceRow[];
  analyses: EvidenceAnalysis[];
  graphNodes: GraphNode[];
  digests: ResearchDigest[];
  leads: ResearchLead[];
  signals: ResearchSignal[];
  now?: number;
}

export interface CurrentResearchSession {
  session: ReadingSession;
  file: FileNode;
}

export interface CurrentResearchStateSnapshot {
  active: CurrentResearchSession | null;
  recentSessions: CurrentResearchSession[];
  activeFiles: FileNode[];
  matrixCount: number;
  graphNodeCount: number;
  analysisCount: number;
  pendingRowCount: number;
  disputedRowCount: number;
  verifiedRowCount: number;
  staleSourceCount: number;
  hasLibrary: boolean;
  latestDigest: ResearchDigest | null;
  pendingLeadCount: number;
  staleLeadCount: number;
  staleSignalCount: number;
  acceptedSignalCount: number;
}

const DEMO_FILE_PREFIX = 'demo-file-';

function isRealSession(session: ReadingSession): boolean {
  return !session.fileId.startsWith(DEMO_FILE_PREFIX);
}

function isUsefulSession(session: ReadingSession): boolean {
  return session.linesRead > 0 || session.durationSec >= 30;
}

function sessionTime(session: ReadingSession): number {
  const value = Date.parse(session.startedAt);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 组合“现在研究到哪里”所需的本地事实。
 * 无法定位的证据仍然计入待审阅，而不是被静默排除。
 */
export function buildCurrentResearchState(
  input: CurrentResearchStateInput,
): CurrentResearchStateSnapshot {
  const activeFiles = input.files.filter(
    (file) => file.deletedAt === null && file.type !== 'folder',
  );
  const filesById = new Map(activeFiles.map((file) => [file.id, file]));
  const sessions = input.sessions
    .filter(
      (session) =>
        isRealSession(session) &&
        isUsefulSession(session) &&
        filesById.has(session.fileId),
    )
    .sort((a, b) => sessionTime(b) - sessionTime(a));
  const recentSessions = sessions.slice(0, 5).map((session) => ({
    session,
    file: filesById.get(session.fileId)!,
  }));

  const fallbackFile = [...activeFiles].sort((a, b) => {
    const aTime = a.lastReadAt ? Date.parse(a.lastReadAt) : 0;
    const bTime = b.lastReadAt ? Date.parse(b.lastReadAt) : 0;
    return bTime - aTime;
  })[0] ?? null;
  const active = recentSessions[0] ?? (fallbackFile ? {
    file: fallbackFile,
    session: {
      id: `virtual_${fallbackFile.id}`,
      fileId: fallbackFile.id,
      startedAt: fallbackFile.lastReadAt ?? fallbackFile.updatedAt,
      endedAt: fallbackFile.lastReadAt ?? null,
      durationSec: 0,
      linesRead: 0,
      focusSamples: [],
      fatigueSamples: [],
      distractions: [],
    },
  } : null);

  const pendingRowCount = input.rows.filter((row) =>
    row.verification === 'proposed' ||
    row.verification === 'edited' ||
    row.verification === 'unresolved',
  ).length;
  const disputedRowCount = input.rows.filter(
    (row) => row.verification === 'disputed',
  ).length;
  const staleSourceCount = input.rows.filter((row) =>
    row.evidence.some((item) => {
      const file = input.files.find((candidate) => candidate.id === item.fileId);
      return (
        !file ||
        file.deletedAt !== null ||
        file.type === 'folder' ||
        !isResolvableLocator(item.locator, file.type)
      );
    }),
  ).length;
  const verifiedRowCount = input.rows.filter(
    (row) =>
      isCitationReadyEvidenceRow(row, input.files),
  ).length;
  const latestDigest = [...input.digests].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0] ?? null;
  const pendingLeadCount = input.leads.filter(
    (lead) => lead.status === 'proposed',
  ).length;
  const staleLeadCount = input.leads.filter(
    (lead) => lead.status === 'stale',
  ).length;
  const staleSignalCount = input.signals.filter(
    (signal) => signal.status === 'stale',
  ).length;
  const acceptedSignalCount = input.signals.filter(
    (signal) => signal.status === 'accepted',
  ).length;

  return {
    active,
    recentSessions,
    activeFiles,
    matrixCount: input.matrices.length,
    graphNodeCount: input.graphNodes.length,
    analysisCount: input.analyses.length,
    pendingRowCount,
    disputedRowCount,
    verifiedRowCount,
    staleSourceCount,
    hasLibrary: activeFiles.length > 0,
    latestDigest,
    pendingLeadCount,
    staleLeadCount,
    staleSignalCount,
    acceptedSignalCount,
  };
}
