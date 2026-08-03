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

const [appSource, dbSource, storeSource, typeSource, analysisSource, analysisPanelSource, qaSource, dataPanelSource, sessionSource, digestStructureSource, summarySource, digestDialogSource, qaPanelSource, invalidationSource, citationSource, currentStateSource, fileStoreSource, matrixPageSource, rowEditorSource, eventSource, leadReviewSource, evidenceRowsDbSource, evidenceAnalysisDbSource, researchSignalsDbSource, researchLeadsDbSource] = await Promise.all([
  fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/index.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/stores/evidenceMatrixStore.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/utils/evidenceAnalysisParse.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/evidence-matrix/EvidenceAnalysisPanel.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/stores/qaStore.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/components/layout/settings/DataPanel.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/hooks/useReadingSession.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/utils/digestStructure.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/research-state/PostReadingSummary.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/reader/DigestDialog.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/reader/panels/QAPanel.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/sourceInvalidation.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/utils/evidenceCitation.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/utils/currentResearchState.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/stores/fileStore.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/evidence-matrix/EvidenceMatrixPage.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/evidence-matrix/EvidenceRowEditor.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/utils/sourceInvalidationEvents.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/features/research-state/ResearchLeadReview.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/evidenceRows.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/evidenceAnalyses.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/researchSignals.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/db/researchLeads.ts', import.meta.url), 'utf8'),
]);
for (const [label, source, marker] of [
  ['App 路由', appSource, "path: 'evidence-matrix'"],
  ['IndexedDB 矩阵 store', dbSource, 'evidenceMatrices'],
  ['IndexedDB 证据行 store', dbSource, 'evidenceRows'],
  ['EvidenceMatrix 类型', typeSource, 'interface EvidenceMatrix'],
  ['EvidenceRow 类型', typeSource, 'interface EvidenceRow'],
  ['EvidenceAnalysis 类型', typeSource, 'interface EvidenceAnalysis'],
  ['IndexedDB 分析 store', dbSource, 'evidenceAnalyses'],
  ['IndexedDB v11 schema', dbSource, 'const DB_VERSION = 11'],
  ['IndexedDB QA store', dbSource, 'qaMessages'],
  ['v10 → v11 upgrade hook', dbSource, 'upgrade(db, oldVersion'],
  ['分析引用校验', analysisSource, 'validIds'],
  ['三栏分析面板', analysisPanelSource, '研究空白与机会'],
  ['矩阵写入串行化', storeSource, 'function enqueuePersistence'],
  ['打开结果过期保护', storeSource, 'let navigationEpoch = 0'],
  ['提取请求过期保护', storeSource, 'const isCurrentRequest'],
  ['分析请求过期保护', storeSource, 'const isCurrentAnalysis'],
  ['QA 持久化代数', qaSource, 'let persistenceGeneration = 0'],
  ['QA 写入失败可见', qaSource, 'const persistOrReport'],
  ['清空 AI 先取消活动流', dataPanelSource, 'clearQaState();'],
  ['StrictMode 会话复用窗口', sessionSource, 'STRICT_MODE_REUSE_WINDOW_MS'],
  ['会话行数原子更新', sessionSource, 'updateSessionLines'],
  ['整理栏目完整性门禁', digestStructureSource, 'REQUIRED_HEADINGS'],
  ['整理工作记忆边界', summarySource, '不是引用材料'],
  ['整理弹窗工作记忆边界', digestDialogSource, '不是引用材料'],
  ['文件切换清理 QA 草稿', qaPanelSource, 'setQuotePage(null)'],
  ['清除批注书签内存状态', dataPanelSource, 'clearAnnotationState();'],
  ['来源失效事务', invalidationSource, 'invalidateSourceReferences'],
  ['来源失效降级纯函数', invalidationSource, 'reconcileSourceRecords'],
  ['引用来源可用性门禁', citationSource, 'isCitationReadyEvidenceRow'],
  ['证据行写入来源复核', evidenceRowsDbSource, "['files', 'evidenceRows']"],
  ['分析写入来源复核', evidenceAnalysisDbSource, "['files', 'evidenceRows', 'evidenceAnalyses']"],
  ['当前状态来源失效计数', currentStateSource, 'staleSourceCount'],
  ['当前状态 stale 研究记录计数', currentStateSource, 'staleLeadCount'],
  ['软删除调用来源失效', fileStoreSource, 'invalidateSourceReferences('],
  ['矩阵复制来源门禁', matrixPageSource, 'isCitationReadyEvidenceRow(row, files)'],
  ['矩阵回读 locator 门禁', matrixPageSource, 'isResolvableLocator(item.locator, file.type)'],
  ['证据行来源失效状态', rowEditorSource, '来源失效'],
  ['来源失效内存通知', eventSource, 'emitSourceInvalidation'],
  ['跨标签页来源失效广播', eventSource, 'BroadcastChannel'],
  ['stale 线索不可操作', leadReviewSource, "lead.status === 'stale'"],
  ['分析写入依赖复核', evidenceAnalysisDbSource, 'nonCitationReadyRowIds'],
  ['信号写入间接依赖复核', researchSignalsDbSource, 'nonCitationReadyRowIds'],
  ['线索写入间接依赖复核', researchLeadsDbSource, 'nonCitationReadyRowIds'],
  ['直接 locator 来源复核', researchSignalsDbSource, 'unavailableSourceIdsForReferences'],
  ['线索直接 locator 来源复核', researchLeadsDbSource, 'unavailableSourceIdsForReferences'],
]) {
  if (!source.includes(marker)) throw new Error(`${label}缺少契约标记：${marker}`);
}

console.log(JSON.stringify({
  ok: true,
  route: routeUrl,
  rootShell: true,
  browserInteraction: process.env.EVIDENCE_PROBE_BROWSER_URL ? 'delegated' : 'not-configured',
  migrationSchema: 'v10-to-v11-additive-qa-store',
  contracts: [
    'route',
    'evidenceMatrices',
    'evidenceRows',
    'evidenceAnalyses',
    'EvidenceMatrix',
    'EvidenceRow',
    'EvidenceAnalysis',
    'qaMessages',
    'serialized-persistence',
    'stale-open-guard',
    'stale-request-guards',
    'qa-persistence-generation',
    'qa-clear-stream-invalidation',
    'strictmode-session-reuse',
    'atomic-session-line-update',
    'file-switch-draft-reset',
    'notes-clear-memory-refresh',
    'source-invalidation-transaction',
    'source-invalidation-reconciliation',
    'cross-tab-write-guards',
    'citation-source-gate',
    'current-state-stale-source-count',
    'digest-heading-gate',
    'digest-provenance-warning',
  ],
}, null, 2));
