/**
 * db/sourceInvalidation - 来源软删除后的派生记录失效事务。
 * 只更新状态，不删除矩阵、证据、信号或线索，便于恢复后回读并重新核验。
 */
import { getDb } from './index';
import type { FileNode } from '../types';
import { reconcileSourceRecords } from '../utils/sourceInvalidation';

export async function invalidateSourceReferences(
  fileIds: string[],
  fileUpdates: FileNode[] = [],
): Promise<ReturnType<typeof reconcileSourceRecords>> {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (ids.length === 0) {
    return reconcileSourceRecords({
      fileIds: [],
      rows: [],
      analyses: [],
      signals: [],
      leads: [],
    });
  }

  const db = await getDb();
  const tx = db.transaction(
    ['files', 'evidenceRows', 'evidenceAnalyses', 'researchSignals', 'researchLeads'],
    'readwrite',
  );
  const updateIds = [...new Set(fileUpdates.map((file) => file.id))];
  const [rows, analyses, signals, leads, currentFiles] = await Promise.all([
    tx.objectStore('evidenceRows').getAll(),
    tx.objectStore('evidenceAnalyses').getAll(),
    tx.objectStore('researchSignals').getAll(),
    tx.objectStore('researchLeads').getAll(),
    Promise.all(updateIds.map((id) => tx.objectStore('files').get(id))),
  ]);
  const currentFileById = new Map(
    currentFiles
      .filter((file): file is FileNode => file != null)
      .map((file) => [file.id, file]),
  );
  // 软删除只修改删除字段；缺失记录代表并发硬删除，不能用旧快照重新创建。
  const safeFileUpdates = fileUpdates.flatMap((update) => {
    const current = currentFileById.get(update.id);
    if (!current) return [];
    const deletedAt =
      current.deletedAt !== null &&
      update.deletedAt !== null &&
      current.deletedAt > update.deletedAt
        ? current.deletedAt
        : update.deletedAt;
    return [{
      ...current,
      deletedAt,
      originalPath: current.deletedAt !== null
        ? current.originalPath
        : update.originalPath,
    }];
  });
  const result = reconcileSourceRecords({
    fileIds: ids,
    rows,
    analyses,
    signals,
    leads,
  });
  await Promise.all([
    ...safeFileUpdates.map((file) => tx.objectStore('files').put(file)),
    ...result.rows
      .filter((row, index) => row !== rows[index])
      .map((row) => tx.objectStore('evidenceRows').put(row)),
    ...result.analyses
      .filter((analysis, index) => analysis !== analyses[index])
      .map((analysis) => tx.objectStore('evidenceAnalyses').put(analysis)),
    ...result.signals
      .filter((signal, index) => signal !== signals[index])
      .map((signal) => tx.objectStore('researchSignals').put(signal)),
    ...result.leads
      .filter((lead, index) => lead !== leads[index])
      .map((lead) => tx.objectStore('researchLeads').put(lead)),
  ]);
  await tx.done;
  return result;
}
