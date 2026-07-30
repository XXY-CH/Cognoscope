/**
 * dashboardMetrics.ts - 仪表盘指标聚合
 * 所属：B · 个人仪表盘
 * 规范参考：UI_spec.md §5.3 / §5.7
 */
import type { DistractionEvent, DistractionKind, ReadingSession } from '../types';

export type SessionRange = 'recent24h' | 'recent7' | 'month' | 'all';

export interface MetricSummary {
  /** 当次（最近有效会话）专注秒数 */
  focusDurationSec: number;
  /** 全部会话累计专注秒数 */
  totalFocusDurationSec: number;
  focusDeltaMin: number;
  /** 当次阅读行数 */
  linesRead: number;
  /** 全部会话累计阅读行数 */
  totalLinesRead: number;
  linesDelta: number;
  distractionCount: number;
  longestDistractionMin: number;
  fatigueAlertCount: number;
  firstFatigueAt: string | null; // HH:MM
  sparkFocus: number[];
  sparkLines: number[];
  sparkDistract: number[];
  sparkFatigue: number[];
}

export interface HeatDay {
  dateKey: string; // YYYY-MM-DD（本地日历日）
  minutes: number;
}

/** 热力图可汇总的时长条目（IndexedDB 会话或 monitor 元数据） */
export interface HeatDurationEntry {
  startedAt: string | null | undefined;
  durationSec: number;
}

/** 本地日历日 YYYY-MM-DD（避免 toISOString 的 UTC 偏移导致错日） */
export function toLocalDateKey(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(now = Date.now()): Date {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 热力图默认窗口：近 1 年 */
export const HEATMAP_DAYS = 365;

/**
 * 最近 N 天热力图：按本地日汇总阅读分钟（旧→新）
 * 可合并多路来源（IndexedDB 阅读会话 + monitor 检测会话）以保持与专注表同步
 */
export function buildHeatmap(
  entries: HeatDurationEntry[],
  days = HEATMAP_DAYS,
  now = Date.now(),
): HeatDay[] {
  const today = startOfLocalDay(now);
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    map.set(toLocalDateKey(d), 0);
  }
  for (const e of entries) {
    if (!e.startedAt || !(e.durationSec > 0)) continue;
    const key = toLocalDateKey(e.startedAt);
    if (!map.has(key)) continue;
    map.set(key, (map.get(key) ?? 0) + Math.round(e.durationSec / 60));
  }
  return [...map.entries()].map(([dateKey, minutes]) => ({ dateKey, minutes }));
}

/**
 * 连续阅读天数：从今天往回，连续有阅读分钟的天数
 * （今天为 0 则 streak = 0）
 */
export function computeReadingStreak(days: HeatDay[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if ((days[i]?.minutes ?? 0) > 0) streak += 1;
    else break;
  }
  return streak;
}

/** 将分钟映射为 0–4 热力档（相对窗口内最大值） */
export function heatLevel(minutes: number, maxMinutes: number): number {
  if (minutes <= 0) return 0;
  if (maxMinutes <= 0) return 1;
  const ratio = minutes / maxMinutes;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

const RANGE_MS: Record<Exclude<SessionRange, 'all'>, number> = {
  recent24h: 24 * 60 * 60 * 1000,
  recent7: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

/** 按时间范围过滤会话（新→旧）；按 startedAt 落在窗口内，非「最近 N 条」 */
export function filterSessionsByRange(
  sessions: ReadingSession[],
  range: SessionRange,
  now = Date.now(),
): ReadingSession[] {
  const sorted = [...sessions].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  if (range === 'all') return sorted;
  // 按时间窗口过滤（含近 24h），而非「最近 N 条」
  const cutoff = now - RANGE_MS[range];
  return sorted.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
}

function avg(samples: { value: number }[]): number {
  if (!samples.length) return 0;
  return samples.reduce((s, x) => s + x.value, 0) / samples.length;
}

function formatHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 有效会话：有行数，或阅读足够久（排除误点开即关的空会话抢镜） */
const MIN_MEANINGFUL_DURATION_SEC = 30;

function isMeaningfulSession(s: ReadingSession): boolean {
  return s.linesRead > 0 || s.durationSec >= MIN_MEANINGFUL_DURATION_SEC;
}

/**
 * 从会话列表聚合指标卡数据；对比「上一有效会话」算 delta
 */
export function summarizeMetrics(sessions: ReadingSession[]): MetricSummary {
  const sorted = [...sessions].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  const meaningful = sorted.filter(isMeaningfulSession);
  // 优先有效会话；若皆空则回退最新一条，避免无数据时空白
  const current = meaningful[0] ?? sorted[0];
  const prev = meaningful.length > 0 ? meaningful[1] : sorted[1];

  const focusDurationSec = current?.durationSec ?? 0;
  const linesRead = current?.linesRead ?? 0;
  // 总量：所有会话求和（会话表仍只展示当次）
  const totalFocusDurationSec = sessions.reduce(
    (sum, s) => sum + (s.durationSec || 0),
    0,
  );
  const totalLinesRead = sessions.reduce(
    (sum, s) => sum + (s.linesRead || 0),
    0,
  );
  const activeList =
    current?.distractions.filter((d) => !d.dismissed) ?? [];
  const distractionCount = activeList.length;
  const longestDistractionMin = activeList.length
    ? Math.round(Math.max(...activeList.map((d) => d.durationSec)) / 60)
    : 0;

  // 疲劳预警：疲劳度采样 ≥ 60 的次数（按采样点粗略折算）
  const fatigueHigh =
    current?.fatigueSamples.filter((s) => s.value >= 60) ?? [];
  const fatigueAlertCount = fatigueHigh.length
    ? Math.max(1, Math.round(fatigueHigh.length / 3))
    : 0;
  let firstFatigueAt: string | null = null;
  if (current && fatigueHigh.length) {
    const first = fatigueHigh[0];
    const at = new Date(
      new Date(current.startedAt).getTime() + first.atSec * 1000,
    );
    firstFatigueAt = formatHm(at);
  }

  const focusDeltaMin = prev
    ? Math.round((focusDurationSec - prev.durationSec) / 60)
    : 0;
  const linesDelta = prev ? linesRead - prev.linesRead : 0;

  const recent = sorted.slice(0, 7).reverse();
  return {
    focusDurationSec,
    totalFocusDurationSec,
    focusDeltaMin,
    linesRead,
    totalLinesRead,
    linesDelta,
    distractionCount,
    longestDistractionMin,
    fatigueAlertCount,
    firstFatigueAt,
    sparkFocus: recent.map((s) => avg(s.focusSamples)),
    sparkLines: recent.map((s) => s.linesRead),
    sparkDistract: recent.map(
      (s) => s.distractions.filter((d) => !d.dismissed).length,
    ),
    sparkFatigue: recent.map(
      (s) => s.fatigueSamples.filter((x) => x.value >= 60).length,
    ),
  };
}

/** 合并折线图数据点（分钟为 X） */
export function buildChartSeries(session: ReadingSession | null): {
  atMin: number;
  focus: number | null;
  fatigue: number | null;
}[] {
  if (!session) return [];
  const map = new Map<number, { focus?: number; fatigue?: number }>();
  for (const s of session.focusSamples) {
    const atMin = Math.round(s.atSec / 60);
    map.set(atMin, { ...map.get(atMin), focus: s.value });
  }
  for (const s of session.fatigueSamples) {
    const atMin = Math.round(s.atSec / 60);
    map.set(atMin, { ...map.get(atMin), fatigue: s.value });
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([atMin, v]) => ({
      atMin,
      focus: v.focus ?? null,
      fatigue: v.fatigue ?? null,
    }));
}

export function formatDurationHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatLines(n: number): string {
  return n.toLocaleString('zh-CN');
}

export const DISTRACTION_LABELS: Record<DistractionKind, string> = {
  drink: '喝水',
  talk: '聊天',
  away: '离开座位',
  phone: '看手机',
  yawn: '打哈欠',
  gaze_off: '走神',
};

export function activeDistractions(
  events: DistractionEvent[],
): DistractionEvent[] {
  return events.filter((e) => !e.dismissed);
}
