/**
 * fileDocMeta.ts - 文献摘要/关键词元数据 IndexedDB 读写
 * 所属：A · 文件目录
 * 与 FileNode 分离存储（不污染 UI_spec §9）
 */
import type { FileDocMeta } from '../types';
import { getDb } from './index';

export async function getFileDocMeta(
  fileId: string,
): Promise<FileDocMeta | undefined> {
  const db = await getDb();
  return db.get('fileDocMeta', fileId);
}

export async function getFileDocMetas(
  fileIds: string[],
): Promise<FileDocMeta[]> {
  if (fileIds.length === 0) return [];
  const db = await getDb();
  const results = await Promise.all(
    fileIds.map((id) => db.get('fileDocMeta', id)),
  );
  return results.filter((m): m is FileDocMeta => m != null);
}

export async function putFileDocMeta(meta: FileDocMeta): Promise<void> {
  const db = await getDb();
  await db.put('fileDocMeta', meta);
}

export async function deleteFileDocMeta(fileId: string): Promise<void> {
  const db = await getDb();
  await db.delete('fileDocMeta', fileId);
}

export async function deleteFileDocMetas(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('fileDocMeta', 'readwrite');
  await Promise.all(fileIds.map((id) => tx.store.delete(id)));
  await tx.done;
}
