/**
 * RM-01 relation adapter source-contract probe.
 *
 * This probe intentionally avoids IndexedDB and browser-only imports. It
 * verifies the additive type contract and the pure adapter's conservative
 * projection rules against the checked-in source.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const typesSource = await fs.readFile(
  new URL('../src/types/index.ts', import.meta.url),
  'utf8',
);
const evidenceSource = await fs.readFile(
  new URL('../src/utils/graphEvidence.ts', import.meta.url),
  'utf8',
);
const filtersSource = await fs.readFile(
  new URL('../src/features/knowledge-graph/graphFilters.ts', import.meta.url),
  'utf8',
);
const graphDbSource = await fs.readFile(
  new URL('../src/db/graph.ts', import.meta.url),
  'utf8',
);
const keywordDbSource = await fs.readFile(
  new URL('../src/db/keywordGraph.ts', import.meta.url),
  'utf8',
);

for (const marker of [
  'export type ResearchRelationType',
  'export type ResearchRelationStatus',
  'export type ResearchRelationOrigin',
  'export interface ResearchRelationProjection',
  'relationType?: ResearchRelationType',
  'status?: ResearchRelationStatus',
  'evidenceAnchorIds?: string[]',
  'evidenceRowIds?: string[]',
  'conditionIds?: string[]',
]) {
  assert.ok(typesSource.includes(marker), `missing type-contract marker: ${marker}`);
}

for (const marker of [
  'export function normalizeRelationOrigin',
  "if (origin === 'cooccurrence') return 'rule';",
  "return 'unknown';",
  'export function projectLegacyEdgeToRelation',
  'export function projectGraphEdgeToRelation',
  'stableReferenceIds(edge.evidenceAnchorIds)',
  'stableReferenceIds(edge.evidenceRowIds)',
  'stableReferenceIds(edge.conditionIds)',
  'export function isCitationReadyResearchRelation',
  'return false;',
  'export function reconcileResearchRelationEvidence',
  "status: allVerified\n      ? 'verified'",
]) {
  assert.ok(evidenceSource.includes(marker), `missing adapter-contract marker: ${marker}`);
}

const projectionStart = evidenceSource.indexOf(
  'export function projectLegacyEdgeToRelation',
);
const projectionEnd = evidenceSource.indexOf(
  '/** Explicit aliases',
  projectionStart,
);
assert.ok(projectionStart >= 0 && projectionEnd > projectionStart);
const projectionBlock = evidenceSource.slice(projectionStart, projectionEnd);
assert.doesNotMatch(
  projectionBlock,
  /quotedText|annotationBody|evidenceText/,
  'relation projection must not copy evidence text',
);
assert.match(
  projectionBlock,
  /reason: edge\.reason\?\.trim\(\) \|\| '来源未记录'/,
  'legacy edges must expose an explicit unknown-source reason',
);
assert.match(
  projectionBlock,
  /relationProjectionId\(/,
  'relation ids must include stable endpoints and semantic type',
);

assert.match(
  filtersSource,
  /export function filterResearchRelations/,
  'relation projections need a pure filter selector',
);

for (const [label, source] of [['paper graph DB', graphDbSource]]) {
  for (const marker of [
    'relationType',
    'status',
    'evidenceAnchorIds',
    'evidenceRowIds',
    'conditionIds',
  ]) {
    assert.ok(source.includes(marker), `${label} drops relation field: ${marker}`);
  }
}
assert.match(graphDbSource, /edgeRecordId\(edge\.source, edge\.target, edge\.relationType\)/);
assert.match(graphDbSource, /export function graphEdgeFromRecord/);
assert.match(graphDbSource, /export function graphEdgeRecordFromEdge/);
assert.match(keywordDbSource, /export function keywordEdgeRecordFromEdge/);
assert.match(keywordDbSource, /export function keywordEdgeFromRecord/);
assert.match(keywordDbSource, /return graphEdgeRecordFromEdge\(edge\)/);
assert.match(keywordDbSource, /return graphEdgeFromRecord\(record\)/);
assert.match(keywordDbSource, /all\.map\(keywordEdgeFromRecord\)/);
assert.match(keywordDbSource, /keywordEdgeRecordFromEdge\(e\)/);

console.log(
  JSON.stringify(
    {
      ok: true,
      scope: 'RM-01',
      guarantees: [
        'legacy-origin-normalization',
        'legacy-unknown-defaults',
        'optional-metadata-contract',
      'stable-reference-only-projection',
      'explicit-evidence-status-reconciliation',
      'optional-metadata-db-roundtrip',
      'graph-never-citation-ready',
        'pure-relation-filter',
      ],
    },
    null,
    2,
  ),
);
