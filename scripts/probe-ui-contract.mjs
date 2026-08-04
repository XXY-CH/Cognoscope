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
  ['研究状态四项指标', pageSource, '<span>来源失效</span>'],
  ['桌面四列指标', styleSource, 'grid-template-columns: repeat(4, minmax(0, 1fr));'],
  ['窄桌面两列指标', styleSource, 'grid-template-columns: repeat(2, minmax(0, 1fr));'],
  ['移动单列指标', styleSource, 'grid-template-columns: 1fr;'],
  ['研究状态 reduced-motion', styleSource, '@media (prefers-reduced-motion: reduce)'],
  ['全局 reduced-transparency', tokenSource, '@media (prefers-reduced-transparency: reduce)'],
  ['壳层页面横向溢出保护', shellSource, 'overflow-x: hidden;'],
]) {
  if (!source.includes(marker)) {
    throw new Error(`${label}缺少契约标记：${marker}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  scope: 'UX-06-static',
  responsiveMetrics: '4/2/1 columns at desktop/tablet/mobile',
  browserInteraction: 'pending-runtime',
}, null, 2));
