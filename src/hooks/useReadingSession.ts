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
 */
export function useReadingSession(fileId: string | null): void {
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
      // 刷新仪表盘列表（若用户随后切过去能看到进行中会话）
      void loadSessions();
    })();

    return () => {
      cancelled = true;
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (!sid) return;
      // 结束前把最新行数写入再 end
      void (async () => {
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
  }, [fileId, loadSessions]);

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
}
