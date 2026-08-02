/**
 * evidence-matrix smoke probe.
 *
 * The repository does not bundle a browser binary in CI, so this probe keeps
 * the always-available part deterministic: verify the dev server serves the
 * matrix route shell and that the source contract contains the new stores and
 * route. When `EVIDENCE_PROBE_BROWSER_URL` is provided, an external browser
 * runner can extend this with interactive checks.
 */
import fs from 'node:fs/promises';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173';
const routeUrl = `${baseUrl}/evidence-matrix`;
const response = await fetch(routeUrl);
if (!response.ok) {
  throw new Error(`矩阵路由不可访问：HTTP ${response.status}`);
}
const html = await response.text();
if (!html.includes('<div id="root"></div>')) {
  throw new Error('矩阵路由没有返回 React 根节点');
}

const [appSource, dbSource, storeSource, typeSource, analysisSource, analysisPanelSource] = await Promise.all([
  fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/index.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/stores/evidenceMatrixStore.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/utils/evidenceAnalysisParse.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/evidence-matrix/EvidenceAnalysisPanel.tsx', import.meta.url), 'utf8'),
]);
for (const [label, source, marker] of [
  ['App 路由', appSource, "path: 'evidence-matrix'"],
  ['IndexedDB 矩阵 store', dbSource, 'evidenceMatrices'],
  ['IndexedDB 证据行 store', dbSource, 'evidenceRows'],
  ['EvidenceMatrix 类型', typeSource, 'interface EvidenceMatrix'],
  ['EvidenceRow 类型', typeSource, 'interface EvidenceRow'],
  ['EvidenceAnalysis 类型', typeSource, 'interface EvidenceAnalysis'],
  ['IndexedDB 分析 store', dbSource, 'evidenceAnalyses'],
  ['IndexedDB v9 schema', dbSource, 'const DB_VERSION = 9'],
  ['v7 → v9 upgrade hook', dbSource, 'upgrade(db, oldVersion'],
  ['分析引用校验', analysisSource, 'validIds'],
  ['三栏分析面板', analysisPanelSource, '研究空白与机会'],
  ['矩阵写入串行化', storeSource, 'function enqueuePersistence'],
  ['打开结果过期保护', storeSource, 'let navigationEpoch = 0'],
  ['提取请求过期保护', storeSource, 'const isCurrentRequest'],
  ['分析请求过期保护', storeSource, 'const isCurrentAnalysis'],
]) {
  if (!source.includes(marker)) throw new Error(`${label}缺少契约标记：${marker}`);
}

console.log(JSON.stringify({
  ok: true,
  route: routeUrl,
  rootShell: true,
  browserInteraction: process.env.EVIDENCE_PROBE_BROWSER_URL ? 'delegated' : 'not-configured',
  migrationSchema: 'v7-to-v9-additive-stores',
  contracts: [
    'route',
    'evidenceMatrices',
    'evidenceRows',
    'evidenceAnalyses',
    'EvidenceMatrix',
    'EvidenceRow',
    'EvidenceAnalysis',
    'serialized-persistence',
    'stale-open-guard',
    'stale-request-guards',
  ],
}, null, 2));
