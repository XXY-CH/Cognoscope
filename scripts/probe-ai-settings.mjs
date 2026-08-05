/**
 * Static regression probe for local-first AI settings persistence.
 * Browser interaction remains covered by the browser QA gate when available.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(
  new URL('../src/components/layout/SettingsDrawer.tsx', import.meta.url),
  'utf8',
);
const saveBlock = source.slice(source.indexOf('const handleSave'));

assert.match(
  saveBlock,
  /setAiSettings\(aiDraft\);\s*closeSettings\(\);\s*toast\.show\('已保存'\);/,
);
assert.match(saveBlock, /toast\.warning\('已保存到本机；后端暂不可用/);
assert.match(saveBlock, /void \(async \(\) => \{/);

console.log(JSON.stringify({
  ok: true,
  scope: 'AI-settings-local-first',
  backendSync: 'best-effort',
  localSaveOnBackendFailure: true,
}, null, 2));
