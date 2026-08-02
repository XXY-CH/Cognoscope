/**
 * evidencePrompt - 跨论文证据矩阵的结构化提示词。
 * 模型只能提出候选结论，不能自行把任何证据标记为 verified。
 */
import type { ChatMessage } from './aiChat';
import type { EvidenceInputBundle } from './evidenceInput';

export function buildEvidenceMessages(input: {
  comparisonQuestion: string;
  bundle: EvidenceInputBundle;
  answerLanguage?: 'zh' | 'en' | 'auto';
}): ChatMessage[] {
  const system = [
    '你是严谨的文献综述证据整理助手。',
    '你的任务是根据用户已导入的本地论文材料，提出可编辑的跨论文结论行。',
    '只输出 JSON 数组，不要 Markdown 围栏、解释或额外字段。',
    '格式：[{"conclusion":"...","evidence":[{"fileId":"...","quotedText":"...","note":"...","annotationId":null,"locator":{"kind":"pdf-page","page":1,"anchor":null}}]}]',
    'locator 只能是 pdf-page、epub-cfi 或 unresolved 三种对象；无法定位时必须使用 unresolved 并说明原因。',
    'quotedText 必须逐字来自对应论文的批注原文或本地文字稿；没有支持时不要编造证据。',
    '不要返回未提供的 fileId，不要合并不同论文的来源，不要把任何行标记为 verified。',
    '每篇论文最多贡献一个主要结论，最多返回 8 行；没有可靠支持的结论可以返回 unresolved 证据，供用户审核。',
    input.answerLanguage === 'en' ? '结论和备注使用英文。' : '结论和备注使用中文。',
  ].join('\n');

  const sourceBlocks = input.bundle.sources
    .map((source) => source.formattedText)
    .join('\n\n==============================\n\n');
  const user = [
    `比较问题：${input.comparisonQuestion.trim()}`,
    '',
    '本地论文材料（只能引用这些材料）：',
    sourceBlocks || '（无可用本地材料）',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
