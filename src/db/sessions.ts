/**
 * db/sessions.ts - 阅读会话 CRUD
 * 所属：B · 个人仪表盘 / E · 阅读界面
 * 规范参考：UI_spec.md §9 ReadingSession / §14
 */
import type { ReadingSession } from '../types';
import { getDb } from './index';

/**
 * 列出全部会话（新→旧）
 */
export async function listSessions(): Promise<ReadingSession[]> {
  const db = await getDb();
  const all = await db.getAll('sessions');
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * 按文件 id 列出会话
 */
export async function listSessionsByFile(
  fileId: string,
): Promise<ReadingSession[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('sessions', 'by-file', fileId);
  return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * 读取单条会话
 */
export async function getSession(
  id: string,
): Promise<ReadingSession | undefined> {
  const db = await getDb();
  return db.get('sessions', id);
}

/**
 * 写入或更新会话
 */
export async function putSession(session: ReadingSession): Promise<void> {
  const db = await getDb();
  await db.put('sessions', session);
}

/** 仅在会话仍进行中时原子地推进已读行数，避免与结束写互相复活。 */
export async function updateSessionLines(
  id: string,
  linesRead: number,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('sessions', 'readwrite');
  const session = await tx.store.get(id);
  if (!session || session.endedAt || session.linesRead >= linesRead) {
    await tx.done;
    return;
  }
  await tx.store.put({ ...session, linesRead });
  await tx.done;
}

/**
 * 批量写入
 */
export async function putSessions(sessions: ReadingSession[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('sessions', 'readwrite');
  await Promise.all(sessions.map((s) => tx.store.put(s)));
  await tx.done;
}

/**
 * 删除单条会话
 */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('sessions', id);
}

/**
 * 按 id 批量删除（清理演示会话等）
 */
export async function deleteSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('sessions', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

/**
 * 清空全部会话（设置「清除数据」等场景）
 */
export async function clearSessions(): Promise<void> {
  const db = await getDb();
  await db.clear('sessions');
}

/**
 * 结束进行中的会话：写入 endedAt 与时长
 */
export async function endSession(
  id: string,
  endedAt = new Date().toISOString(),
): Promise<ReadingSession | undefined> {
  const session = await getSession(id);
  if (!session || session.endedAt) return session;
  const start = Date.parse(session.startedAt);
  const end = Date.parse(endedAt);
  const durationSec =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.round((end - start) / 1000))
      : session.durationSec;
  const next: ReadingSession = { ...session, endedAt, durationSec };
  await putSession(next);
  return next;
}
