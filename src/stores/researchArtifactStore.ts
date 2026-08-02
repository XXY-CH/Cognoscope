/**
 * researchArtifactStore - 会话后整理、研究信号与待审阅线索的本地编排。
 * 事实仍由文件/批注/矩阵提供；本 store 只保存可回溯的派生结果。
 */
import { create } from 'zustand';
import * as researchDigestsDb from '../db/researchDigests';
import * as researchLeadsDb from '../db/researchLeads';
import * as researchSignalsDb from '../db/researchSignals';
import type {
  Annotation,
  FileNode,
  ResearchDigest,
  ResearchLead,
  ResearchSignal,
  ResearchSourceReference,
} from '../types';
import type { AiSettingsDraft } from './uiStore';
import { loadDocumentTranscript } from '../utils/loadDocumentTranscript';
import { evaluateAnnotationArtifacts } from '../utils/researchArtifactGate';
import { runDigest } from '../utils/runDigest';

type ArtifactLoadStatus = 'idle' | 'loading' | 'error';

interface CreateDigestInput {
  sessionId: string;
  file: FileNode;
  annotations: Annotation[];
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

    createForSession: async ({
      sessionId,
      file,
      annotations,
      ai,
      isOnline,
    }) => {
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
      const gate = evaluateAnnotationArtifacts({ file, annotations: meaningful, transcript });
      const timestamp = now();
      let digest: ResearchDigest = existing ?? {
        id: digestId(sessionId),
        sessionId,
        fileId: file.id,
        markdown: '',
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
          await researchSignalsDb.putResearchSignal(signal);
          set({ signals: upsertById(get().signals, signal) });
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
          await researchLeadsDb.putResearchLead(lead);
          set({ leads: upsertById(get().leads, lead) });
        }
      }

      const canCallAi = isOnline && ai.apiKey.trim().length > 0;
      if (!canCallAi) {
        digest = {
          ...digest,
          usedTranscript,
          status: 'waiting',
          errorMessage:
            meaningful.length === 0
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
        const result = await runDigest({ file, annotations: meaningful, ai });
        digest = {
          ...digest,
          markdown: result.markdown,
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
    },

    setLeadStatus: async (leadIdValue, status) => {
      const lead = get().leads.find((item) => item.id === leadIdValue);
      if (!lead) return;
      const next: ResearchLead = { ...lead, status, updatedAt: now() };
      await researchLeadsDb.putResearchLead(next);
      set({ leads: get().leads.map((item) => (item.id === next.id ? next : item)) });
    },
  }),
);
