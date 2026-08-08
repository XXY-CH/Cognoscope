/**
 * Pure RM-05 fixture for bounded local graph exploration.
 * Bundle once with the repository's esbuild, then run the generated fixture:
 *   node_modules/.bin/esbuild scripts/probe-explore-projection.mjs --bundle --platform=node --format=esm --outfile=/tmp/xuesen-probe-explore-projection.mjs
 *   node /tmp/xuesen-probe-explore-projection.mjs
 */
import assert from 'node:assert/strict';

const { buildExploreProjection } = await import(
  '../src/features/knowledge-graph/exploreProjection.ts'
);

const nodes = [
  { id: 'paper-a', fileId: 'file-a', label: 'Paper A', kind: 'file' },
  { id: 'topic-b', fileId: null, label: 'Topic B', kind: 'tag' },
  { id: 'paper-c', fileId: 'file-c', label: 'Paper C', kind: 'file' },
  { id: 'topic-d', fileId: null, label: 'Topic D', kind: 'tag' },
  { id: 'paper-e', fileId: 'file-e', label: 'Paper E', kind: 'file' },
];

const edges = [
  { source: 'paper-a', target: 'topic-b', weight: 0.6, origin: 'cooccurrence' },
  { source: 'topic-b', target: 'paper-c', weight: 0.6, origin: 'cooccurrence' },
  { source: 'paper-c', target: 'topic-d', weight: 0.6, origin: 'cooccurrence' },
  { source: 'topic-b', target: 'paper-e', weight: 0.4, origin: 'ai' },
  { source: 'paper-a', target: 'missing-node', weight: 0.8, origin: 'manual' },
];

const bounded = buildExploreProjection({
  seed: nodes[0],
  nodes,
  edges,
  hopLimit: 2,
  nodeCap: 3,
});

assert.equal(bounded.hasSeed, true);
assert.equal(bounded.seedId, 'paper-a');
assert.deepEqual(
  bounded.frames.map((frame) => [frame.node.id, frame.depth]),
  [
    ['paper-a', 0],
    ['topic-b', 1],
    ['paper-c', 2],
    ['paper-e', 2],
  ],
);
assert.equal(bounded.overflowCount, 1);
assert.deepEqual(
  bounded.edges.map((edge) => `${edge.source}->${edge.target}`),
  ['paper-a->topic-b', 'topic-b->paper-c', 'topic-b->paper-e'],
);

const oneHop = buildExploreProjection({
  seed: nodes[0],
  nodes,
  edges,
  hopLimit: 1,
});
assert.deepEqual(oneHop.frames.map((frame) => frame.node.id), ['paper-a', 'topic-b']);
assert.deepEqual(oneHop.edges.map((edge) => `${edge.source}->${edge.target}`), [
  'paper-a->topic-b',
]);

const missingSeed = buildExploreProjection({
  seed: { ...nodes[0], id: 'unknown' },
  nodes,
  edges,
});
assert.equal(missingSeed.hasSeed, false);
assert.deepEqual(missingSeed.frames, []);
assert.deepEqual(missingSeed.edges, []);

console.log(JSON.stringify({
  ok: true,
  scope: 'RM-05-local-explore',
  guarantees: [
    'one-and-two-hop-boundary',
    'deterministic-frame-order',
    'overflow-count-for-list-fallback',
    'edge-endpoint-closure',
    'missing-seed-stays-empty',
  ],
}, null, 2));
