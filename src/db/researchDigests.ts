/** researchDigests - 会话结束后的整理结果持久化。 */
import type { ResearchDigest } from '../types';
import { getDb } from './index';

function normalizeDigest(digest: ResearchDigest): ResearchDigest {
  return { ...digest, structured: digest.structured ?? null };
}

export async function listResearchDigests(): Promise<ResearchDigest[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('researchDigests', 'by-updated');
  return list
    .map(normalizeDigest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getResearchDigestBySession(
  sessionId: string,
): Promise<ResearchDigest | undefined> {
  const db = await getDb();
  const list = await db.getAllFromIndex(
    'researchDigests',
    'by-session',
    sessionId,
  );
  return list
    .map(normalizeDigest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export async function putResearchDigest(digest: ResearchDigest): Promise<void> {
  const db = await getDb();
  await db.put('researchDigests', digest);
}

export async function deleteResearchDigest(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('researchDigests', id);
}

export async function clearResearchDigests(): Promise<void> {
  const db = await getDb();
  await db.clear('researchDigests');
}
