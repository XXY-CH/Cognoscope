/**
 * Static UX-06 contract probe for the Apple Design responsive shell.
 * Browser screenshots remain a separate gate when a runtime is available.
 */
import fs from 'node:fs/promises';

const [pageSource, styleSource, tokenSource, shellSource] = await Promise.all([
  fs.readFile(new URL('../src/features/research-state/CurrentResearchStatePage.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/research-state/CurrentResearchStatePage.module.css', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/components/layout/AppShell.css', import.meta.url), 'utf8'),
]);

for (const [label, source, marker] of [
  ['研究现场当前问题', pageSource, '当前问题'],
  [
    '研究现场单列焦点',
    styleSource,
    /\.focusGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
  ],
  [
    '桌面六步研究时间线',
    styleSource,
    /\.timelineList\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\);/,
  ],
  [
    '窄屏三步研究时间线',
    styleSource,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.timelineList\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/,
  ],
  [
    '移动单列研究时间线',
    styleSource,
    /@media\s*\(max-width:\s*560px\)[\s\S]*?\.timelineList\s*\{[^}]*grid-template-columns:\s*1fr;/,
  ],
  ['研究状态 reduced-motion', styleSource, '@media (prefers-reduced-motion: reduce)'],
  ['全局 reduced-transparency', tokenSource, '@media (prefers-reduced-transparency: reduce)'],
  ['壳层页面横向溢出保护', shellSource, 'overflow-x: hidden;'],
]) {
  const matches = marker instanceof RegExp ? marker.test(source) : source.includes(marker);
  if (!matches) {
    throw new Error(`${label}缺少契约标记：${String(marker)}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  scope: 'UX-06-static',
  responsiveHierarchy: 'single focus column; 6/3/1 timeline columns at desktop/tablet/mobile',
  browserInteraction: 'pending-runtime',
}, null, 2));
