/**
 * RM-01 executable relation projection fixture.
 *
 * Bundle before running because the DB modules use repository-local
 * extensionless imports:
 *   node_modules/.bin/esbuild scripts/probe-graph-relations-fixture.mjs --bundle --platform=node --format=esm --outfile=/tmp/xuesen-probe-graph-relations-fixture.mjs
 *   node /tmp/xuesen-probe-graph-relations-fixture.mjs
 */
import assert from 'node:assert/strict';

const {
  isCitationReadyResearchRelation,
  normalizeRelationOrigin,
  projectGraphEdgeToRelation,
  projectLegacyEdgeToRelation,
  projectLegacyKeywordEdge,
  reconcileResearchRelationEvidence,
} = await import('../src/utils/graphEvidence.ts');
const { filterResearchRelations } = await import(
  '../src/features/knowledge-graph/graphFilters.ts'
);
const {
  edgeRecordId,
  graphEdgeFromRecord,
  graphEdgeRecordFromEdge,
} = await import('../src/db/graph.ts');
const {
  keywordEdgeFromRecord,
  keywordEdgeRecordFromEdge,
} = await import('../src/db/keywordGraph.ts');

const legacy = projectLegacyEdgeToRelation({
  source: 'file-a',
  target: 'file-b',
  weight: 0.7,
});
assert.equal(legacy.type, 'unknown');
assert.equal(legacy.origin, 'unknown');
assert.equal(legacy.status, 'clue');
assert.equal(legacy.reason, '来源未记录');
assert.deepEqual(legacy.evidenceAnchorIds, []);
assert.deepEqual(legacy.evidenceRowIds, []);

const cooccurrence = projectLegacyEdgeToRelation({
  source: 'file-a',
  target: 'file-b',
  weight: 1.4,
  origin: 'cooccurrence',
  reason: '关键词共现',
});
assert.equal(cooccurrence.type, 'relates');
assert.equal(cooccurrence.origin, 'rule');
assert.equal(cooccurrence.navigationWeight, 1);

const paperConcept = projectLegacyEdgeToRelation(
  {
    source: 'file-a',
    target: 'topic-method',
    weight: 0.35,
    origin: 'cooccurrence',
    reason: '主题来自论文元数据',
  },
  { sourceKind: 'paper', targetKind: 'concept' },
);
assert.equal(paperConcept.type, 'mentions');
assert.deepEqual(paperConcept.sourceRef, { kind: 'paper', id: 'file-a' });
assert.deepEqual(paperConcept.targetRef, {
  kind: 'concept',
  id: 'topic-method',
});
const reversePaperConcept = projectLegacyEdgeToRelation(
  {
    source: 'topic-method',
    target: 'file-a',
    origin: 'cooccurrence',
  },
  { sourceKind: 'concept', targetKind: 'paper' },
);
assert.equal(reversePaperConcept.type, 'relates');
const reversePaperConceptUnknown = projectLegacyEdgeToRelation(
  { source: 'topic-method', target: 'file-a' },
  { sourceKind: 'concept', targetKind: 'paper' },
);
assert.equal(reversePaperConceptUnknown.type, 'unknown');
const scopePaper = projectLegacyEdgeToRelation(
  {
    source: 'scope-a',
    target: 'file-a',
    origin: 'cooccurrence',
  },
  { sourceKind: 'scope', targetKind: 'paper' },
);
assert.equal(scopePaper.type, 'contains');
const reverseScopePaper = projectLegacyEdgeToRelation(
  {
    source: 'file-a',
    target: 'scope-a',
    origin: 'cooccurrence',
  },
  { sourceKind: 'paper', targetKind: 'scope' },
);
assert.equal(reverseScopePaper.type, 'relates');
const reverseScopePaperUnknown = projectLegacyEdgeToRelation(
  { source: 'file-a', target: 'scope-a' },
  { sourceKind: 'paper', targetKind: 'scope' },
);
assert.equal(reverseScopePaperUnknown.type, 'unknown');
const paperConceptFromNodes = projectGraphEdgeToRelation(
  {
    source: 'paper-node',
    target: 'topic-node',
    weight: 0.35,
    origin: 'cooccurrence',
  },
  [
    {
      id: 'paper-node',
      fileId: 'file-a',
      label: 'Paper A',
      kind: 'file',
      x: null,
      y: null,
    },
    {
      id: 'topic-node',
      label: 'method',
      aliases: [],
      paperNodeIds: ['paper-node'],
      x: null,
      y: null,
    },
  ],
);
assert.equal(paperConceptFromNodes.type, 'mentions');

const explicit = projectLegacyEdgeToRelation({
  source: 'claim-1',
  target: 'evidence-1',
  weight: 0.9,
  relationType: 'supports',
  status: 'verified',
  origin: 'manual',
  reason: '用户绑定的关系',
  evidenceAnchorIds: ['anchor-2', 'anchor-1', 'anchor-2', '  '],
  evidenceRowIds: ['row-2', ' row-1 '],
  conditionIds: ['condition-1'],
});
assert.equal(explicit.type, 'supports');
assert.equal(explicit.status, 'verified');
assert.equal(explicit.origin, 'user');
assert.deepEqual(explicit.evidenceAnchorIds, ['anchor-1', 'anchor-2']);
assert.deepEqual(explicit.evidenceRowIds, ['row-1', 'row-2']);
assert.equal(isCitationReadyResearchRelation(explicit), false);

const supportsForward = projectLegacyEdgeToRelation({
  source: 'claim-1',
  target: 'evidence-1',
  weight: 0.5,
  relationType: 'supports',
});
const supportsReverse = projectLegacyEdgeToRelation({
  source: 'evidence-1',
  target: 'claim-1',
  weight: 0.5,
  relationType: 'supports',
});
const contradicts = projectLegacyEdgeToRelation({
  source: 'claim-1',
  target: 'evidence-1',
  weight: 0.5,
  relationType: 'contradicts',
});
assert.notEqual(supportsForward.id, supportsReverse.id);
assert.notEqual(supportsForward.id, contradicts.id);
assert.notEqual(
  edgeRecordId('claim-1', 'evidence-1', 'supports'),
  edgeRecordId('claim-1', 'evidence-1', 'contradicts'),
);
assert.notEqual(
  edgeRecordId('claim-1', 'evidence-1', 'supports'),
  edgeRecordId('evidence-1', 'claim-1', 'supports'),
);
const typedEdge = {
  source: 'claim-1',
  target: 'evidence-1',
  weight: 0.8,
  origin: 'manual',
  reason: '显式关系',
  relationType: 'supports',
  status: 'review',
  evidenceAnchorIds: ['item-1'],
  evidenceRowIds: ['row-1'],
  conditionIds: ['condition-1'],
};
const typedRecord = graphEdgeRecordFromEdge(typedEdge);
assert.equal(
  typedRecord.id,
  edgeRecordId('claim-1', 'evidence-1', 'supports'),
);
assert.deepEqual(graphEdgeFromRecord(typedRecord), typedEdge);
const keywordTypedEdge = {
  source: 'concept-a',
  target: 'concept-b',
  weight: 0.6,
  origin: 'ai',
  reason: '语义相似',
  relationType: 'relates',
  status: 'review',
  evidenceAnchorIds: ['anchor-1'],
  evidenceRowIds: ['row-1'],
  conditionIds: ['condition-1'],
};
const keywordTypedRecord = keywordEdgeRecordFromEdge(keywordTypedEdge);
assert.deepEqual(keywordEdgeFromRecord(keywordTypedRecord), keywordTypedEdge);
const contradictRecord = graphEdgeRecordFromEdge({
  source: 'claim-1',
  target: 'evidence-1',
  weight: 0.8,
  relationType: 'contradicts',
});
const typedRecords = new Map([
  [typedRecord.id, typedRecord],
  [contradictRecord.id, contradictRecord],
]);
assert.equal(typedRecords.size, 2);
assert.equal(
  graphEdgeFromRecord(typedRecords.get(typedRecord.id)).source,
  'claim-1',
);
assert.deepEqual(
  graphEdgeFromRecord({
    id: 'file-a__file-b',
    source: 'file-a',
    target: 'file-b',
    weight: 0.4,
  }),
  { source: 'file-a', target: 'file-b', weight: 0.4 },
);

const verifiedRow = {
  id: 'row-1',
  matrixId: 'matrix-1',
  conclusion: '结论',
  originalProposal: null,
  verification: 'verified',
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  evidence: [
    {
      id: 'item-1',
      rowId: 'row-1',
      fileId: 'file-a',
      annotationId: null,
      annotationBody: null,
      quotedText: '不可复制到关系记录',
      note: '',
      locator: { kind: 'pdf-page', page: 4, anchor: null },
      provenance: 'user',
      originalProposal: null,
      match: 'annotation-exact',
      verification: 'verified',
    },
  ],
};
const validFile = {
  id: 'file-a',
  name: 'paper-a.pdf',
  type: 'pdf',
  parentId: null,
  sizeBytes: 1,
  updatedAt: '2026-08-07T00:00:00.000Z',
  lastReadAt: null,
  deletedAt: null,
};
const bound = reconcileResearchRelationEvidence(
  { ...explicit, evidenceAnchorIds: ['item-1'], evidenceRowIds: ['row-1'] },
  { rows: [verifiedRow], files: [validFile] },
);
assert.equal(bound.status, 'verified');
assert.equal(bound.reason.includes('不可复制到关系记录'), false);
assert.deepEqual(bound.evidenceRowIds, ['row-1']);
assert.equal(
  reconcileResearchRelationEvidence(
    { ...bound, status: 'stale' },
    { rows: [verifiedRow], files: [validFile] },
  ).status,
  'verified',
);
assert.equal(
  reconcileResearchRelationEvidence(
    { ...bound, status: 'review', evidenceRowIds: ['missing-row'] },
    { rows: [verifiedRow], files: [validFile] },
  ).status,
  'stale',
);
assert.equal(
  reconcileResearchRelationEvidence(
    { ...bound, status: 'review', evidenceAnchorIds: ['item-1'] },
    { rows: [{ ...verifiedRow, verification: 'disputed' }], files: [validFile] },
  ).status,
  'disputed',
);

const keywordRelation = projectLegacyKeywordEdge({
  source: 'concept-a',
  target: 'concept-b',
  weight: 0.4,
  origin: 'ai',
});
assert.equal(keywordRelation.type, 'relates');
assert.equal(keywordRelation.sourceRef.kind, 'concept');
assert.equal(keywordRelation.targetRef.kind, 'concept');
assert.equal(normalizeRelationOrigin(undefined), 'unknown');

const filtered = filterResearchRelations(
  [legacy, cooccurrence, explicit],
  { statuses: ['clue', 'review'] },
);
assert.deepEqual(filtered, [legacy, cooccurrence]);

console.log(
  JSON.stringify(
    {
      ok: true,
      scope: 'RM-01-fixture',
      guarantees: [
        'legacy-unknown-clue',
        'cooccurrence-rule-origin',
        'paper-concept-mentions',
        'stable-reference-deduplication',
        'semantic-and-directional-identity',
        'explicit-evidence-status-reconciliation',
        'legacy-and-typed-record-roundtrip',
        'graph-not-citation-ready',
        'pure-status-filter',
      ],
    },
    null,
    2,
  ),
);
