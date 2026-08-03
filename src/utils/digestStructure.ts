/** digestStructure - 将整理 Markdown 投影为可扫描栏目，不复制任何证据事实。 */
import type {
  ResearchDigestSection,
  ResearchDigestStructure,
} from '../types';

const HEADING_RE = /^#{2,3}\s+(.+?)\s*#*\s*$/;
const LIST_RE = /^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/;
const REQUIRED_HEADINGS = [
  ['核心要点', 'core takeaways', 'key points'],
  ['批注洞察', 'annotation insights', 'reading insights'],
  ['疑问与待跟进', 'questions and follow-up', 'questions & follow-up'],
  [
    '可行动作 / 下一步阅读',
    '可行动作',
    '下一步阅读',
    'actionable next steps',
    'next steps',
  ],
] as const;

function normalizeHeading(title: string): string {
  return title
    .toLocaleLowerCase()
    .replace(/[：:、，,。.!！？?（）()[\]{}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasRequiredHeadings(groups: Array<{ title: string }>): boolean {
  const titles = groups.map((group) => normalizeHeading(group.title));
  return REQUIRED_HEADINGS.every((aliases) =>
    aliases.some((alias) => {
      const normalized = normalizeHeading(alias);
      return titles.some(
        (title) => title === normalized || title.includes(normalized),
      );
    }),
  );
}

function sectionId(title: string, index: number): string {
  const normalized = title
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `${normalized}-${index + 1}` : `section-${index + 1}`;
}

function toSection(
  title: string,
  lines: string[],
  index: number,
): ResearchDigestSection {
  const items: string[] = [];
  const bodyLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const listMatch = LIST_RE.exec(trimmed);
    if (listMatch?.[1]) items.push(listMatch[1].trim());
    else bodyLines.push(trimmed);
  }
  return {
    id: sectionId(title, index),
    title,
    body: bodyLines.join('\n'),
    items,
  };
}

/**
 * 解析模型输出的 Markdown 标题和列表；无固定标题时保留全文为 markdown-only。
 */
export function parseDigestMarkdown(markdown: string): ResearchDigestStructure {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const groups: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;
  let firstHeadingIndex = -1;

  for (const [index, line] of lines.entries()) {
    const match = HEADING_RE.exec(line.trim());
    if (match?.[1]) {
      if (firstHeadingIndex < 0) firstHeadingIndex = index;
      current = { title: match[1].trim(), lines: [] };
      groups.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (groups.length === 0) {
    return {
      parseStatus: 'markdown-only',
      sections: [
        {
          id: 'digest-body',
          title: '整理正文',
          body: markdown.trim(),
          items: [],
        },
      ],
    };
  }

  if (!hasRequiredHeadings(groups)) {
    return {
      parseStatus: 'markdown-only',
      sections: [
        {
          id: 'digest-body',
          title: '整理正文',
          body: markdown.trim(),
          items: [],
        },
      ],
    };
  }

  const preamble = lines.slice(0, firstHeadingIndex).join('\n').trim();
  const structuredGroups = preamble
    ? [{ title: '整理说明', lines: [preamble] }, ...groups]
    : groups;

  return {
    parseStatus: 'structured',
    sections: structuredGroups.map((group, index) =>
      toSection(group.title, group.lines, index),
    ),
  };
}
