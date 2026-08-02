/** evidenceAnalyses - 矩阵二次分析的本地持久化。 */
import type { EvidenceAnalysis } from '../types';
import { getDb } from './index';

export async function getEvidenceAnalysisByMatrix(
  matrixId: string,
): Promise<EvidenceAnalysis | undefined> {
  const db = await getDb();
  const list = await db.getAllFromIndex('evidenceAnalyses', 'by-matrix', matrixId);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export async function putEvidenceAnalysis(analysis: EvidenceAnalysis): Promise<void> {
  const db = await getDb();
  await db.put('evidenceAnalyses', analysis);
}

export async function deleteEvidenceAnalysis(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('evidenceAnalyses', id);
}
