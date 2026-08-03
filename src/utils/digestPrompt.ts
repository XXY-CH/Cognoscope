/**
 * digestPrompt.ts - 整理习得 Prompt 组装
 * 所属：E · 阅读界面 > SidePanel > 整理习得
 * 规范参考：UI_spec.md §8.9；语料 = 批注 + 问答 + PDF 文字稿
 */
import type { Annotation, QaMessage } from '../types';
import type { AiAnswerLanguage } from '../stores/uiStore';
import type { ChatMessage } from './aiChat';

export interface DigestPromptInput {
  fileName: string;
  annotations: Annotation[];
  /** PDF 文字稿；可为空字符串 */
  transcript: string;
  transcriptTruncated?: boolean;
  answerLanguage: AiAnswerLanguage;
  qaMessages?: QaMessage[];
}

function langInstruction(lang: AiAnswerLanguage): string {
  if (lang === 'en') return 'Write the entire digest in English.';
  if (lang === 'zh') return '请全程使用简体中文撰写。';
  return '使用与文献主体语言一致的语言撰写（中英混排文献以中文为主）。';
}

/**
 * 将批注格式化为可读条目
 */
export function formatAnnotationsForPrompt(annotations: Annotation[]): string {
  const sorted = [...annotations].sort(
    (a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt),
  );
  if (sorted.length === 0) return '（暂无批注）';

  return sorted
    .map((a, i) => {
      const quote = a.quotedText?.trim()
        ? `引用：「${a.quotedText.trim()}」`
        : '引用：（无划词引用）';
      const body = a.body.trim() || '（批注正文为空）';
      return `${i + 1}. [第 ${a.page} 页] ${quote}\n   批注：${body}`;
    })
    .join('\n');
}

const QA_MAX_MESSAGES = 24;
const QA_MAX_CHARS = 12000;

/** 只把已完成、非空的本地问答作为上下文；问答不是 citation-ready 事实。 */
export function formatQaMessagesForPrompt(messages: QaMessage[] = []): string {
  const selected = messages
    .filter((message) => message.status === 'done' && message.content.trim())
    .slice(-QA_MAX_MESSAGES);
  if (selected.length === 0) return '（暂无已完成问答）';

  let used = 0;
  const rows: string[] = [];
  for (const message of selected) {
    const role = message.role === 'user' ? '用户问题' : '助手回答';
    const quote = message.quotedText?.trim()
      ? `\n   选中片段：${message.quotedText.trim()}`
      : '';
    const page = message.quotedPage != null ? ` · 第 ${message.quotedPage} 页` : '';
    const row = `${role}${page}：${message.content.trim()}${quote}`;
    if (used + row.length > QA_MAX_CHARS && rows.length > 0) break;
    rows.push(row);
    used += row.length;
  }
  return rows.join('\n');
}

/**
 * 组装整理习得的 system + user 消息
 */
export function buildDigestMessages(input: DigestPromptInput): ChatMessage[] {
  const {
    fileName,
    annotations,
    transcript,
    transcriptTruncated = false,
    answerLanguage,
    qaMessages = [],
  } = input;

  const system = [
    '你是学术文献阅读助手「学森」中的「整理习得」模块。',
    '任务：根据用户在本篇文献上的批注，并结合文献文字稿，归纳用户的阅读习得。',
    '要求：',
    '1. 以用户批注为线索与重心，不要无视批注去写泛泛的全文摘要。',
    '2. 用文字稿核实批注上下文，纠正明显断章取义，并补充与批注相关的必要背景。',
    '3. 区分「文献原意」与「用户批注意见」；不确定处明确标注「待核实」。',
    '4. 输出纯 Markdown，不要包在代码围栏里，不要开场寒暄。',
    '5. 结构必须包含以下二级标题（可按内容增减小节）：',
    '   ## 核心要点',
    '   ## 批注洞察',
    '   ## 疑问与待跟进',
    '   ## 可行动作 / 下一步阅读',
    '6. 条目简洁有据；关键论断尽量对应批注页码或引用短句。',
    langInstruction(answerLanguage),
  ].join('\n');

  const truncNote = transcriptTruncated
    ? '\n（注：文字稿因长度限制已截断，可能未覆盖全文。）\n'
    : '';

  const transcriptBlock =
    transcript.trim().length > 0
      ? `## 文献文字稿\n${truncNote}${transcript.trim()}`
      : '## 文献文字稿\n（未能提取到文字层，请仅依据批注整理；并在文首说明文字稿缺失。）';

  const user = [
    `# 文献：${fileName}`,
    '',
    '## 用户批注（请重点利用）',
    formatAnnotationsForPrompt(annotations),
    '',
    '## 用户问答（仅作为阅读上下文，不可替代有 locator 的原文证据）',
    formatQaMessagesForPrompt(qaMessages),
    '',
    transcriptBlock,
    '',
    '请根据以上材料生成「阅读习得」Markdown。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
