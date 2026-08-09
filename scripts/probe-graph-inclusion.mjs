/**
 * Runtime contract for resilient paper inclusion: file-scoped join operations
 * must become stale after remove/clear so delayed enhancement work cannot
 * overwrite a newer lifecycle.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(
  new URL('../src/stores/graphStore.ts', import.meta.url),
  'utf8',
);

const controllerMatch = source.match(
  /function createGraphJoinOperationController\(\): GraphJoinOperationController \{[\s\S]*?\n\}/,
);
assert.ok(controllerMatch, 'graph join operation controller is present');

const controllerScript = controllerMatch[0]
  .replace(': GraphJoinOperationController', '')
  .replace('new Map<string, number>()', 'new Map()');
const context = vm.createContext({});
const createController = vm.runInContext(
  `${controllerScript}\ncreateGraphJoinOperationController;`,
  context,
);
assert.equal(typeof createController, 'function');

const controller = createController();
const first = controller.begin('file-a');
assert.equal(controller.isCurrent('file-a', first), true);
controller.finish('file-a', first);
assert.equal(controller.isCurrent('file-a', first), false);

const stale = controller.begin('file-a');
controller.invalidateMany(['file-a']);
assert.equal(
  controller.isCurrent('file-a', stale),
  false,
  'removeFilesFromGraph must stale the in-flight join op',
);

const newer = controller.begin('file-a');
assert.equal(
  controller.isCurrent('file-a', newer),
  true,
  'a new join after invalidation must become the sole current op',
);
assert.equal(
  controller.isCurrent('file-a', stale),
  false,
  'older token must stay stale after a new join starts',
);

const secondFile = controller.begin('file-b');
controller.invalidateAll();
assert.equal(
  controller.isCurrent('file-a', newer),
  false,
  'clearGraph must stale file-a join ops',
);
assert.equal(
  controller.isCurrent('file-b', secondFile),
  false,
  'clearGraph must stale all in-flight join ops',
);

assert.match(
  source,
  /const operationToken = graphJoinOperationController\.begin\(fileId\);/,
  'addFileToGraph must allocate a per-file operation token',
);
assert.match(
  source,
  /graphJoinOperationController\.invalidateMany\(fileIds\);/,
  'removeFilesFromGraph must invalidate file-scoped join ops',
);
assert.match(
  source,
  /graphJoinOperationController\.invalidateAll\(\);/,
  'clearGraph must invalidate all join ops',
);
assert.match(
  source,
  /if \(!graphJoinOperationController\.isCurrent\(fileId, operationToken\)\) \{\s*return get\(\)\.membersByFileId\[fileId\]\?\.status \?\? 'out';\s*\}/,
  'stale join ops must bail out before optional enhancement work',
);
assert.match(
  source,
  /当前离线，关联与关键词增强未运行，请联网后重试/,
  'offline AI should still surface a non-blocking warning and retry path',
);
assert.match(
  source,
  /retryGraphEnrichment: async \(fileId\) =>/,
  'already-in members must have a separate enrichment retry action',
);
assert.match(
  source,
  /member\.status !== 'in' \|\| !member\.nodeId/,
  'retry must only target an existing graph member/node',
);
assert.match(
  source,
  /const nodes = await graphDb\.listGraphNodes\(\)/,
  'retry must recover the existing node from IndexedDB when the in-memory graph is cold',
);
assert.match(
  source,
  /await updateMember\(message\)/,
  'optional enrichment failures must persist a user-facing retry marker',
);
assert.match(
  source,
  /syncAfterPaperIn\(\{[\s\S]*paperNodeId: node\.id/,
  'retry must rerun keyword enrichment against the existing node id',
);
assert.match(
  source,
  /shouldContinue: isCurrent/,
  'keyword enrichment must receive the current join token guard',
);
const keywordStoreSource = await fs.readFile(
  new URL('../src/stores/keywordGraphStore.ts', import.meta.url),
  'utf8',
);
assert.match(
  keywordStoreSource,
  /shouldContinue\?: \(\) => boolean/,
  'keyword enrichment must accept an optional cancellation guard',
);
assert.match(
  keywordStoreSource,
  /if \(shouldContinue && !shouldContinue\(\)\) return;/,
  'keyword enrichment must stop before stale IndexedDB writes',
);
assert.match(
  keywordStoreSource,
  /detachPapers: async \(paperNodeIds\) => \{[\s\S]*await keywordSyncChain;/,
  'paper removal must wait for queued keyword writes before detaching',
);
assert.match(
  await fs.readFile(new URL('../src/features/file-directory/FileGraphBadge.tsx', import.meta.url), 'utf8'),
  /重试关联与关键词增强/,
  'directory badge must expose a retry association action',
);

console.log(JSON.stringify({
  ok: true,
  scope: 'knowledge-graph-inclusion',
  guarantees: [
    'per-file-join-token-runtime-invalidates-on-remove',
    'per-file-join-token-runtime-invalidates-on-clear',
    'newer-join-token-supersedes-older-token',
    'stale-joins-bail-before-optional-enhancement',
    'in-member-persists-retryable-enrichment-warning',
    'retry-reuses-existing-node-and-node-id',
  ],
}, null, 2));
