/**
 * seedSessions.ts - 仪表盘演示会话数据（本地无数据 / 一次性补一年历史）
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

/** 一次性补种标记：之后不再追加更早演示数据 */
export const DEMO_HEATMAP_YEAR_KEY = 'xuesen.demoHeatmapYear';

const DEMO_SPAN_DAYS = 365;
/** 已有会话若早于此阈值则视为已有更早数据，不再追加 */
const HAS_OLDER_THRESHOLD_DAYS = 40;
/** 补种从「第几天前」开始（近一个月内留给真实/已有数据） */
const APPEND_FROM_DAY = 30;

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

/** 生成第 dayOffset 天前的一条演示会话（dayOffset=0 为今天） */
function makeDemoSession(dayOffset: number, now: number): ReadingSession {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(now - dayOffset * dayMs);
  start.setHours(9 + (dayOffset % 5), 10 + (dayOffset % 20), 0, 0);
  const durationSec = 25 * 60 + (dayOffset % 7) * 8 * 60;
  const ended = new Date(start.getTime() + durationSec * 1000);
  const linesRead = 800 + dayOffset * 17 + (dayOffset % 5) * 120;
  const focusBase = 72 - (dayOffset % 6) * 3;
  const fatigueBase = 28 + (dayOffset % 5) * 6;

  return {
    id: createId('sess'),
    fileId: `demo-file-${dayOffset % 4}`,
    startedAt: start.toISOString(),
    endedAt: ended.toISOString(),
    durationSec,
    linesRead,
    focusSamples: samples(durationSec, focusBase, 12),
    fatigueSamples: samples(durationSec, fatigueBase, 10),
    distractions: distractions(durationSec, 3 + (dayOffset % 4)),
  };
}

/**
 * 某日是否生成演示会话（约 65% 有阅读，稀疏可见）
 */
function shouldSeedDay(dayOffset: number): boolean {
  // 跳过约 1/3；再跳过少量「长假」空洞，避免整年过密
  if (dayOffset % 3 === 1) return false;
  if (dayOffset % 47 < 3) return false;
  return true;
}

/**
 * 生成近一年稀疏演示会话，供空库首次写入
 */
export function buildDemoSessions(now = Date.now()): ReadingSession[] {
  const sessions: ReadingSession[] = [];
  for (let d = 0; d < DEMO_SPAN_DAYS; d += 1) {
    if (!shouldSeedDay(d)) continue;
    sessions.push(makeDemoSession(d, now));
  }
  return sessions;
}

/**
 * 生成「第 fromDay～toDay 天前」的演示会话（不含近一个月）
 */
export function buildOlderDemoSessions(
  fromDay = APPEND_FROM_DAY,
  toDay = DEMO_SPAN_DAYS - 1,
  now = Date.now(),
): ReadingSession[] {
  const sessions: ReadingSession[] = [];
  for (let d = fromDay; d <= toDay; d += 1) {
    if (!shouldSeedDay(d)) continue;
    sessions.push(makeDemoSession(d, now));
  }
  return sessions;
}

function markDemoHeatmapYearDone(): void {
  try {
    localStorage.setItem(DEMO_HEATMAP_YEAR_KEY, '1');
  } catch {
    /* 隐私模式等忽略 */
  }
}

function isDemoHeatmapYearDone(): boolean {
  try {
    return localStorage.getItem(DEMO_HEATMAP_YEAR_KEY) === '1';
  } catch {
    return false;
  }
}

export interface AppendOlderDemoResult {
  sessions: ReadingSession[];
  /** 本次新追加的片段（需写入 IndexedDB） */
  appended: ReadingSession[];
}

/**
 * 一次性补种：若尚无「一个月以前」数据则追加第 30～365 天演示会话。
 * 已打标记或已有更早会话时不再追加。
 */
export function appendOlderDemoHistoryIfNeeded(
  existing: ReadingSession[],
  now = Date.now(),
): AppendOlderDemoResult {
  if (isDemoHeatmapYearDone()) {
    return { sessions: existing, appended: [] };
  }

  const thresholdMs = HAS_OLDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const hasOlder = existing.some(
    (s) => now - new Date(s.startedAt).getTime() > thresholdMs,
  );
  if (hasOlder) {
    markDemoHeatmapYearDone();
    return { sessions: existing, appended: [] };
  }

  const appended = buildOlderDemoSessions(APPEND_FROM_DAY, DEMO_SPAN_DAYS - 1, now);
  markDemoHeatmapYearDone();
  return { sessions: [...existing, ...appended], appended };
}
