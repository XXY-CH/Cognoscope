/**
 * seedSessions.ts - 仪表盘演示会话数据（本地无数据时写入）
 * 所属：B · 个人仪表盘
 * 规范参考：UI_spec.md §5 / §9
 */
import type {
  DistractionEvent,
  DistractionKind,
  MetricSample,
  ReadingSession,
} from '../types';
import { createId } from './id';

const KINDS: DistractionKind[] = [
  'drink',
  'talk',
  'away',
  'phone',
  'yawn',
  'gaze_off',
];

function samples(
  durationSec: number,
  base: number,
  wave: number,
): MetricSample[] {
  const points: MetricSample[] = [];
  const step = Math.max(30, Math.floor(durationSec / 40));
  for (let t = 0; t <= durationSec; t += step) {
    const noise = Math.sin(t / 180) * wave + Math.cos(t / 95) * (wave * 0.4);
    points.push({
      atSec: t,
      value: Math.min(100, Math.max(0, Math.round(base + noise))),
    });
  }
  return points;
}

function distractions(durationSec: number, count: number): DistractionEvent[] {
  const list: DistractionEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = KINDS[i % KINDS.length];
    const atSec = Math.floor(((i + 1) / (count + 1)) * durationSec);
    list.push({
      id: createId('dist'),
      kind,
      atSec,
      durationSec: 20 + (i % 5) * 15,
      confidence: 0.55 + (i % 4) * 0.1,
      dismissed: false,
      kindEditedByUser: false,
    });
  }
  return list;
}

/**
 * 生成最近约 30 天内的若干演示会话，供图表与热力图展示
 */
export function buildDemoSessions(now = Date.now()): ReadingSession[] {
  const sessions: ReadingSession[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (let d = 0; d < 28; d += 1) {
    // 约 70% 天数有阅读
    if (d % 3 === 1) continue;
    const start = new Date(now - d * dayMs);
    start.setHours(9 + (d % 5), 10 + (d % 20), 0, 0);
    const durationSec = 25 * 60 + (d % 7) * 8 * 60;
    const ended = new Date(start.getTime() + durationSec * 1000);
    const linesRead = 800 + d * 37 + (d % 5) * 120;
    const focusBase = 72 - (d % 6) * 3;
    const fatigueBase = 28 + (d % 5) * 6;

    sessions.push({
      id: createId('sess'),
      fileId: `demo-file-${d % 4}`,
      startedAt: start.toISOString(),
      endedAt: ended.toISOString(),
      durationSec,
      linesRead,
      focusSamples: samples(durationSec, focusBase, 12),
      fatigueSamples: samples(durationSec, fatigueBase, 10),
      distractions: distractions(durationSec, 3 + (d % 4)),
    });
  }

  return sessions;
}
