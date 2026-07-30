/**
 * useReadingSession - 打开阅读页时创建会话，离开时结束并写入仪表盘
 * 所属：E · 阅读界面 / B · 仪表盘
 * 规范参考：UI_spec.md §8.5 / §9 ReadingSession
 */
import { useEffect, useRef } from 'react';
import * as sessionsDb from '../db/sessions';
import { useReaderStore } from '../stores/readerStore';
import { useSessionStore } from '../stores/sessionStore';
import type { ReadingSession } from '../types';
import { createId } from '../utils/id';

/**
 * 为当前 fileId 开启一条 ReadingSession；周期性同步 linesRead；卸载时 endSession
 *
 * @param fileId - 当前阅读的文件 ID
 * @param onBeforeEnd - 会话结束前的回调，可在此时合并 monitor 检测数据
 * @returns sessionId — 可用于外部（如 ReaderPage）在结束时合并额外数据
 */
export function useReadingSession(
  fileId: string | null,
  onBeforeEnd?: (sessionId: string) => Promise<void>,
): string | null {
  const sessionIdRef = useRef<string | null>(null);
  const linesRead = useReaderStore((s) => s.linesRead);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  // 打开 / 切换文件：结束旧会话并开始新会话
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    const id = createId('sess');
    sessionIdRef.current = id;
    const startedAt = new Date().toISOString();

    const session: ReadingSession = {
      id,
      fileId,
      startedAt,
      endedAt: null,
      durationSec: 0,
      linesRead: 0,
      focusSamples: [],
      fatigueSamples: [],
      distractions: [],
    };

    void (async () => {
      await sessionsDb.putSession(session);
      if (cancelled) return;
      void loadSessions();
    })();

    return () => {
      cancelled = true;
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (!sid) return;
      void (async () => {
        // 允许外部在 end 前合并 monitor 检测数据
        if (onBeforeEnd) {
          try { await onBeforeEnd(sid); } catch { /* monitor 不可用时静默 */ }
        }
        const cur = await sessionsDb.getSession(sid);
        if (cur && !cur.endedAt) {
          await sessionsDb.putSession({
            ...cur,
            linesRead: useReaderStore.getState().linesRead,
          });
        }
        await sessionsDb.endSession(sid);
        void useSessionStore.getState().loadSessions();
      })();
    };
  }, [fileId, loadSessions, onBeforeEnd]);

  // 节流同步已读行数到进行中会话
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || !fileId) return;
    const t = window.setTimeout(() => {
      void (async () => {
        const cur = await sessionsDb.getSession(sid);
        if (!cur || cur.endedAt) return;
        if (cur.linesRead === linesRead) return;
        await sessionsDb.putSession({ ...cur, linesRead });
      })();
    }, 800);
    return () => window.clearTimeout(t);
  }, [linesRead, fileId]);

  return sessionIdRef.current;
}
