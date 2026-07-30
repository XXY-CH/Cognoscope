/**
 * sessionStore - 阅读会话列表与仪表盘范围筛选
 * 所属：B · 个人仪表盘
 * 规范参考：UI_spec.md §5 / §9
 */
import { create } from 'zustand';
import * as sessionsDb from '../db/sessions';
import type { DistractionEvent, DistractionKind, ReadingSession } from '../types';
import {
  filterSessionsByRange,
  type SessionRange,
} from '../utils/dashboardMetrics';
import { buildDemoSessions } from '../utils/seedSessions';

type LoadStatus = 'idle' | 'loading' | 'error';

interface SessionState {
  sessions: ReadingSession[];
  status: LoadStatus;
  range: SessionRange;
  /** 图表/时间轴当前聚焦的会话 id；默认最近一次 */
  activeSessionId: string | null;
  loadSessions: () => Promise<void>;
  setRange: (range: SessionRange) => void;
  setActiveSessionId: (id: string | null) => void;
  updateDistraction: (
    sessionId: string,
    eventId: string,
    patch: Partial<DistractionEvent>,
  ) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  status: 'idle',
  range: 'recent7',
  activeSessionId: null,

  loadSessions: async () => {
    set({ status: 'loading' });
    try {
      let sessions = await sessionsDb.listSessions();
      // 本地无数据时写入演示会话，便于开箱查看图表
      if (sessions.length === 0) {
        sessions = buildDemoSessions();
        await sessionsDb.putSessions(sessions);
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
