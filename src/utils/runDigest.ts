/**
 * runDigest.ts - 整理习得编排：批注 + PDF 文字稿 → AI Markdown
 * 所属：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.9；HANDOFF.md §5
 */
import type { Annotation, FileNode } from '../types';
import type { AiSettingsDraft } from '../stores/uiStore';
import { chatCompletion } from './aiChat';
import { buildDigestMessages } from './digestPrompt';
import { loadDocumentTranscript } from './loadDocumentTranscript';

export interface RunDigestInput {
  file: FileNode;
  annotations: Annotation[];
  ai: AiSettingsDraft;
  signal?: AbortSignal;
}

export interface RunDigestResult {
  markdown: string;
  /** 是否成功附上 PDF 文字稿 */
  usedTranscript: boolean;
}

/**
 * 执行一次整理习得（非流式）
 */
export async function runDigest(
  input: RunDigestInput,
): Promise<RunDigestResult> {
  const { file, annotations, ai, signal } = input;
  const meaningful = annotations.filter(
    (a) => a.body.trim() || (a.quotedText?.trim() ?? ''),
  );
  if (meaningful.length === 0) {
    throw new Error('暂无可整理的批注或问答');
  }

  const transcript = await loadDocumentTranscript(file, signal);
  const messages = buildDigestMessages({
    fileName: file.name,
    annotations: meaningful,
    transcript: transcript.text,
    transcriptTruncated: transcript.truncated,
    answerLanguage: ai.answerLanguage,
  });

  const markdown = await chatCompletion({
    settings: ai,
    messages,
    maxTokens: Math.max(ai.maxTokens, 2048),
    signal,
  });

  return {
    markdown,
    usedTranscript: transcript.text.length > 0,
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
