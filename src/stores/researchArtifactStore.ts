/**
 * researchArtifactStore - 会话后整理、研究信号与待审阅线索的本地编排。
 * 事实仍由文件/批注/矩阵提供；本 store 只保存可回溯的派生结果。
 */
import { create } from 'zustand';
import * as researchDigestsDb from '../db/researchDigests';
import * as researchLeadsDb from '../db/researchLeads';
import * as researchSignalsDb from '../db/researchSignals';
import * as qaMessagesDb from '../db/qaMessages';
import type {
  Annotation,
  FileNode,
  ResearchDigest,
  ResearchLead,
  ResearchSignal,
  ResearchSourceReference,
  QaMessage,
} from '../types';
import type { AiSettingsDraft } from './uiStore';
import { loadDocumentTranscript } from '../utils/loadDocumentTranscript';
import { evaluateAnnotationArtifacts } from '../utils/researchArtifactGate';
import { runDigest } from '../utils/runDigest';
import { reconcileSourceRecords } from '../utils/sourceInvalidation';
import { subscribeSourceInvalidation } from '../utils/sourceInvalidationEvents';

type ArtifactLoadStatus = 'idle' | 'loading' | 'error';

interface CreateDigestInput {
  sessionId: string;
  file: FileNode;
  annotations: Annotation[];
  qaMessages?: QaMessage[];
  ai: AiSettingsDraft;
  isOnline: boolean;
}

interface ResearchArtifactState {
  digests: ResearchDigest[];
  signals: ResearchSignal[];
  leads: ResearchLead[];
  loadStatus: ArtifactLoadStatus;
  errorMessage: string | null;
  loadArtifacts: () => Promise<void>;
  createForSession: (input: CreateDigestInput) => Promise<ResearchDigest>;
  setLeadStatus: (
    leadId: string,
    status: Extract<ResearchLead['status'], 'accepted' | 'dismissed'>,
  ) => Promise<void>;
}

function now(): string {
  return new Date().toISOString();
}

function sourceRef(input: {
  fileId: string;
  sessionId: string;
  annotationId: string;
  locator: ResearchSourceReference['locator'];
}): ResearchSourceReference {
  return {
    fileId: input.fileId,
    sessionId: input.sessionId,
    annotationIds: [input.annotationId],
    rowIds: [],
    locator: input.locator,
  };
}

function digestId(sessionId: string): string {
  return `research-digest-${sessionId}`;
}

function signalId(annotationId: string): string {
  return `research-signal-${annotationId}`;
}

function leadId(sessionId: string, annotationId: string): string {
  return `research-lead-${sessionId}-${annotationId}`;
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const found = items.some((item) => item.id === next.id);
  return found
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items];
}

function meaningfulAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter(
    (annotation) =>
      annotation.body.trim() || (annotation.quotedText?.trim() ?? ''),
  );
}

/** StrictMode/路由 cleanup 可能重复结束同一会话；同一 session 只允许一条整理任务。 */
const digestRuns = new Map<string, Promise<ResearchDigest>>();

export const useResearchArtifactStore = create<ResearchArtifactState>(
  (set, get) => ({
    digests: [],
    signals: [],
    leads: [],
    loadStatus: 'idle',
    errorMessage: null,

    loadArtifacts: async () => {
      set({ loadStatus: 'loading', errorMessage: null });
      try {
        const [digests, signals, leads] = await Promise.all([
          researchDigestsDb.listResearchDigests(),
          researchSignalsDb.listResearchSignals(),
          researchLeadsDb.listResearchLeads(),
        ]);
        set({ digests, signals, leads, loadStatus: 'idle' });
      } catch (error) {
        set({
          loadStatus: 'error',
          errorMessage: error instanceof Error ? error.message : '无法读取研究整理',
        });
      }
    },

    createForSession: async (input) => {
      const {
        sessionId,
        file,
        annotations,
        qaMessages,
        ai,
        isOnline,
      } = input;
      const pending = digestRuns.get(sessionId);
      if (pending) return pending;

      const run = (async (): Promise<ResearchDigest> => {
      const existing = await researchDigestsDb.getResearchDigestBySession(sessionId);
      if (existing?.status === 'ready') return existing;

      let transcript = '';
      let usedTranscript = false;
      try {
        const loaded = await loadDocumentTranscript(file);
        transcript = loaded.text;
        usedTranscript = loaded.text.length > 0;
      } catch {
        /* 本地文字层缺失不应阻塞批注信号保存。 */
      }

      const meaningful = meaningfulAnnotations(annotations);
      const persistedQa =
        qaMessages ?? (await qaMessagesDb.listQaMessagesByFile(file.id));
      const meaningfulQa = persistedQa.filter(
        (message) => message.status === 'done' && message.content.trim(),
      );
      const gate = evaluateAnnotationArtifacts({ file, annotations: meaningful, transcript });
      const timestamp = now();
      let digest: ResearchDigest = existing ?? {
        id: digestId(sessionId),
        sessionId,
        fileId: file.id,
        markdown: '',
        structured: null,
        usedTranscript,
        status: 'waiting',
        errorMessage: null,
        candidateCount: gate.candidates.length,
        directSaveCount: gate.directSaveCount,
        reviewCount: gate.reviewCount,
        directSaveReasons: gate.directSaveReasons,
        reviewReasons: gate.reviewReasons,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // 先保存本地可核验结果，AI 不可用时仍能回到研究信号与审阅线索。
      for (const candidate of gate.candidates) {
        const annotation = meaningful.find((item) => item.id === candidate.annotationId);
        if (!annotation) continue;
        const ref = sourceRef({
          fileId: file.id,
          sessionId,
          annotationId: annotation.id,
          locator: candidate.locator,
        });
        if (candidate.decision === 'direct-save') {
          const signal: ResearchSignal = {
            id: signalId(annotation.id),
            kind: 'authored-stance',
            statement: candidate.statement,
            observation: null,
            status: 'accepted',
            sourceRefs: [ref],
            createdAt: annotation.createdAt,
            updatedAt: timestamp,
          };
          const persistedSignal = await researchSignalsDb.putResearchSignal(signal);
          set({ signals: upsertById(get().signals, persistedSignal) });
        } else {
          const lead: ResearchLead = {
            id: leadId(sessionId, annotation.id),
            kind: 'evidence-gap',
            title: `待审阅：${file.name}`,
            explanation: candidate.statement,
            status: 'proposed',
            sessionId,
            fileIds: [file.id],
            signalIds: [],
            rowIds: [],
            sourceRefs: [ref],
            reasons: candidate.reasons,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          const persistedLead = await researchLeadsDb.putResearchLead(lead);
          set({ leads: upsertById(get().leads, persistedLead) });
        }
      }

      const canCallAi =
        isOnline &&
        ai.apiKey.trim().length > 0 &&
        (meaningful.length > 0 || meaningfulQa.length > 0);
      if (!canCallAi) {
        digest = {
          ...digest,
          usedTranscript,
          status: 'waiting',
          errorMessage:
            meaningful.length === 0 && meaningfulQa.length === 0
              ? '暂无可整理的批注或问答'
              : 'AI 未配置或当前离线；本地批注已保留，稍后可重新整理',
          candidateCount: gate.candidates.length,
          directSaveCount: gate.directSaveCount,
          reviewCount: gate.reviewCount,
          directSaveReasons: gate.directSaveReasons,
          reviewReasons: gate.reviewReasons,
          updatedAt: timestamp,
        };
        await researchDigestsDb.putResearchDigest(digest);
        set({ digests: upsertById(get().digests, digest) });
        return digest;
      }

      digest = {
        ...digest,
        status: 'generating',
        errorMessage: null,
        usedTranscript,
        candidateCount: gate.candidates.length,
        directSaveCount: gate.directSaveCount,
        reviewCount: gate.reviewCount,
        directSaveReasons: gate.directSaveReasons,
        reviewReasons: gate.reviewReasons,
        updatedAt: now(),
      };
      await researchDigestsDb.putResearchDigest(digest);
      set({ digests: upsertById(get().digests, digest) });

      try {
        const result = await runDigest({
          file,
          annotations: meaningful,
          qaMessages: meaningfulQa,
          ai,
        });
        digest = {
          ...digest,
          markdown: result.markdown,
          structured: result.structured,
          usedTranscript: result.usedTranscript,
          status: 'ready',
          errorMessage: null,
          candidateCount: result.artifactGate.candidates.length,
          directSaveCount: result.artifactGate.directSaveCount,
          reviewCount: result.artifactGate.reviewCount,
          directSaveReasons: result.artifactGate.directSaveReasons,
          reviewReasons: result.artifactGate.reviewReasons,
          updatedAt: now(),
        };
      } catch (error) {
        digest = {
          ...digest,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '整理习得失败',
          updatedAt: now(),
        };
      }
      await researchDigestsDb.putResearchDigest(digest);
      set({ digests: upsertById(get().digests, digest) });
      return digest;
      })();
      digestRuns.set(sessionId, run);
      try {
        return await run;
      } finally {
        if (digestRuns.get(sessionId) === run) digestRuns.delete(sessionId);
      }
    },

    setLeadStatus: async (leadIdValue, status) => {
      const lead = get().leads.find((item) => item.id === leadIdValue);
      if (!lead || lead.status === 'stale') return;
      const next: ResearchLead = { ...lead, status, updatedAt: now() };
      const persisted = await researchLeadsDb.putResearchLead(next);
      set({ leads: get().leads.map((item) => (item.id === persisted.id ? persisted : item)) });
    },
  }),
);

subscribeSourceInvalidation((fileIds) => {
  const state = useResearchArtifactStore.getState();
  const result = reconcileSourceRecords({
    fileIds,
    rows: [],
    analyses: [],
    signals: state.signals,
    leads: state.leads,
  });
  useResearchArtifactStore.setState({
    signals: result.signals,
    leads: result.leads,
  });
});
