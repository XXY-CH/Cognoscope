/**
 * Static contract probe for the browser-to-backend AI proxy.
 * Network behavior is verified separately with a local OpenAI-compatible fixture.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [frontend, route, client] = await Promise.all([
  read('src/utils/aiChat.ts'),
  read('backend/cognoscope/api/routes/ai.py'),
  read('backend/cognoscope/infrastructure/ai/client.py'),
]);

assert.match(frontend, /API_BASE[\s\S]*\/ai\/chat/);
assert.match(frontend, /\/ai\/chat\/stream/);
assert.doesNotMatch(frontend, /normalizeBaseUrl|Authorization:\s*`Bearer/);
assert.match(route, /@router\.post\("\/ai\/chat"/);
assert.match(route, /@router\.post\("\/ai\/chat\/stream"/);
assert.match(route, /StreamingResponse/);
assert.match(client, /async def stream_chat_completion/);
assert.match(client, /client\.stream\(/);

console.log(JSON.stringify({
  ok: true,
  scope: 'ai-backend-proxy',
  nonStreaming: '/api/v1/ai/chat',
  streaming: '/api/v1/ai/chat/stream',
  browserProviderRequest: false,
}, null, 2));
