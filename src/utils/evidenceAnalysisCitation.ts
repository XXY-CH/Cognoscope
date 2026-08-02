/** evidenceAnalysisCitation - 将已确认的二次分析复制为带矩阵回指的 Markdown。 */
import type { EvidenceAnalysis, EvidenceRow, FileNode } from '../types';

const SECTION_LABELS: Record<EvidenceAnalysis['items'][number]['section'], string> = {
  findings: '研究结论与证据',
  limitations: '局限与矛盾',
  gaps: '研究空白与机会',
};

function sourceLabel(row: EvidenceRow, files: Map<string, FileNode>): string {
  return row.evidence
    .map((item) => {
      const file = files.get(item.fileId);
      const locator = item.locator.kind === 'pdf-page'
        ? `第 ${item.locator.page} 页`
        : item.locator.kind === 'epub-cfi'
          ? item.locator.location != null
            ? `EPUB location ${item.locator.location}`
            : item.locator.sectionIndex != null
              ? `EPUB 章节 ${item.locator.sectionIndex}`
              : 'EPUB 位置待核对'
          : '定位待核对';
      return `${file?.name ?? item.fileId}，${locator}`;
    })
    .join('；');
}

export function formatEvidenceAnalysisCitation(
  analysis: EvidenceAnalysis,
  rows: EvidenceRow[],
  files: FileNode[],
): string {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const sections = (['findings', 'limitations', 'gaps'] as const).map((section) => {
    const items = analysis.items
      .filter((item) => item.section === section && item.verification === 'verified')
      .map((item) => ({
        item,
        references: item.rowIds
          .map((rowId) => rowById.get(rowId))
          .filter((row): row is EvidenceRow => row != null && row.verification === 'verified'),
      }))
      .filter(({ references }) => references.length > 0)
      .map(({ item, references }) => {
        const referenceText = references.map((row) => {
            const excerpts = row.evidence
              .map((evidence) => `> ${evidence.quotedText.replace(/\n/g, '\n> ')}`)
              .join('\n');
            return `- 矩阵行：${row.conclusion}\n- 来源：${sourceLabel(row, fileById)}\n- 摘录：${excerpts}`;
          })
          .join('\n');
        return `### ${item.statement}\n${item.rationale ? `${item.rationale}\n` : ''}${referenceText}`;
      });
    return items.length > 0 ? `## ${SECTION_LABELS[section]}\n${items.join('\n\n')}` : '';
  }).filter(Boolean);
  if (sections.length === 0) throw new Error('没有可复制的已确认分析');
  return [`# ${analysis.comparisonQuestion || '证据矩阵分析'}`, ...sections].join('\n\n');
}
