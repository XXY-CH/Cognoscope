/**
 * sessionStore - 阅读会话列表、monitor 分析报告与仪表盘范围筛选
 * 所属：B · 个人仪表盘
 * 规范参考：UI_spec.md §5 / §9；分析对齐 monitor/analyze.py
 */
import { create } from 'zustand';
import * as sessionsDb from '../db/sessions';
import type {
  DistractionEvent,
  DistractionKind,
  ReadingSession,
  SessionFocusAnalysis,
} from '../types';
import {
  filterSessionsByRange,
  type SessionRange,
} from '../utils/dashboardMetrics';
import {
  getSessionAnalysis,
  listSessionsWithTimeout,
} from '../utils/monitorApi';
import { fromApiAnalysis } from '../utils/sessionAnalyze';
import {
  appendOlderDemoHistoryIfNeeded,
  buildDemoSessions,
  DEMO_HEATMAP_YEAR_KEY,
} from '../utils/seedSessions';

type LoadStatus = 'idle' | 'loading' | 'error';
type MonitorStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

interface SessionState {
  sessions: ReadingSession[];
  /** monitor/analyze.py 产出的专注分析（按时间新→旧） */
  analyses: SessionFocusAnalysis[];
  status: LoadStatus;
  monitorStatus: MonitorStatus;
  range: SessionRange;
  activeSessionId: string | null;
  loadSessions: () => Promise<void>;
  loadMonitorAnalyses: () => Promise<void>;
  setRange: (range: SessionRange) => void;
  setActiveSessionId: (id: string | null) => void;
  updateDistraction: (
    sessionId: string,
    eventId: string,
    patch: Partial<DistractionEvent>,
  ) => Promise<void>;
}

const ANALYZE_LIMIT = 30;

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  analyses: [],
  status: 'idle',
  monitorStatus: 'idle',
  range: 'recent7',
  activeSessionId: null,

  loadSessions: async () => {
    set({ status: 'loading' });
    try {
      let sessions = await sessionsDb.listSessions();
      // 本地无数据时写入近一年演示会话，便于开箱查看热力图
      if (sessions.length === 0) {
        sessions = buildDemoSessions();
        await sessionsDb.putSessions(sessions);
        // 全年已写入，标记一次性补种完成，避免后续再追加
        try {
          localStorage.setItem(DEMO_HEATMAP_YEAR_KEY, '1');
        } catch {
          /* ignore */
        }
      } else {
        // 已有近月数据时：仅一次补「一个月以前」演示历史
        const { sessions: next, appended } =
          appendOlderDemoHistoryIfNeeded(sessions);
        if (appended.length > 0) {
          await sessionsDb.putSessions(appended);
          sessions = next;
        }
      }
      const filtered = filterSessionsByRange(sessions, get().range);
      set({
        sessions,
        status: 'idle',
        activeSessionId: filtered[0]?.id ?? sessions[0]?.id ?? null,
      });
    } catch {
      set({ status: 'error', sessions: [] });
    }
  },

  loadMonitorAnalyses: async () => {
    set({ monitorStatus: 'loading' });
    try {
      const metas = await listSessionsWithTimeout(4000);
      if (metas.length === 0) {
        set({ analyses: [], monitorStatus: 'ready' });
        return;
      }
      // 只分析最近 N 条，避免一次性打爆 API
      const slice = metas.slice(0, ANALYZE_LIMIT);
      const settled = await Promise.allSettled(
        slice.map(async (meta) => {
          const raw = await getSessionAnalysis(meta.id);
          return fromApiAnalysis(raw, meta);
        }),
      );
      const analyses = settled
        .filter(
          (r): r is PromiseFulfilledResult<SessionFocusAnalysis> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value)
        .sort((a, b) =>
          (b.startedAt ?? '').localeCompare(a.startedAt ?? ''),
        );
      set({
        analyses,
        monitorStatus: analyses.length > 0 ? 'ready' : 'ready',
      });
    } catch {
      // monitor 未启动或超时：保留旧 analyses，标记 offline
      set({ monitorStatus: 'offline' });
    }
  },

  setRange: (range) => {
    const filtered = filterSessionsByRange(get().sessions, range);
    set({
      range,
      activeSessionId: filtered[0]?.id ?? get().activeSessionId,
    });
  },

  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

  updateDistraction: async (sessionId, eventId, patch) => {
    const sessions = get().sessions.map((s) => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        distractions: s.distractions.map((d) =>
          d.id === eventId ? { ...d, ...patch } : d,
        ),
      };
    });
    const target = sessions.find((s) => s.id === sessionId);
    if (target) await sessionsDb.putSession(target);
    set({ sessions });
  },
}));

export function selectFilteredSessions(
  state: SessionState,
): ReadingSession[] {
  return filterSessionsByRange(state.sessions, state.range);
}

/** 按仪表盘时间范围过滤 monitor 分析报告 */
export function selectFilteredAnalyses(
  state: SessionState,
): SessionFocusAnalysis[] {
  const { analyses, range } = state;
  if (range === 'all') return analyses;
  const now = Date.now();
  const cutoffMs: Record<Exclude<SessionRange, 'all'>, number> = {
    recent24h: 24 * 60 * 60 * 1000,
    recent7: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = now - cutoffMs[range];
  return analyses.filter((a) => {
    // 无时间戳的会话仅在「全部」中展示（已在上方提前返回）
    if (!a.startedAt) return false;
    return new Date(a.startedAt).getTime() >= cutoff;
  });
}

export function selectActiveSession(
  state: SessionState,
): ReadingSession | null {
  const filtered = selectFilteredSessions(state);
  return (
    filtered.find((s) => s.id === state.activeSessionId) ??
    filtered[0] ??
    null
  );
}

export type { SessionRange, DistractionKind };
