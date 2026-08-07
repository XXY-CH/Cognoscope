/**
 * Phase 006 static contract probe for the five research-map projections.
 * Browser interaction remains a separate gate because this probe only checks
 * source-level boundaries and bounded projection rules.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [toolbar, page, argument, materials, comparison, projections] = await Promise.all([
  read('src/features/knowledge-graph/GraphToolbar.tsx'),
  read('src/features/knowledge-graph/KnowledgeGraphPage.tsx'),
  read('src/features/knowledge-graph/ArgumentView.tsx'),
  read('src/features/knowledge-graph/MaterialsHierarchyView.tsx'),
  read('src/features/knowledge-graph/ComparisonEvolutionView.tsx'),
  read('src/features/knowledge-graph/researchMapProjections.ts'),
]);

for (const view of [
  "'materials'",
  "'argument'",
  "'comparison'",
  "'evolution'",
  "'explore'",
]) {
  assert.ok(toolbar.includes(view), `missing GraphView projection: ${view}`);
}
for (const label of ['资料', '论证', '比较', '演化', '探索']) {
  assert.ok(toolbar.includes(`'${label}'`) || toolbar.includes(`>${label}<`), `missing toolbar label: ${label}`);
}

assert.match(argument, /slice\(0, 10\)/, 'argument claims must stay bounded');
assert.match(argument, /slice\(0, 20\)/, 'argument evidence anchors must stay bounded');
assert.match(argument, /supports|contradicts|qualifies|extends/, 'argument relation labels missing');
assert.match(argument, /AI 提议 · 线索/, 'AI candidates must remain explicitly clues');
assert.match(materials, /DEFAULT_MAX_VISIBLE_NODES/, 'materials hierarchy needs a bounded cap');
assert.match(materials, /toggleCluster|aria-expanded/, 'materials hierarchy must support cluster collapse');
assert.match(comparison, /主张 \/ 条件/, 'comparison must expose claim-by-paper geometry');
assert.match(comparison, /来源不可回读/, 'comparison must distinguish unavailable source actions');
assert.match(projections, /buildArgumentProjection|buildComparisonProjection|buildEvolutionEvents|buildMaterialsHierarchy/, 'projection selectors missing');
assert.match(projections, /判断自动降级为待审视/, 'stale source must downgrade evolution judgments');
assert.match(page, /<ArgumentView/, 'argument view is not integrated');
assert.match(page, /<MaterialsHierarchyView/, 'materials view is not integrated');
assert.match(page, /<ComparisonEvolutionView/, 'comparison/evolution view is not integrated');
assert.match(page, /evidence-matrix\/\$\{encodeURIComponent\(matrixId\)\}/, 'matrix return route is missing');

console.log(JSON.stringify({
  ok: true,
  scope: 'RM-02/RM-03/RM-04',
  guarantees: [
    'five-task-view-toolbar',
    'claim-and-anchor-bounds',
    'bounded-materials-hierarchy',
    'matrix-summary-and-evolution-return',
    'stale-source-downgrade',
    'browser-gate-separate',
  ],
}, null, 2));
