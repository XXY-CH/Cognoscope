/**
 * qaPrompt.ts - AI 问答 Prompt 组装（全文 + 可选选中重点）
 * 所属：E · 阅读界面 > QAPanel
 * 规范参考：UI_spec.md §8.6
 *
 * 策略：统一提交文献全文作为 system 上下文；
 * 若用户划词，则在 user 消息中重点指出该片段。
 */
import type { AiAnswerLanguage } from '../stores/uiStore';
import type { ChatMessage } from './aiChat';

export interface QaSystemPromptInput {
  fileName: string;
  transcript: string;
  transcriptTruncated?: boolean;
  answerLanguage: AiAnswerLanguage;
  autoCite: boolean;
}

/**
 * 组装问答 system：角色说明 + 语言偏好 + 文献全文
 */
export function buildQaSystemPrompt(input: QaSystemPromptInput): string {
  const {
    fileName,
    transcript,
    transcriptTruncated = false,
    answerLanguage,
    autoCite,
  } = input;

  const parts: string[] = [
    '你是学术文献阅读助手「学森」。',
    '请基于下方提供的文献全文回答用户问题；不要编造文中不存在的内容。',
    '若用户另行标出了重点选中片段，请优先围绕该片段作答，并联系全文上下文。',
  ];

  if (answerLanguage === 'zh') parts.push('请用简体中文回答。');
  if (answerLanguage === 'en') parts.push('Please answer in English.');
  if (autoCite) {
    parts.push('关键结论尽量引用原文短句，并注明大致位置（如页码）。');
  }

  const truncNote = transcriptTruncated
    ? '\n（注：文字稿因长度限制已截断，可能未覆盖全文。）\n'
    : '\n';

  const body = transcript.trim()
    ? transcript.trim()
    : '（未能提取到文字层。请根据用户问题尽力回答，并说明缺少全文上下文。）';

  parts.push('', `## 文献：${fileName}`, truncNote + body);
  return parts.join('\n');
}

/**
 * 组装发给模型的 user 正文（气泡仍只显示用户原始问题）
 * 有选中文字时，明确标出重点片段。
 */
export function buildQaUserContent(
  question: string,
  quotedText: string | null,
  quotedPage: number | null = null,
): string {
  const q = question.trim();
  const quote = quotedText?.trim();
  if (!quote && quotedPage == null) return q;

  return [
    '【重点关注】用户在全文中选中了以下片段，请优先围绕该片段理解与作答，并结合全文：',
    '-----',
    quote || '（未保存选中文本）',
    quotedPage == null ? '' : `来源位置：第 ${quotedPage} 页/节`,
    '-----',
    '',
    '【用户问题】',
    q,
  ].join('\n');
}

/**
 * 将本地消息转为 API messages（user 侧按 quotedText 重建重点提示）
 */
export function toApiChatMessages(
  systemPrompt: string,
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    quotedText: string | null;
    quotedPage?: number | null;
  }>,
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
        role: m.role,
        content:
          m.role === 'user'
          ? buildQaUserContent(m.content, m.quotedText, m.quotedPage ?? null)
          : m.content,
    })),
  ];
}
