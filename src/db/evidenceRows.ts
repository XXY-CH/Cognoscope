/**
 * evidenceRows - 证据矩阵结论行持久化
 * 所属：文献综述证据层
 */
import type { EvidenceRow } from '../types';
import { getDb } from './index';

export async function listEvidenceRowsByMatrix(
  matrixId: string,
): Promise<EvidenceRow[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(
    'evidenceRows',
    'by-matrix',
    matrixId,
  );
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 读取与文件相关的证据行，供图谱检查器派生局部证据锚点。
 * 证据仍以矩阵行持久化；这里不复制或改写任何图谱记录。
 */
export async function listEvidenceRowsByFileIds(
  fileIds: string[],
): Promise<EvidenceRow[]> {
  const ids = new Set(fileIds.filter(Boolean));
  if (ids.size === 0) return [];
  const db = await getDb();
  const rows = await db.getAll('evidenceRows');
  return rows
    .filter((row) => row.evidence.some((item) => ids.has(item.fileId)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getEvidenceRow(
  id: string,
): Promise<EvidenceRow | undefined> {
  const db = await getDb();
  return db.get('evidenceRows', id);
}

export async function putEvidenceRow(row: EvidenceRow): Promise<void> {
  const db = await getDb();
  await db.put('evidenceRows', row);
}

export async function putEvidenceRows(rows: EvidenceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('evidenceRows', 'readwrite');
  await Promise.all(rows.map((row) => tx.store.put(row)));
  await tx.done;
}

export async function deleteEvidenceRow(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('evidenceRows', id);
}

export async function deleteEvidenceRowsByMatrix(
  matrixId: string,
): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(
    'evidenceRows',
    'by-matrix',
    matrixId,
  );
  if (rows.length === 0) return;
  const tx = db.transaction('evidenceRows', 'readwrite');
  await Promise.all(rows.map((row) => tx.store.delete(row.id)));
  await tx.done;
}

export async function clearEvidenceRows(): Promise<void> {
  const db = await getDb();
  await db.clear('evidenceRows');
}
