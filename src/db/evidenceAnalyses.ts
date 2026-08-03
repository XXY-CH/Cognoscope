/** evidenceAnalyses - 矩阵二次分析的本地持久化。 */
import type { EvidenceAnalysis } from '../types';
import { getDb } from './index';
import {
  nonCitationReadyRowIds,
  reconcileEvidenceAnalysisForRows,
  reconcileEvidenceRowForFiles,
} from '../utils/sourceInvalidation';

export async function getEvidenceAnalysisByMatrix(
  matrixId: string,
): Promise<EvidenceAnalysis | undefined> {
  const db = await getDb();
  const list = await db.getAllFromIndex('evidenceAnalyses', 'by-matrix', matrixId);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export async function putEvidenceAnalysis(analysis: EvidenceAnalysis): Promise<EvidenceAnalysis> {
  const db = await getDb();
  const tx = db.transaction(
    ['files', 'evidenceRows', 'evidenceAnalyses'],
    'readwrite',
  );
  const rows = await tx.objectStore('evidenceRows').getAll();
  const fileIds = [...new Set(rows.flatMap((row) => row.evidence.map((item) => item.fileId)))];
  const files = (
    await Promise.all(fileIds.map((fileId) => tx.objectStore('files').get(fileId)))
  ).filter((file): file is NonNullable<typeof file> => file != null);
  const normalizedRows = rows.map((row) => reconcileEvidenceRowForFiles(row, files));
  const invalidatedRowIds = nonCitationReadyRowIds(normalizedRows, files);
  await Promise.all(
    normalizedRows
      .filter((row, index) => row !== rows[index])
      .map((row) => tx.objectStore('evidenceRows').put(row)),
  );
  const persisted = reconcileEvidenceAnalysisForRows(analysis, invalidatedRowIds);
  await tx.objectStore('evidenceAnalyses').put(persisted);
  await tx.done;
  return persisted;
}

export async function deleteEvidenceAnalysis(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('evidenceAnalyses', id);
}
