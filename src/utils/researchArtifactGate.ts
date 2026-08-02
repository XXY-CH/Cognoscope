/**
 * researchArtifactGate - 将阅读材料分成可直接保存与必须审阅两类。
 * 规则刻意保持可解释：不使用隐藏概率，也不把模型摘要自动当成引用事实。
 */
import type {
  Annotation,
  EvidenceLocator,
  EvidenceMatchMethod,
  FileNode,
} from '../types';
import { locatorFromAnnotation, matchEvidenceExcerpt } from './evidenceMatch';

export type ResearchArtifactDecision = 'direct-save' | 'review';

export interface ResearchArtifactCandidate {
  id: string;
  fileId: string;
  annotationId: string;
  statement: string;
  quotedText: string;
  locator: EvidenceLocator;
  match: EvidenceMatchMethod;
  decision: ResearchArtifactDecision;
  reasons: string[];
}

export interface ResearchArtifactGateSummary {
  candidates: ResearchArtifactCandidate[];
  directSaveCount: number;
  reviewCount: number;
  directSaveReasons: string[];
  reviewReasons: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

/**
 * 对一篇文献的用户批注做确定性门槛检查。
 * 用户批注是 authored signal，不等同于 AI 已确认的研究结论。
 */
export function evaluateAnnotationArtifacts(input: {
  file: FileNode;
  annotations: Annotation[];
  transcript: string;
}): ResearchArtifactGateSummary {
  const candidates = input.annotations
    .filter((annotation) =>
      annotation.body.trim() || (annotation.quotedText?.trim() ?? ''),
    )
    .map((annotation): ResearchArtifactCandidate => {
      const quotedText = annotation.quotedText?.trim() ?? '';
      const statement = annotation.body.trim() || quotedText;
      const reasons: string[] = [];
      const locator =
        input.file.type === 'folder'
          ? { kind: 'unresolved' as const, reason: '文件夹不能作为阅读来源' }
          : locatorFromAnnotation(input.file.type, annotation);
      const match = matchEvidenceExcerpt({
        quotedText,
        annotations: input.annotations,
        transcript: input.transcript,
      });

      if (!quotedText) reasons.push('批注没有原文摘录，无法核对主张');
      if (locator.kind === 'unresolved') {
        reasons.push(`缺少可回读定位：${locator.reason}`);
      }
      if (quotedText && match.method === 'none') {
        reasons.push('原文摘录没有在本地批注或文字稿中精确匹配');
      }

      const decision: ResearchArtifactDecision =
        reasons.length === 0 ? 'direct-save' : 'review';
      if (decision === 'direct-save') {
        reasons.push('带可回读定位的用户原始批注，可作为研究信号保存');
      }
      return {
        id: `artifact_${annotation.id}`,
        fileId: input.file.id,
        annotationId: annotation.id,
        statement,
        quotedText,
        locator,
        match: match.method,
        decision,
        reasons,
      };
    });

  const direct = candidates.filter((candidate) => candidate.decision === 'direct-save');
  const review = candidates.filter((candidate) => candidate.decision === 'review');
  return {
    candidates,
    directSaveCount: direct.length,
    reviewCount: review.length,
    directSaveReasons: unique(direct.flatMap((candidate) => candidate.reasons)),
    reviewReasons: unique(review.flatMap((candidate) => candidate.reasons)),
  };
}

export interface CrossPaperConsensusInput {
  fileIds: string[];
  hasCounterexample: boolean;
  methodsIndependent: boolean;
  datasetsIndependent: boolean;
  hasUnresolvedConflict: boolean;
}

export interface CrossPaperConsensusResult {
  decision: ResearchArtifactDecision;
  reasons: string[];
}

/**
 * 三篇论文共识门槛。调用方必须显式提供反例、方法和数据集独立性检查结果。
 */
export function evaluateCrossPaperConsensus(
  input: CrossPaperConsensusInput,
): CrossPaperConsensusResult {
  const reasons: string[] = [];
  const uniqueFileCount = new Set(input.fileIds).size;
  if (uniqueFileCount < 3) reasons.push('跨论文共识至少需要 3 篇不同文献');
  if (input.hasCounterexample) reasons.push('发现反例，不能直接保存为共识');
  if (!input.methodsIndependent) reasons.push('研究方法独立性尚未确认');
  if (!input.datasetsIndependent) reasons.push('数据集独立性尚未确认');
  if (input.hasUnresolvedConflict) reasons.push('存在尚未解决的论文或批注冲突');
  return {
    decision: reasons.length === 0 ? 'direct-save' : 'review',
    reasons,
  };
}
