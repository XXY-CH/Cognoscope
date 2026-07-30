/**
 * monitorApi — 浏览器端调用 monitor/ Python HTTP API 的客户端
 *
 * Python 服务默认监听 http://127.0.0.1:8765，可通过 MONITOR_API_BASE 环境变量覆盖。
 *
 * 使用方式：
 *   import { startDetection, stopDetection, getStatus, getSessions } from '../utils/monitorApi';
 *   const { sessionId } = await startDetection(fileId);
 *   const result = await stopDetection();
 */

export const MONITOR_API_BASE = 'http://127.0.0.1:8765';

interface StartResult {
  status: 'started' | 'already_running' | 'error' | 'unreachable';
  sessionId?: string;
  fileId?: string;
  frameCount?: number;
  message?: string;
}

interface StopResult {
  status: 'stopped' | 'not_running' | 'unreachable';
  sessionId?: string;
  path?: string;
  frameCount?: number;
  fileId?: string;
}

export interface StatusResult {
  running: boolean;
  sessionId?: string;
  frameCount?: number;
  fileId?: string;
}

export interface SessionMeta {
  id: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  frameCount: number;
}

export interface SessionAnalysis {
  sessionId: string;
  duration: number;
  frames: number;
  fps: number;
  gazeRatio: number;
  yawStd: number;
  pitchStd: number;
  events: number;
  episodes: number;
  distractRatio: number;
  eventsPerMin: number;
  engDistribution: Record<string, number> | null;
  engDominant: string | null;
  focusScore: number;
}

// ── Detection control ─────────────────────────────────────────────

/** 启动检测，可关联 fileId 记录当前阅读的论文。
 *  返回 `{ status: 'unreachable' }` 表示 Python 服务未运行。 */
export async function startDetection(
  fileId?: string,
): Promise<StartResult> {
  try {
    const res = await fetch(`${MONITOR_API_BASE}/api/detect/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fileId ? { fileId } : {}),
    });
    return res.json();
  } catch {
    return { status: 'unreachable' };
  }
}

/** 停止检测，返回会话元数据。
 *  返回 `{ status: 'unreachable' }` 表示 Python 服务未运行。 */
export async function stopDetection(): Promise<StopResult> {
  try {
    const res = await fetch(`${MONITOR_API_BASE}/api/detect/stop`, {
      method: 'POST',
    });
    return res.json();
  } catch {
    return { status: 'unreachable' };
  }
}

// ── Session data ───────────────────────────────────────────────────

/** 列出全部 JSONL 会话 */
export async function listSessions(): Promise<SessionMeta[]> {
  const res = await fetch(`${MONITOR_API_BASE}/api/sessions`);
  return res.json();
}

/** 获取单次会话的逐帧数据 */
export async function getSessionFrames(
  sessionId: string,
): Promise<{ sessionId: string; frames: unknown[] }> {
  const res = await fetch(`${MONITOR_API_BASE}/api/sessions/${sessionId}`);
  return res.json();
}

/** 获取单次会话的分析报告 */
export async function getSessionAnalysis(
  sessionId: string,
): Promise<SessionAnalysis> {
  const res = await fetch(`${MONITOR_API_BASE}/api/sessions/${sessionId}/analyze`);
  return res.json();
}

// ── Health ─────────────────────────────────────────────────────────

/** 检查 Python 服务是否在线 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MONITOR_API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
