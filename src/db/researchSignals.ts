/** researchSignals - 用户立场与系统观察的本地持久化。 */
import type { ResearchSignal } from '../types';
import { getDb } from './index';
import {
  nonCitationReadyRowIds,
  reconcileSourceRecords,
  unavailableSourceIdsForReferences,
} from '../utils/sourceInvalidation';

export async function listResearchSignals(): Promise<ResearchSignal[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('researchSignals', 'by-updated');
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putResearchSignal(signal: ResearchSignal): Promise<ResearchSignal> {
  const db = await getDb();
  const tx = db.transaction(['files', 'evidenceRows', 'researchSignals'], 'readwrite');
  const [files, rows] = await Promise.all([
    tx.objectStore('files').getAll(),
    tx.objectStore('evidenceRows').getAll(),
  ]);
  const unavailableFileIds = new Set(
    unavailableSourceIdsForReferences(signal.sourceRefs, files),
  );
  const persisted = reconcileSourceRecords({
    fileIds: [...unavailableFileIds],
    invalidatedRowIds: nonCitationReadyRowIds(rows, files),
    rows,
    analyses: [],
    signals: [signal],
    leads: [],
  }).signals[0] ?? signal;
  await tx.objectStore('researchSignals').put(persisted);
  await tx.done;
  return persisted;
}

export async function deleteResearchSignal(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('researchSignals', id);
}

export async function clearResearchSignals(): Promise<void> {
  const db = await getDb();
  await db.clear('researchSignals');
}
