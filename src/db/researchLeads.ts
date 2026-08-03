/** researchLeads - 偏向冲突、反例和证据缺口的本地持久化。 */
import type { ResearchLead, ResearchRecordStatus } from '../types';
import { getDb } from './index';
import {
  nonCitationReadyRowIds,
  reconcileSourceRecords,
  unavailableSourceIdsForReferences,
} from '../utils/sourceInvalidation';

export async function listResearchLeads(): Promise<ResearchLead[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('researchLeads', 'by-updated');
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listResearchLeadsByStatus(
  status: ResearchRecordStatus,
): Promise<ResearchLead[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('researchLeads', 'by-status', status);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function putResearchLead(lead: ResearchLead): Promise<ResearchLead> {
  const db = await getDb();
  const fileIds = [
    ...new Set([
      ...lead.fileIds,
      ...lead.sourceRefs.map((ref) => ref.fileId),
    ]),
  ];
  const tx = db.transaction(
    ['files', 'evidenceRows', 'researchSignals', 'researchLeads'],
    'readwrite',
  );
  const [files, rows, signals] = await Promise.all([
    tx.objectStore('files').getAll(),
    tx.objectStore('evidenceRows').getAll(),
    tx.objectStore('researchSignals').getAll(),
  ]);
  const fileById = new Map(files.map((file) => [file.id, file]));
  const unavailableFileIds = new Set(
    unavailableSourceIdsForReferences(lead.sourceRefs, files),
  );
  for (const fileId of fileIds.filter((fileId) => {
    const file = fileById.get(fileId);
    return file == null || file.deletedAt !== null || file.type === 'folder';
  })) {
    unavailableFileIds.add(fileId);
  }
  const persisted = reconcileSourceRecords({
    fileIds: [...unavailableFileIds],
    invalidatedRowIds: nonCitationReadyRowIds(rows, files),
    rows,
    analyses: [],
    signals,
    leads: [lead],
  }).leads[0] ?? lead;
  await tx.objectStore('researchLeads').put(persisted);
  await tx.done;
  return persisted;
}

export async function deleteResearchLead(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('researchLeads', id);
}

export async function clearResearchLeads(): Promise<void> {
  const db = await getDb();
  await db.clear('researchLeads');
}
