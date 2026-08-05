/**
 * Static guardrail for graph canvas scale and node-size semantics.
 * Browser screenshots remain a separate QA gate when a runtime is available.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('../src/features/knowledge-graph/GraphCanvas.tsx', import.meta.url),
  'utf8',
);
const pageSource = await fs.readFile(
  new URL('../src/features/knowledge-graph/KnowledgeGraphPage.tsx', import.meta.url),
  'utf8',
);
const inspectorSource = await fs.readFile(
  new URL('../src/features/knowledge-graph/GraphInspector.tsx', import.meta.url),
  'utf8',
);
const inspectorCss = await fs.readFile(
  new URL('../src/features/knowledge-graph/GraphInspector.module.css', import.meta.url),
  'utf8',
);
const pageCss = await fs.readFile(
  new URL('../src/features/knowledge-graph/KnowledgeGraphPage.module.css', import.meta.url),
  'utf8',
);

assert.match(source, /const GRAPH_MIN_ZOOM = 0\.25;/);
assert.match(source, /const GRAPH_MAX_ZOOM = 4;/);
assert.match(source, /minZoom=\{GRAPH_MIN_ZOOM\}/);
assert.match(source, /maxZoom=\{GRAPH_MAX_ZOOM\}/);
assert.match(source, /d3Force\('charge'\)/);
assert.match(source, /strength\(-180\)/);
assert.match(source, /d3Force\('link'\)/);
assert.match(source, /distance\(\(edge: any\)/);
assert.match(source, /d3ReheatSimulation\(\)/);
assert.match(source, /onEngineStop=\{\(\) =>/);
assert.match(source, /zoomToFit\(reducedMotion \? 0 : 260, 48\)/);
assert.match(source, /cooldownTicks=\{reducedMotion \? 0 : 220\}/);
assert.match(source, /warmupTicks=\{reducedMotion \? 80 : 24\}/);
assert.match(source, /graphDataContentRef/);
assert.match(source, /sameLayout/);
assert.match(source, /node\.fx = node\.x;/);
assert.match(source, /node\.fy = node\.y;/);
assert.match(source, /isEmphasized\(node\.id\) \? 1\.1 : 1\.0/);
assert.match(source, /case 'file':[\s\S]*?return 5 \* baseSize;/);
assert.match(source, /case 'folder':[\s\S]*?return 7 \* baseSize;/);
assert.match(source, /case 'tag':[\s\S]*?return 4 \* baseSize;/);
assert.match(pageSource, /fitKey=\{view\}/);
assert.doesNotMatch(pageSource, /freezeLayout/);
assert.match(pageSource, /paperKeywordEdges\(visibleKeywordNodes, visiblePaperIdSet\)/);
assert.match(pageSource, /scopeRailCollapsed/);
assert.match(pageSource, /PanelLeft(?:Open|Close)/);
assert.match(inspectorSource, /metadataRelationProjection/);
assert.match(inspectorSource, /relationSupportLabel/);
assert.match(inspectorCss, /\.body[\s\S]*?overflow: auto;/);
assert.match(inspectorCss, /\.subtitle[\s\S]*?flex-wrap: wrap;/);
assert.match(pageCss, /\.workbenchCollapsed/);
assert.match(pageCss, /\.scopeToggle/);

console.log(JSON.stringify({
  ok: true,
  scope: 'knowledge-graph-canvas',
  zoomRange: [0.25, 4],
  nodeDiametersAtMaxZoom: { file: 40, tag: 32, folder: 56 },
}, null, 2));
