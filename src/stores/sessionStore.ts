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
  type SessionMeta,
} from '../utils/monitorApi';
import { fromApiAnalysis } from '../utils/sessionAnalyze';

/** v2：按 fileId 识别演示会话；旧版只认 localStorage 标记，易漏清 */
const DEMO_CLEANUP_KEY = 'xuesen.demoCleanup.v2';
const DEMO_HEATMAP_YEAR_KEY = 'xuesen.demoHeatmapYear';

/** 丢弃在晚到的 monitor 合并之前启动、但之后才返回的旧列表读取。 */
let sessionsLoadVersion = 0;

/** 旧 seedSessions 写入的演示文献 id 前缀 */
function isDemoSession(s: ReadingSession): boolean {
  return s.fileId.startsWith('demo-file-');
}

type LoadStatus = 'idle' | 'loading' | 'error';
type MonitorStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

interface SessionState {
  sessions: ReadingSession[];
  /** monitor 会话元数据（轻量，供热力图与列表时间对齐） */
  monitorMetas: SessionMeta[];
  /** monitor/analyze.py 产出的专注分析（按时间新→旧） */
  analyses: SessionFocusAnalysis[];
  status: LoadStatus;
  monitorStatus: MonitorStatus;
  range: SessionRange;
  activeSessionId: string | null;
  loadSessions: () => Promise<void>;
  loadMonitorAnalyses: () => Promise<void>;
  mergeSession: (session: ReadingSession) => void;
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
  monitorMetas: [],
  analyses: [],
  status: 'idle',
  monitorStatus: 'idle',
  range: 'recent7',
  activeSessionId: null,

  loadSessions: async () => {
    const requestVersion = ++sessionsLoadVersion;
    set({ status: 'loading' });
    try {
      // 一次性清除 seedSessions 留下的演示数据（不依赖易丢的 localStorage 标记）
      const needsCleanup = (() => {
        try {
          return localStorage.getItem(DEMO_CLEANUP_KEY) !== '1';
        } catch {
          return true;
        }
      })();
      if (needsCleanup) {
        const existing = await sessionsDb.listSessions();
        const demoIds = existing.filter(isDemoSession).map((s) => s.id);
        // 有演示标记且几乎全是演示时整表清空，避免残留随机 id 污染热力图
        const hadDemoMark = (() => {
          try {
            return localStorage.getItem(DEMO_HEATMAP_YEAR_KEY) === '1';
          } catch {
            return false;
          }
        })();
        if (
          hadDemoMark &&
          existing.length > 0 &&
          demoIds.length >= existing.length * 0.8
        ) {
          await sessionsDb.clearSessions();
        } else if (demoIds.length > 0) {
          await sessionsDb.deleteSessions(demoIds);
        }
        try {
          localStorage.removeItem(DEMO_HEATMAP_YEAR_KEY);
          localStorage.setItem(DEMO_CLEANUP_KEY, '1');
        } catch {
          /* ignore */
        }
      }

      const sessions = await sessionsDb.listSessions();
      if (requestVersion !== sessionsLoadVersion) return;
      // 防御：清理标记已写入后仍残留的演示行不再进入 store
      const realSessions = sessions.filter((s) => !isDemoSession(s));
      if (realSessions.length !== sessions.length) {
        await sessionsDb.deleteSessions(
          sessions.filter(isDemoSession).map((s) => s.id),
        );
      }
      const filtered = filterSessionsByRange(realSessions, get().range);
      set({
        sessions: realSessions,
        status: 'idle',
        activeSessionId: filtered[0]?.id ?? realSessions[0]?.id ?? null,
      });
    } catch {
      if (requestVersion !== sessionsLoadVersion) return;
      set({ status: 'error', sessions: [] });
    }
  },

  loadMonitorAnalyses: async () => {
    set({ monitorStatus: 'loading' });
    try {
      const metas = await listSessionsWithTimeout(4000);
      // 元数据全量保留：热力图与专注表共用同一时间轴
      set({ monitorMetas: metas });
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
        monitorStatus: 'ready',
      });
    } catch {
      // monitor 未启动或超时：保留旧 analyses / metas，标记 offline
      set({ monitorStatus: 'offline' });
    }
  },

  mergeSession: (session) => {
    sessionsLoadVersion += 1;
    set((state) => {
      const next = state.sessions.some((item) => item.id === session.id)
        ? state.sessions.map((item) => (item.id === session.id ? session : item))
        : [session, ...state.sessions];
      return {
        sessions: next.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        status: 'idle',
        activeSessionId: state.activeSessionId ?? session.id,
      };
    });
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
    const target = await sessionsDb.updateSessionDistraction(
      sessionId,
      eventId,
      patch,
    );
    if (target) get().mergeSession(target);
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
