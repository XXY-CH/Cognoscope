/**
 * db/bookmarks.ts - 书签 CRUD
 * 所属：E · 阅读界面 > TocPanel
 * 规范参考：UI_spec.md §8.4 / §14
 */
import type { Bookmark } from '../types';
import { getDb } from './index';

export async function listBookmarksByFile(
  fileId: string,
): Promise<Bookmark[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('bookmarks', 'by-file', fileId);
  return list.sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDb();
  await db.put('bookmarks', bookmark);
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

export async function deleteBookmarksByFile(fileId: string): Promise<void> {
  const list = await listBookmarksByFile(fileId);
  await Promise.all(list.map((b) => deleteBookmark(b.id)));
}
