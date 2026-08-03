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

/** 会话事实不能被 monitor/AI 网络任务无限期卡住。 */
const END_CALLBACK_TIMEOUT_MS = 1500;
/** React StrictMode 会在开发挂载时同步执行一次 setup/cleanup/setup。 */
const STRICT_MODE_REUSE_WINDOW_MS = 0;

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
  const pendingEndRef = useRef<{
    fileId: string;
    sessionId: string;
    timer: number;
    finalize: () => Promise<void>;
  } | null>(null);
  const creationRef = useRef<{
    sessionId: string;
    promise: Promise<void>;
  } | null>(null);
  // 峰值行数：cleanup 时 clearFile 可能已把 store 清零，必须用 ref 兜底
  const linesReadRef = useRef(0);
  const linesRead = useReaderStore((s) => s.linesRead);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  // 同步最新行数到 ref（含递增过程中的每一次更新）
  useEffect(() => {
    linesReadRef.current = Math.max(linesReadRef.current, linesRead);
  }, [linesRead]);

  // 打开 / 切换文件：结束旧会话并开始新会话
  useEffect(() => {
    if (!fileId) return;
    const pending = pendingEndRef.current;
    const reusingSession =
      pending?.fileId === fileId && pending.sessionId === sessionIdRef.current;
    if (reusingSession && pending) {
      window.clearTimeout(pending.timer);
      pendingEndRef.current = null;
    } else if (pending) {
      // 连续切换文件可能发生在同一事件循环内，不能让旧 pending 被覆盖。
      window.clearTimeout(pending.timer);
      pendingEndRef.current = null;
      void pending.finalize();
    }

    let cancelled = false;
    const id = reusingSession ? sessionIdRef.current : createId('sess');
    if (!id) return;
    sessionIdRef.current = id;

    if (!reusingSession) {
      // 新会话从 0 起计，避免沿用上一文件的峰值
      linesReadRef.current = 0;
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

      const creation = (async () => {
        try {
          await sessionsDb.putSession(session);
          if (cancelled) return;
          void loadSessions();
        } catch {
          /* 本地会话写入失败不应阻塞阅读或批注。 */
        }
      })();
      creationRef.current = { sessionId: id, promise: creation };
    } else {
      // 复用 StrictMode 的同一会话；首次 setup 的写入已经在队列中。
      void loadSessions();
    }

    return () => {
      cancelled = true;
      const sid = sessionIdRef.current;
      if (!sid) return;
      // 同步捕获峰值；clearFile 不再清零 linesRead，store 可作为第二来源
      const finalLines = Math.max(
        linesReadRef.current,
        useReaderStore.getState().linesRead,
      );
      const sessionReady =
        creationRef.current?.sessionId === sid
          ? creationRef.current.promise
          : Promise.resolve();
      const finalize = async () => {
        await sessionReady.catch(() => undefined);
        // 允许外部在 end 前合并 monitor 检测数据
        if (onBeforeEnd) {
          try {
            const callback = onBeforeEnd(sid).catch(() => undefined);
            await Promise.race([
              callback,
              new Promise<void>((resolve) =>
                window.setTimeout(resolve, END_CALLBACK_TIMEOUT_MS),
              ),
            ]);
          } catch {
            /* monitor 不可用时静默 */
          }
        }
        try {
          await sessionsDb.updateSessionLines(sid, finalLines);
          await sessionsDb.endSession(sid);
          void useSessionStore.getState().loadSessions();
        } catch {
          /* 本地会话清理失败不应阻塞离开阅读页。 */
        }
        if (sessionIdRef.current === sid) {
          sessionIdRef.current = null;
        }
      };

      const timer = window.setTimeout(() => {
        if (pendingEndRef.current?.sessionId !== sid) return;
        pendingEndRef.current = null;
        void finalize();
      }, STRICT_MODE_REUSE_WINDOW_MS);
      pendingEndRef.current = { fileId, sessionId: sid, timer, finalize };
    };
  }, [fileId, loadSessions, onBeforeEnd]);

  // 节流同步已读行数到进行中会话
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || !fileId) return;
    const t = window.setTimeout(() => {
      void (async () => {
        const next = Math.max(linesReadRef.current, linesRead);
        try {
          await sessionsDb.updateSessionLines(sid, next);
        } catch {
          /* 节流同步失败时保留内存峰值，结束流程会再次尝试。 */
        }
      })();
    }, 800);
    return () => window.clearTimeout(t);
  }, [linesRead, fileId]);

  return sessionIdRef.current;
}
