/**
 * sessionAnalyze.ts - 专注会话分析（对齐 monitor/analyze.py）
 * 所属：B · 个人仪表盘
 * 方法参考：Gaze Fixation / Head Pose / Distraction Density / DAiSEE / PyTtention
 */
import type { SessionFocusAnalysis } from '../types';
import type { MonitorFrame } from './monitorAdapter';
import type { SessionAnalysis, SessionMeta } from './monitorApi';

const DISTRACTOR_LABELS = [
  'playing_phone',
  'head_down',
  'drinking',
  'chatting',
] as const;

function safeMean(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number');
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function safeStd(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number');
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varSum = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
  return Math.sqrt(varSum);
}

/**
 * 从逐帧数据计算专注报告（逻辑对齐 monitor/analyze.py::analyze）
 */
export function analyzeFrames(frames: MonitorFrame[]): Omit<
  SessionFocusAnalysis,
  'sessionId' | 'startedAt' | 'endedAt'
> | null {
  if (frames.length === 0) return null;

  const n = frames.length;
  const duration = frames[n - 1].timestamp - frames[0].timestamp;

  const gazeFrames = frames.filter((f) => f.labels.gaze_center).length;
  const gazeRatio = n > 0 ? gazeFrames / n : 0;

  const yaws = frames.map((f) => f.metrics.yaw);
  const pitches = frames.map((f) => f.metrics.pitch);
  const yawStd = safeStd(yaws);
  const pitchStd = safeStd(pitches);

  const episodes: Record<string, number> = {};
  for (const label of DISTRACTOR_LABELS) {
    let inEpisode = false;
    let count = 0;
    for (const f of frames) {
      if (f.labels[label]) {
        if (!inEpisode) {
          count += 1;
          inEpisode = true;
        }
      } else {
        inEpisode = false;
      }
    }
    if (count > 0) episodes[label] = count;
  }

  const totalDistractFrames = frames.filter((f) =>
    DISTRACTOR_LABELS.some((l) => f.labels[l]),
  ).length;
  const distractRatio = n > 0 ? totalDistractFrames / n : 0;
  const episodeTotal = Object.values(episodes).reduce((a, b) => a + b, 0);
  const eventsPerMin =
    duration > 0 ? episodeTotal / (duration / 60) : 0;

  const engMeans = {
    boredom: safeMean(frames.map((f) => f.metrics.eng_boredom)),
    confusion: safeMean(frames.map((f) => f.metrics.eng_confusion)),
    engagement: safeMean(frames.map((f) => f.metrics.eng_engagement)),
    frustration: safeMean(frames.map((f) => f.metrics.eng_frustration)),
  };
  const engAvailable = Object.values(engMeans).some((v) => v !== null);

  let engDominant: string | null = null;
  let engEngagedPct = 0;
  if (engAvailable) {
    const states = frames
      .map((f) => f.labels.engagement)
      .filter((s): s is string => s != null);
    const dist: Record<string, number> = {};
    for (const s of ['engaged', 'boredom', 'confusion', 'frustration']) {
      const cnt = states.filter((x) => x === s).length;
      if (cnt > 0 && states.length > 0) {
        dist[s] = (cnt / states.length) * 100;
      }
    }
    if (Object.keys(dist).length > 0) {
      engDominant = Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0];
    }
    engEngagedPct = dist.engaged ?? 0;
  }

  // Composite Focus Score（PyTtention 风格加权）
  const faceDetected = gazeFrames > 0 || yawStd !== null;
  let focusScore: number | null = null;
  if (faceDetected) {
    const gazeScore = gazeRatio * 100;
    let poseScore: number;
    let wGaze: number;
    let wPose: number;
    let wEng: number;
    if (yawStd !== null) {
      const yawNorm = Math.max(0, 1 - yawStd / 25);
      const pitchNorm = Math.max(0, 1 - (pitchStd ?? 0) / 20);
      poseScore = (0.5 * yawNorm + 0.5 * pitchNorm) * 100;
      // 提高投入权重、适当降低注视权重（姿态权重不变）
      wGaze = 0.3;
      wPose = 0.15;
      wEng = 0.35;
    } else {
      poseScore = 50;
      wGaze = 0.45;
      wPose = 0.1;
      wEng = 0.3;
    }
    // 手机 / 聊天 / 喝水出现时，engaged 状态视为无效，不加分
    const hardDistract =
      (episodes.playing_phone ?? 0) > 0 ||
      (episodes.chatting ?? 0) > 0 ||
      (episodes.drinking ?? 0) > 0;
    const effectiveEngPct = hardDistract ? 0 : engEngagedPct;
    const engBonus = effectiveEngPct * wEng;
    const distractPenalty = Math.min(30, episodeTotal * 5);
    focusScore = Math.round(
      wGaze * gazeScore + wPose * poseScore + engBonus - distractPenalty * 0.2,
    );
    focusScore = Math.max(0, Math.min(100, focusScore));
  }

  return {
    durationSec: Math.max(0, duration),
    frames: n,
    gazeRatio,
    eventsPerMin,
    distractRatio,
    yawStd,
    pitchStd,
    engDominant,
    focusScore,
    events: episodes,
  };
}

/** 将 Python API 的 SessionAnalysis + 元数据转为 UI 用 SessionFocusAnalysis */
export function fromApiAnalysis(
  analysis: SessionAnalysis,
  meta?: SessionMeta,
): SessionFocusAnalysis {
  return {
    sessionId: analysis.sessionId,
    startedAt: meta?.startedAt ?? null,
    endedAt: meta?.endedAt ?? null,
    durationSec: analysis.duration ?? meta?.durationSec ?? 0,
    frames: analysis.frames ?? meta?.frameCount ?? 0,
    gazeRatio: analysis.gazeRatio ?? 0,
    eventsPerMin: analysis.eventsPerMin ?? 0,
    distractRatio: analysis.distractRatio ?? 0,
    yawStd: analysis.yawStd ?? null,
    pitchStd: analysis.pitchStd ?? null,
    engDominant: analysis.engDominant ?? null,
    focusScore: analysis.focusScore ?? null,
    events: analysis.events ?? {},
  };
}

/** 投入状态中文标签 */
export const ENG_STATE_LABELS: Record<string, string> = {
  engaged: '投入',
  boredom: '无聊',
  confusion: '困惑',
  frustration: '挫败',
};

/** 分心标签中文映射 */
const DIST_LABEL_CN: Record<string, string> = {
  playing_phone: '手机',
  head_down: '低头',
  drinking: '喝水',
  chatting: '说话',
};

/** 格式化分心片段摘要，如 "手机 3, 喝水 1"；无事件时返回空串 */
export function formatDistractionEvents(events: Record<string, number>): string {
  const parts = Object.entries(events)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => `${DIST_LABEL_CN[label] ?? label} ${count}`);
  return parts.join(', ');
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatPerMin(n: number): string {
  return `${n.toFixed(2)} /min`;
}

export function formatPoseStd(
  yaw: number | null,
  pitch: number | null,
): string {
  if (yaw === null && pitch === null) return '—';
  const y = yaw !== null ? yaw.toFixed(1) : '—';
  const p = pitch !== null ? pitch.toFixed(1) : '—';
  return `${y}° / ${p}°`;
}
