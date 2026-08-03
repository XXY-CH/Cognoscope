/**
 * runDigest.ts - 整理习得编排：批注 + 问答 + 本地文字稿 → 结构化 Markdown
 * 所属：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.9；HANDOFF.md §5
 */
import type {
  Annotation,
  FileNode,
  QaMessage,
  ResearchDigestStructure,
} from '../types';
import type { AiSettingsDraft } from '../stores/uiStore';
import { chatCompletion } from './aiChat';
import { buildDigestMessages } from './digestPrompt';
import { loadDocumentTranscript } from './loadDocumentTranscript';
import { parseDigestMarkdown } from './digestStructure';
import {
  evaluateAnnotationArtifacts,
  type ResearchArtifactGateSummary,
} from './researchArtifactGate';

export interface RunDigestInput {
  file: FileNode;
  annotations: Annotation[];
  qaMessages?: QaMessage[];
  ai: AiSettingsDraft;
  signal?: AbortSignal;
}

export interface RunDigestResult {
  markdown: string;
  structured: ResearchDigestStructure;
  /** 是否成功附上 PDF 文字稿 */
  usedTranscript: boolean;
  /** 仅基于本地摘录/定位的可解释门槛结果。 */
  artifactGate: ResearchArtifactGateSummary;
}

/**
 * 执行一次整理习得（非流式）
 */
export async function runDigest(
  input: RunDigestInput,
): Promise<RunDigestResult> {
  const { file, annotations, qaMessages = [], ai, signal } = input;
  const meaningful = annotations.filter(
    (a) => a.body.trim() || (a.quotedText?.trim() ?? ''),
  );
  const meaningfulQa = qaMessages.filter(
    (message) => message.status === 'done' && message.content.trim(),
  );
  if (meaningful.length === 0 && meaningfulQa.length === 0) {
    throw new Error('暂无可整理的批注或问答');
  }

  const transcript = await loadDocumentTranscript(file, signal);
  const messages = buildDigestMessages({
    fileName: file.name,
    annotations: meaningful,
    transcript: transcript.text,
    transcriptTruncated: transcript.truncated,
    answerLanguage: ai.answerLanguage,
    qaMessages: meaningfulQa,
  });

  const markdown = await chatCompletion({
    settings: ai,
    messages,
    maxTokens: Math.max(ai.maxTokens, 2048),
    signal,
  });

  return {
    markdown,
    structured: parseDigestMarkdown(markdown),
    usedTranscript: transcript.text.length > 0,
    artifactGate: evaluateAnnotationArtifacts({
      file,
      annotations: meaningful,
      transcript: transcript.text,
    }),
  };
}

/**
 * 导出习得 Markdown 为本地文件
 */
export function downloadDigestMarkdown(
  fileName: string,
  markdown: string,
): void {
  const safe = fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `习得-${safe || '文献'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
