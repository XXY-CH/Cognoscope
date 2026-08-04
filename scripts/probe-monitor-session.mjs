/**
 * Deterministic monitor-session conversion probe.
 *
 * Bundle this file with esbuild before running it because the adapter imports
 * TypeScript modules and the repository intentionally has no test runner.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const frame = (timestamp, frameNumber, overrides = {}) => ({
  timestamp,
  frame: frameNumber,
  labels: {
    playing_phone: false,
    head_down: false,
    gaze_center: true,
    drinking: false,
    chatting: false,
    engagement: 'engaged',
    ...overrides.labels,
  },
  metrics: {
    focus_score: 80,
    yaw: 1,
    pitch: 2,
    gaze_h: 0.5,
    gaze_v: 0.5,
    mar: 0.01,
    eng_boredom: 0.05,
    eng_confusion: 0.05,
    eng_engagement: 0.8,
    eng_frustration: 0.1,
    ...overrides.metrics,
  },
});

const jsonl = [
  frame(1000, 0),
  frame(1000.5, 1, { labels: { playing_phone: true } }),
  frame(1001, 2, { labels: { playing_phone: true } }),
  frame(1001.5, 3, { labels: { playing_phone: true } }),
  frame(1002, 4),
  '{malformed}',
].map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');

const { loadMonitorSession, convertToReadingSession } = await import(
  '../src/utils/monitorAdapter.ts'
);
const repoRoot = process.cwd();
const [readerSource, sessionsSource, sessionStoreSource] = await Promise.all([
  fs.readFile(path.join(repoRoot, 'src/features/reader/ReaderPage.tsx'), 'utf8'),
  fs.readFile(path.join(repoRoot, 'src/db/sessions.ts'), 'utf8'),
  fs.readFile(path.join(repoRoot, 'src/stores/sessionStore.ts'), 'utf8'),
]);

const frames = loadMonitorSession(jsonl);
assert.equal(frames.length, 5);
const session = convertToReadingSession(frames, 'file-current');
assert.ok(session);
assert.equal(session.fileId, 'file-current');
assert.equal(session.durationSec, 2);
assert.equal(session.endedAt, new Date(1002 * 1000).toISOString());
assert.equal(session.focusSamples.length, 1);
assert.equal(session.distractions.length, 1);
assert.equal(session.distractions[0].kind, 'phone');
assert.equal(session.distractions[0].durationSec, 1);
assert.equal(convertToReadingSession([], 'file-current'), null);

// The adapter rounds ReadingSession.durationSec for display; eligibility must
// use the raw timestamps so a 4.5s monitor fragment stays excluded.
const shortSession = convertToReadingSession(
  [frame(2000, 0), frame(2004.5, 1)],
  'file-current',
);
assert.ok(shortSession);
assert.equal(shortSession.durationSec, 5);
assert.ok(
  (Date.parse(shortSession.endedAt ?? '') - Date.parse(shortSession.startedAt)) /
    1000 < 5,
);

for (const [source, marker] of [
  [readerSource, 'await stopDetection(currentFileId);'],
  [readerSource, 'stopped.fileId === currentFileId ? stopped.sessionId'],
  [readerSource, 'pySessionIdsRef.current.get(currentFileId)'],
  [readerSource, 'pySessionIdsRef.current.set(activeFileId, result.sessionId)'],
  [readerSource, "result.status === 'started'"],
  [readerSource, 'result.fileId === activeFileId'],
  [readerSource, 'const MIN_MONITOR_SESSION_SEC = 5;'],
  [readerSource, 'monitorDurationSec >= MIN_MONITOR_SESSION_SEC'],
  [sessionsSource, 'export async function updateSessionMonitorData('],
  [sessionsSource, "const tx = db.transaction('sessions', 'readwrite');"],
  [sessionsSource, 'export async function updateSessionDistraction('],
  [sessionStoreSource, 'mergeSession: (session)'],
  [readerSource, 'result.status === \'started\''],
  [readerSource, 'result.fileId === activeFileId'],
]) {
  assert.ok(source.includes(marker), `missing monitor contract: ${marker}`);
}

console.log(JSON.stringify({
  ok: true,
  parsedFrames: frames.length,
  mergedDistractions: session.distractions.length,
  monitorFileId: session.fileId,
  emptyFallback: true,
  contracts: ['stop-before-fetch', 'file-scoped-session-id', 'atomic-monitor-merge'],
}, null, 2));
