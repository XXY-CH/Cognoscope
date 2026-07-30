/**
 * monitorAdapter — monitor/ JSONL → xuesen ReadingSession 转换
 *
 * 对接 monitor/ 目录下 Python 行为检测引擎输出的 JSONL 会话文件：
 *   - 解析逐帧事件流
 *   - 将 labels 映射为 DistractionEvent 片段
 *   - 将 focus_score 采样为 MetricSample[]
 *   - 生成符合 xuesen 类型系统的 ReadingSession
 *
 * 使用方式：
 *   import { loadMonitorSession, convertToReadingSession } from '../utils/monitorAdapter';
 *   const frames = loadMonitorSession(jsonlText);
 *   const session = convertToReadingSession(frames, fileId);
 */

import type {
  DistractionEvent,
  DistractionKind,
  MetricSample,
  ReadingSession,
} from '../types';
import { createId } from './id';

// ── reading-monitor-1 JSONL 逐帧格式 ──────────────────────────────

export interface MonitorFrame {
  timestamp: number; // Unix 秒
  frame: number; // 帧序号
  labels: {
    playing_phone: boolean;
    head_down: boolean;
    gaze_center: boolean;
    drinking: boolean;
    chatting: boolean;
    engagement: string | null; // "engaged" | "boredom" | "confusion" | "frustration"
  };
  metrics: {
    focus_score: number | null;
    yaw: number | null;
    pitch: number | null;
    gaze_h: number | null;
    gaze_v: number | null;
    mar: number | null; // mouth aspect ratio
    eng_boredom: number | null;
    eng_confusion: number | null;
    eng_engagement: number | null;
    eng_frustration: number | null;
  };
}

// ── label → DistractionKind 映射 ──────────────────────────────────

const LABEL_KIND_MAP: [keyof MonitorFrame['labels'], DistractionKind][] = [
  ['playing_phone', 'phone'],
  ['drinking', 'drink'],
  ['chatting', 'talk'],
  ['head_down', 'away'],
];

// gaze_center: false → gaze_off（仅在无其他更高优先级标签时生效）
const GAZE_OFF_LABEL: keyof MonitorFrame['labels'] = 'gaze_center';
const GAZE_OFF_KIND: DistractionKind = 'gaze_off';

/** 标签检测优先级（高 → 低）：phone > drink > talk > head_down > gaze_off */
const LABEL_PRIORITY: (keyof MonitorFrame['labels'])[] = [
  'playing_phone',
  'drinking',
  'chatting',
  'head_down',
  'gaze_center', // 注意：gaze_center=false → gaze_off，优先级最低
];

// ── 片段归并（consecutive same-label frames → one episode）────────

interface RawEpisode {
  kind: DistractionKind;
  startFrame: number;
  endFrame: number;
  startAtSec: number;
  endAtSec: number;
}

/**
 * 将逐帧标签归并为连续片段。
 * 同一 label 连续 ≥ `minFrames` 帧且 ≥ `minDurationSec` 秒才视为有效事件。
 */
function mergeToEpisodes(
  frames: MonitorFrame[],
  minFrames = 3,
  minDurationSec = 1.0,
): RawEpisode[] {
  const episodes: RawEpisode[] = [];
  if (frames.length === 0) return episodes;

  let current: RawEpisode | null = null;

  for (let i = 0; i < frames.length; i++) {
    const kind = frameToPrimaryKind(frames[i]);
    if (kind === null) {
      current = flushEpisode(current, episodes, minFrames, minDurationSec);
      continue;
    }
    if (current === null) {
      current = {
        kind,
        startFrame: frames[i].frame,
        endFrame: frames[i].frame,
        startAtSec: relativeSec(frames[i], frames[0]),
        endAtSec: relativeSec(frames[i], frames[0]),
      };
    } else if (current.kind === kind) {
      current.endFrame = frames[i].frame;
      current.endAtSec = relativeSec(frames[i], frames[0]);
    } else {
      current = flushEpisode(current, episodes, minFrames, minDurationSec);
      // 开始新片段
      current = {
        kind,
        startFrame: frames[i].frame,
        endFrame: frames[i].frame,
        startAtSec: relativeSec(frames[i], frames[0]),
        endAtSec: relativeSec(frames[i], frames[0]),
      };
    }
  }
  flushEpisode(current, episodes, minFrames, minDurationSec);
  return episodes;
}

function flushEpisode(
  ep: RawEpisode | null,
  into: RawEpisode[],
  minFrames: number,
  minDurationSec: number,
): null {
  if (ep === null) return null;
  const frameCount = ep.endFrame - ep.startFrame + 1;
  const duration = ep.endAtSec - ep.startAtSec;
  if (frameCount >= minFrames && duration >= minDurationSec) {
    into.push(ep);
  }
  return null;
}

/** 单帧 → 最高优先级触发标签的 DistractionKind；无触发返回 null */
function frameToPrimaryKind(f: MonitorFrame): DistractionKind | null {
  for (const label of LABEL_PRIORITY) {
    if (label === GAZE_OFF_LABEL) {
      // gaze_center=false → 走神，仅在无其他标签时
      if (!f.labels.gaze_center) return GAZE_OFF_KIND;
    } else if (f.labels[label]) {
      const kind = LABEL_KIND_MAP.find(([k]) => k === label)?.[1];
      return kind ?? null;
    }
  }
  return null;
}

/** 绝对时间戳 → 相对会话起点的秒数 */
function relativeSec(frame: MonitorFrame, firstFrame: MonitorFrame): number {
  return frame.timestamp - firstFrame.timestamp;
}

// ── 采样 focus_score → MetricSample[] ─────────────────────────────

/**
 * 从逐帧 focus_score 生成 MetricSample[]。
 * 按 `intervalSec` 间隔采样（默认 30 秒），取区间中位数避免噪声尖峰。
 */
function sampleFocusMetrics(
  frames: MonitorFrame[],
  intervalSec = 30,
): MetricSample[] {
  if (frames.length === 0) return [];

  const samples: MetricSample[] = [];
  const t0 = frames[0].timestamp;
  const duration = frames[frames.length - 1].timestamp - t0;
  if (duration <= 0) return [];

  const bucketCount = Math.max(1, Math.ceil(duration / intervalSec));
  let fi = 0;

  for (let b = 0; b < bucketCount; b++) {
    const bucketStart = b * intervalSec;
    const bucketEnd = (b + 1) * intervalSec;
    const bucket: number[] = [];

    while (fi < frames.length && frames[fi].timestamp - t0 < bucketEnd) {
      const atSec = frames[fi].timestamp - t0;
      if (atSec >= bucketStart && frames[fi].metrics.focus_score !== null) {
        bucket.push(frames[fi].metrics.focus_score!);
      }
      fi++;
    }

    if (bucket.length > 0) {
      bucket.sort((a, b) => a - b);
      const median = bucket[Math.floor(bucket.length / 2)];
      samples.push({
        atSec: Math.round(bucketStart + intervalSec / 2),
        value: Math.min(100, Math.max(0, Math.round(median))),
      });
    }
  }

  return samples;
}

// ── 公开 API ─────────────────────────────────────────────────────

/** 读取 reading-monitor-1 JSONL 文件，返回逐帧数组 */
export function loadMonitorSession(jsonlText: string): MonitorFrame[] {
  const frames: MonitorFrame[] = [];
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      frames.push(JSON.parse(trimmed));
    } catch {
      // 跳过损坏行
    }
  }
  return frames;
}

/** 从 fetch Response 或文件读取 JSONL（浏览器端使用） */
export async function fetchMonitorSession(
  input: RequestInfo | URL,
): Promise<MonitorFrame[]> {
  const response = await fetch(input);
  const text = await response.text();
  return loadMonitorSession(text);
}

/** 主转换：MonitorFrame[] → ReadingSession */
export function convertToReadingSession(
  frames: MonitorFrame[],
  fileId: string,
): ReadingSession | null {
  if (frames.length === 0) return null;

  const first = frames[0];
  const last = frames[frames.length - 1];
  const startedAt = new Date(first.timestamp * 1000).toISOString();
  const endedAt = new Date(last.timestamp * 1000).toISOString();
  const durationSec = Math.round(last.timestamp - first.timestamp);

  // 归并分心片段
  const episodes = mergeToEpisodes(frames);
  const distractions: DistractionEvent[] = episodes.map((ep) => ({
    id: createId('dist'),
    kind: ep.kind,
    atSec: Math.round(ep.startAtSec),
    durationSec: Math.round(ep.endAtSec - ep.startAtSec),
    confidence: 0.7, // reading-monitor-1 未逐事件输出置信度，用默认值
    dismissed: false,
    kindEditedByUser: false,
  }));

  // 采样专注度
  const focusSamples = sampleFocusMetrics(frames);

  // 疲劳度：从 head pose variance 推断（yaw/pitch 标准差越大 → 越不专注）
  const fatigueSamples = sampleFatigueMetrics(frames);

  return {
    id: createId('sess'),
    fileId,
    startedAt,
    endedAt,
    durationSec,
    linesRead: 0, // reading-monitor-1 不追踪行数；由 xuesen 阅读器侧填充
    focusSamples,
    fatigueSamples,
    distractions,
  };
}

/** 从 head pose 方差生成疲劳度 MetricSample[]（代理指标） */
function sampleFatigueMetrics(
  frames: MonitorFrame[],
  intervalSec = 30,
): MetricSample[] {
  if (frames.length === 0) return [];

  const t0 = frames[0].timestamp;
  const duration = frames[frames.length - 1].timestamp - t0;
  if (duration <= 0) return [];

  const samples: MetricSample[] = [];
  const bucketCount = Math.max(1, Math.ceil(duration / intervalSec));
  let fi = 0;

  for (let b = 0; b < bucketCount; b++) {
    const bucketEnd = (b + 1) * intervalSec;
    const yaws: number[] = [];
    const pitches: number[] = [];

    while (fi < frames.length && frames[fi].timestamp - t0 < bucketEnd) {
      if (frames[fi].metrics.yaw !== null) yaws.push(frames[fi].metrics.yaw!);
      if (frames[fi].metrics.pitch !== null)
        pitches.push(frames[fi].metrics.pitch!);
      fi++;
    }

    if (yaws.length >= 3 && pitches.length >= 3) {
      // 方差 → 疲劳度（头部越不稳定 → 越疲劳，映射到 0–100）
      const yawMean = yaws.reduce((a, b) => a + b, 0) / yaws.length;
      const pitchMean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const yawVar = yaws.reduce((s, v) => s + (v - yawMean) ** 2, 0) / yaws.length;
      const pitchVar = pitches.reduce((s, v) => s + (v - pitchMean) ** 2, 0) / pitches.length;
      // 经验映射：方差 0 → 0 疲劳，方差 ~100 → 50，方差 ~400 → 100
      const raw = Math.sqrt(yawVar + pitchVar);
      const fatigue = Math.min(100, Math.round((raw / 20) * 50));
      samples.push({
        atSec: Math.round(bucketEnd - intervalSec / 2),
        value: fatigue,
      });
    }
  }

  return samples;
}

export function summarizeEngagement(
  frames: MonitorFrame[],
): Record<string, number> {
  const counts: Record<string, number> = {
    engaged: 0,
    boredom: 0,
    confusion: 0,
    frustration: 0,
    unknown: 0,
  };
  for (const f of frames) {
    const key = f.labels.engagement ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ── 类型守卫 ─────────────────────────────────────────────────────

/** 验证是否为合法的 reading-monitor-1 JSONL 格式 */
export function isMonitorFrame(raw: unknown): raw is MonitorFrame {
  if (typeof raw !== 'object' || raw === null) return false;
  const f = raw as Record<string, unknown>;
  return (
    typeof f.timestamp === 'number' &&
    typeof f.frame === 'number' &&
    typeof f.labels === 'object' &&
    f.labels !== null &&
    typeof f.metrics === 'object' &&
    f.metrics !== null
  );
}
