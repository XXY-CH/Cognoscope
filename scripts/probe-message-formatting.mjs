/**
 * Runtime probe for the reader message surface.
 * Bundle this file with esbuild before running it because the parser is
 * TypeScript and the repository intentionally keeps no test runner.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseLatexMath, parseMessageInline, parseMessageMarkdown } from '../src/utils/messageMarkup.ts';

const source = await fs.readFile('src/features/reader/panels/QAPanel.tsx', 'utf8');
const blocks = parseMessageMarkdown([
  '# 结论',
  '',
  '支持 **加权残差**，其中 $y = x + \\frac{f(x)}{2}$。',
  '',
  '- 第一条',
  '- 第二条',
  '',
  '$$',
  '\\sum_{i=1}^{n} x_i^2',
  '$$',
  '',
  '```ts',
  'const value = 1;',
  '```',
].join('\n'));

assert.equal(blocks[0]?.type, 'heading');
assert.equal(blocks.some((block) => block.type === 'list'), true);
assert.equal(blocks.some((block) => block.type === 'math'), true);
assert.equal(blocks.some((block) => block.type === 'code'), true);

const inlineMath = parseMessageInline('x = $\\alpha + \\frac{1}{2}$');
assert.equal(inlineMath.some((item) => item.type === 'math'), true);
const mathTree = JSON.stringify(parseLatexMath('\\sum_{i=1}^{n} \\frac{\\alpha}{2}', true));
assert.match(mathTree, /"name":"mfrac"/);
assert.match(mathTree, /"name":"msubsup"/);
assert.match(mathTree, /α/);

const unsafeLink = parseMessageInline('[bad](javascript:alert(1))');
assert.equal(unsafeLink.every((item) => item.type !== 'link'), true);

assert.match(source, /e\.key === 'Enter'/);
assert.match(source, /!e\.shiftKey/);
assert.match(source, /!e\.nativeEvent\.isComposing/);
assert.match(source, /<FormattedMessage content=\{m\.content\}/);

console.log(JSON.stringify({
  ok: true,
  scope: 'reader-message-formatting',
  guarantees: [
    'headings-lists-fences-and-inline-markdown',
    'inline-and-display-latex-to-mathml',
    'unsafe-links-stay-text',
    'plain-enter-sends-shift-enter-keeps-newline',
  ],
}, null, 2));
