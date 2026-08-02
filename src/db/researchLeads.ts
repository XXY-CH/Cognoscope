/** researchLeads - 偏向冲突、反例和证据缺口的本地持久化。 */
import type { ResearchLead, ResearchRecordStatus } from '../types';
import { getDb } from './index';

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

export async function putResearchLead(lead: ResearchLead): Promise<void> {
  const db = await getDb();
  await db.put('researchLeads', lead);
}

export async function deleteResearchLead(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('researchLeads', id);
}

export async function clearResearchLeads(): Promise<void> {
  const db = await getDb();
  await db.clear('researchLeads');
}
