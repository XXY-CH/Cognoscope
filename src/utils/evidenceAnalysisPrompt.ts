/** evidenceAnalysisPrompt - 仅用已确认矩阵行生成综述分析提议。 */
import type { EvidenceItem, EvidenceRow, FileNode } from '../types';
import type { ChatMessage } from './aiChat';

function locatorLabel(item: EvidenceItem, files: Map<string, FileNode>): string {
  const file = files.get(item.fileId);
  const source = file?.name ?? item.fileId;
  if (item.locator.kind === 'pdf-page') return `${source} 第${item.locator.page}页`;
  if (item.locator.kind === 'epub-cfi') {
    if (item.locator.location != null) return `${source} location ${item.locator.location}`;
    if (item.locator.sectionIndex != null) return `${source} 章节 ${item.locator.sectionIndex}`;
  }
  return `${source} 定位待核对`;
}

/** 将已确认行压缩成可审计的分析输入，不把未确认原文送入二次分析。 */
export function buildEvidenceAnalysisMessages(input: {
  comparisonQuestion: string;
  rows: EvidenceRow[];
  files: FileNode[];
  answerLanguage?: 'zh' | 'en' | 'auto';
}): ChatMessage[] {
  const fileById = new Map(input.files.map((file) => [file.id, file]));
  const verifiedRows = input.rows.filter((row) => row.verification === 'verified');
  const sourceText = verifiedRows
    .map((row, index) => {
      const evidence = row.evidence
        .map((item) => {
          const file = fileById.get(item.fileId);
          return [
            `来源：${file?.name ?? item.fileId}`,
            `定位：${item.locator.kind === 'unresolved' ? '待核对' : locatorLabel(item, fileById)}`,
            `摘录：${item.quotedText}`,
            item.annotationBody ? `用户批注：${item.annotationBody}` : '',
          ].filter(Boolean).join('\n');
        })
        .join('\n');
      return `矩阵行 ${row.id}（${index + 1}）\n结论：${row.conclusion}\n${evidence}`;
    })
    .join('\n\n==============================\n\n');

  const system = [
    '你是严谨的文献综述分析助手，只能处理已经由研究者确认的矩阵行。',
    '请输出 JSON 数组，不要 Markdown 围栏、解释或额外字段。',
    '每个对象格式为：{"section":"findings|limitations|gaps","statement":"...","rationale":"...","rowIds":["矩阵行ID"]}',
    'findings 表示研究结论与证据，limitations 表示局限、边界或相互矛盾，gaps 表示由现有证据支持的研究空白与机会。',
    '每条对象至少引用一个提供的 rowId；如果材料不足，不要编造判断，也不要使用未提供的 rowId。',
    '不要把图谱关系、模型常识或未确认内容当作证据；分析只是提议，不能标记为 verified。',
    '最多返回每个 section 4 条，statement 和 rationale 要具体、可核对。',
    input.answerLanguage === 'en' ? '使用英文。' : '使用中文。',
  ].join('\n');
  const user = [
    `比较问题：${input.comparisonQuestion.trim()}`,
    '',
    '已确认的矩阵行（只能引用这些行）：',
    sourceText || '（没有已确认矩阵行，无法进行分析）',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
