/**
 * Static contract for resilient paper inclusion: AI edge suggestions are
 * optional and must not prevent the paper node/member from being persisted.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('../src/stores/graphStore.ts', import.meta.url),
  'utf8',
);

const edgeBlockStart = source.indexOf('let newEdges: GraphEdge[] = [];');
const edgeBlockEnd = source.indexOf('await graphDb.putGraphNode(node);', edgeBlockStart);
assert.ok(edgeBlockStart >= 0, 'graph edge analysis block is present');
assert.ok(edgeBlockEnd > edgeBlockStart, 'node persistence follows edge analysis');

const edgeBlock = source.slice(edgeBlockStart, edgeBlockEnd);
assert.match(edgeBlock, /try \{/);
assert.match(edgeBlock, /suggestGraphEdgesWithAi\(/);
assert.match(edgeBlock, /catch \{/);
assert.match(edgeBlock, /edgeAnalysisUnavailable = true;/);
assert.match(source.slice(edgeBlockEnd), /await graphDb\.putGraphMember\(ok\);/);
assert.match(source.slice(edgeBlockEnd), /toast\.warning\('论文已加入图谱，AI 关联分析暂不可用，可稍后重试'\)/);

console.log(JSON.stringify({
  ok: true,
  scope: 'knowledge-graph-inclusion',
  guarantee: 'AI edge suggestion failure cannot block paper node persistence',
}, null, 2));
