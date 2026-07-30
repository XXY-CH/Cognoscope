/**
 * dashboardMetrics.ts - 仪表盘指标聚合
 * 所属：B · 个人仪表盘
 * 规范参考：UI_spec.md §5.3 / §5.7
 */
import type { DistractionEvent, DistractionKind, ReadingSession } from '../types';

export type SessionRange = 'recent7' | 'month' | 'all';

export interface MetricSummary {
  focusDurationSec: number;
  focusDeltaMin: number;
  linesRead: number;
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
  dateKey: string; // YYYY-MM-DD
  minutes: number;
}

/** 按范围过滤会话 */
export function filterSessionsByRange(
  sessions: ReadingSession[],
  range: SessionRange,
  now = Date.now(),
): ReadingSession[] {
  const sorted = [...sessions].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  if (range === 'all') return sorted;
  // 「近 7 天 / 近 30 天」按日历窗口过滤，而非「最近 N 条」
  const days = range === 'recent7' ? 7 : 30;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return sorted.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
}

function avg(samples: { value: number }[]): number {
  if (!samples.length) return 0;
  return samples.reduce((s, x) => s + x.value, 0) / samples.length;
}

function formatHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 从会话列表聚合指标卡数据；对比「上一会话」算 delta
 */
export function summarizeMetrics(sessions: ReadingSession[]): MetricSummary {
  const sorted = [...sessions].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  const current = sorted[0];
  const prev = sorted[1];

  const focusDurationSec = current?.durationSec ?? 0;
  const linesRead = current?.linesRead ?? 0;
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
    focusDeltaMin,
    linesRead,
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

/** 最近 30 天热力图：按日汇总阅读分钟 */
export function buildHeatmap(
  sessions: ReadingSession[],
  days = 30,
  now = Date.now(),
): HeatDay[] {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const s of sessions) {
    const key = s.startedAt.slice(0, 10);
    if (!map.has(key)) continue;
    map.set(key, (map.get(key) ?? 0) + Math.round(s.durationSec / 60));
  }
  return [...map.entries()].map(([dateKey, minutes]) => ({ dateKey, minutes }));
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
