/**
 * evidenceMatrices - 跨论文证据矩阵持久化
 * 所属：文献综述证据层
 */
import type { EvidenceMatrix } from '../types';
import { getDb } from './index';

export async function listEvidenceMatrices(): Promise<EvidenceMatrix[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex(
    'evidenceMatrices',
    'by-updated',
  );
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getEvidenceMatrix(
  id: string,
): Promise<EvidenceMatrix | undefined> {
  const db = await getDb();
  return db.get('evidenceMatrices', id);
}

export async function putEvidenceMatrix(
  matrix: EvidenceMatrix,
): Promise<void> {
  const db = await getDb();
  await db.put('evidenceMatrices', matrix);
}

export async function putEvidenceMatrices(
  matrices: EvidenceMatrix[],
): Promise<void> {
  if (matrices.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('evidenceMatrices', 'readwrite');
  await Promise.all(matrices.map((matrix) => tx.store.put(matrix)));
  await tx.done;
}

export async function deleteEvidenceMatrix(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['evidenceMatrices', 'evidenceRows', 'evidenceAnalyses'],
    'readwrite',
  );
  const rows = await tx.objectStore('evidenceRows').index('by-matrix').getAll(id);
  const analyses = await tx.objectStore('evidenceAnalyses').index('by-matrix').getAll(id);
  await Promise.all(rows.map((row) => tx.objectStore('evidenceRows').delete(row.id)));
  await Promise.all(analyses.map((analysis) => tx.objectStore('evidenceAnalyses').delete(analysis.id)));
  await tx.objectStore('evidenceMatrices').delete(id);
  await tx.done;
}

export async function clearEvidenceMatrices(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['evidenceMatrices', 'evidenceRows', 'evidenceAnalyses'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('evidenceRows').clear(),
    tx.objectStore('evidenceMatrices').clear(),
    tx.objectStore('evidenceAnalyses').clear(),
  ]);
  await tx.done;
}
