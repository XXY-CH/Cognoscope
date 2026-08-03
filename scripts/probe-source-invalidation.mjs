/**
 * Pure KG-06 fixture: source loss must revoke verification without deleting IDs.
 * Bundle once with the repository's esbuild, then run the generated fixture:
 *   node_modules/.bin/esbuild scripts/probe-source-invalidation.mjs --bundle --platform=node --format=esm --outfile=/tmp/xuesen-probe-source-invalidation.mjs
 *   node /tmp/xuesen-probe-source-invalidation.mjs
 */
import assert from 'node:assert/strict';

const { reconcileSourceRecords } = await import('../src/utils/sourceInvalidation.ts');
const {
  formatEvidenceCitation,
  hasAvailableEvidenceSources,
  isCitationReadyEvidenceRow,
} = await import('../src/utils/evidenceCitation.ts');

const files = [
  {
    id: 'file-a',
    name: 'source-a.pdf',
    type: 'pdf',
    parentId: null,
    sizeBytes: 1,
    updatedAt: '2026-08-03T00:00:00.000Z',
    lastReadAt: null,
    deletedAt: '2026-08-03T01:00:00.000Z',
  },
  {
    id: 'file-b',
    name: 'source-b.pdf',
    type: 'pdf',
    parentId: null,
    sizeBytes: 1,
    updatedAt: '2026-08-03T00:00:00.000Z',
    lastReadAt: null,
    deletedAt: null,
  },
];

const row = {
  id: 'row-1',
  matrixId: 'matrix-1',
  conclusion: '两篇文献都报告了该现象',
  originalProposal: null,
  evidence: [
    {
      id: 'evidence-a',
      rowId: 'row-1',
      fileId: 'file-a',
      annotationId: null,
      annotationBody: null,
      quotedText: '原文摘录 A',
      note: '',
      locator: { kind: 'pdf-page', page: 2, anchor: null },
      provenance: 'ai',
      originalProposal: null,
      match: 'transcript-exact',
      verification: 'verified',
    },
    {
      id: 'evidence-b',
      rowId: 'row-1',
      fileId: 'file-b',
      annotationId: null,
      annotationBody: null,
      quotedText: '原文摘录 B',
      note: '',
      locator: { kind: 'pdf-page', page: 3, anchor: null },
      provenance: 'ai',
      originalProposal: null,
      match: 'transcript-exact',
      verification: 'verified',
    },
  ],
  verification: 'verified',
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
};
const unaffectedRow = {
  ...row,
  id: 'row-2',
  conclusion: '仍有一个可回读来源',
  evidence: [{ ...row.evidence[1], id: 'evidence-b2', rowId: 'row-2' }],
};

const result = reconcileSourceRecords({
  fileIds: ['file-a'],
  rows: [row, unaffectedRow],
  analyses: [{
    id: 'analysis-1',
    matrixId: 'matrix-1',
    comparisonQuestion: '问题',
    extractionState: 'ready',
    extractionError: null,
    items: [{
      id: 'analysis-item-1',
      analysisId: 'analysis-1',
      section: 'findings',
      statement: '结论',
      rationale: '理由',
      rowIds: ['row-1'],
      originalProposal: null,
      verification: 'verified',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }],
  signals: [{
    id: 'signal-1',
    kind: 'authored-stance',
    statement: '立场',
    observation: null,
    status: 'accepted',
    sourceRefs: [{ fileId: 'file-a', sessionId: null, annotationIds: [], rowIds: [], locator: null }],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }, {
    id: 'signal-2',
    kind: 'inferred-interest',
    statement: '经矩阵行间接关联的立场',
    observation: null,
    status: 'accepted',
    sourceRefs: [{ fileId: 'file-b', sessionId: null, annotationIds: [], rowIds: ['row-1'], locator: null }],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }],
  leads: [{
    id: 'lead-1',
    kind: 'evidence-gap',
    title: '线索',
    explanation: '解释',
    status: 'proposed',
    sessionId: null,
    fileIds: ['file-a'],
    signalIds: [],
    rowIds: ['row-1'],
    sourceRefs: [],
    reasons: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }, {
    id: 'lead-2',
    kind: 'contradiction',
    title: '经信号间接关联的线索',
    explanation: '解释',
    status: 'proposed',
    sessionId: null,
    fileIds: [],
    signalIds: ['signal-2'],
    rowIds: [],
    sourceRefs: [],
    reasons: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }],
  timestamp: '2026-08-03T02:00:00.000Z',
});

assert.deepEqual(result.invalidatedRowIds, ['row-1']);
assert.equal(result.rows[0].verification, 'unresolved');
assert.equal(result.rows[0].evidence[0].verification, 'unresolved');
assert.equal(result.rows[0].evidence[1].verification, 'verified');
assert.equal(result.rows[1], unaffectedRow);
assert.equal(result.analyses[0].items[0].verification, 'unresolved');
assert.equal(result.signals[0].status, 'stale');
assert.equal(result.signals[1].status, 'stale');
assert.equal(result.leads[0].status, 'stale');
assert.equal(result.leads[1].status, 'stale');
const repeated = reconcileSourceRecords({
  fileIds: ['file-a'],
  rows: result.rows,
  analyses: result.analyses,
  signals: result.signals,
  leads: result.leads,
  timestamp: '2026-08-03T03:00:00.000Z',
});
assert.equal(repeated.rows[0], result.rows[0]);
assert.equal(repeated.analyses[0], result.analyses[0]);
assert.equal(repeated.signals[0], result.signals[0]);
assert.equal(repeated.signals[1], result.signals[1]);
assert.equal(repeated.leads[0], result.leads[0]);
assert.equal(repeated.leads[1], result.leads[1]);
assert.equal(hasAvailableEvidenceSources(row, files), false);
assert.equal(formatEvidenceCitation([row], files), '');

const restoredFiles = files.map((file) => ({ ...file, deletedAt: null }));
assert.equal(hasAvailableEvidenceSources(row, restoredFiles), true);
assert.equal(formatEvidenceCitation([row], restoredFiles).length > 0, true);

const mixedLegacyRow = {
  ...row,
  id: 'row-mixed-legacy',
  verification: 'verified',
  evidence: row.evidence.map((item) => ({
    ...item,
    rowId: 'row-mixed-legacy',
    verification: item.id === 'evidence-a' ? 'verified' : 'disputed',
  })),
};
assert.equal(isCitationReadyEvidenceRow(mixedLegacyRow, restoredFiles), false);
assert.equal(formatEvidenceCitation([mixedLegacyRow], restoredFiles), '');

const noop = reconcileSourceRecords({
  fileIds: [],
  rows: [row],
  analyses: [],
  signals: [],
  leads: [],
});
assert.equal(noop.rows[0], row);

console.log(JSON.stringify({
  ok: true,
  invalidatedRows: result.invalidatedRowIds,
  staleSignals: result.changedSignalIds,
  staleLeads: result.changedLeadIds,
  restoredNavigation: true,
  restoredVerification: 'requires-user-reverify',
}));
