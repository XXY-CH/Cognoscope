/** qaMessages - 按文件保存 AI 问答历史，流式过程也可恢复为本地状态。 */
import type { QaMessage } from '../types';
import { getDb } from './index';

function sortByCreated(list: QaMessage[]): QaMessage[] {
  return [...list].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export async function listQaMessagesByFile(fileId: string): Promise<QaMessage[]> {
  const db = await getDb();
  return sortByCreated(await db.getAllFromIndex('qaMessages', 'by-file', fileId));
}

export async function putQaMessage(message: QaMessage): Promise<void> {
  const db = await getDb();
  await db.put('qaMessages', message);
}

export async function putQaMessages(messages: QaMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('qaMessages', 'readwrite');
  await Promise.all(messages.map((message) => tx.store.put(message)));
  await tx.done;
}

export async function deleteQaMessagesByFile(fileId: string): Promise<void> {
  const db = await getDb();
  const messages = await db.getAllFromIndex('qaMessages', 'by-file', fileId);
  if (messages.length === 0) return;
  const tx = db.transaction('qaMessages', 'readwrite');
  await Promise.all(messages.map((message) => tx.store.delete(message.id)));
  await tx.done;
}

export async function clearQaMessages(): Promise<void> {
  const db = await getDb();
  await db.clear('qaMessages');
}
