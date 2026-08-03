/**
 * db/files.ts - 文件节点与二进制内容的 CRUD
 * 所属：A · 文件目录 / D · 回收站
 * 规范参考：UI_spec.md §9 FileNode / §14
 */
import type { FileNode } from '../types';
import { getDb, type FileBlobRecord } from './index';

/**
 * 读取全部文件节点（含回收站），由上层过滤
 */
export async function listAllFiles(): Promise<FileNode[]> {
  const db = await getDb();
  return db.getAll('files');
}

/**
 * 活跃文件（未软删除）
 */
export async function listActiveFiles(): Promise<FileNode[]> {
  const all = await listAllFiles();
  return all.filter((f) => f.deletedAt === null);
}

/**
 * 回收站文件
 */
export async function listDeletedFiles(): Promise<FileNode[]> {
  const all = await listAllFiles();
  return all.filter((f) => f.deletedAt !== null);
}

/**
 * 按父目录列出（含软删除项，由调用方决定是否过滤）
 */
export async function listFilesByParent(
  parentId: string | null,
): Promise<FileNode[]> {
  const db = await getDb();
  return db.getAllFromIndex('files', 'by-parent', parentId);
}

/**
 * 按 id 读取单个节点
 */
export async function getFile(id: string): Promise<FileNode | undefined> {
  const db = await getDb();
  return db.get('files', id);
}

/**
 * 写入或更新节点元数据
 */
export async function putFile(node: FileNode): Promise<void> {
  const db = await getDb();
  await db.put('files', node);
}

/**
 * 批量写入节点
 */
export async function putFiles(nodes: FileNode[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('files', 'readwrite');
  await Promise.all(nodes.map((n) => tx.store.put(n)));
  await tx.done;
}

/**
 * 软删除：写入 deletedAt，保留 blob 便于还原
 */
export async function softDeleteFile(
  id: string,
  deletedAt = new Date().toISOString(),
  originalPath?: string,
): Promise<FileNode | undefined> {
  const db = await getDb();
  const node = await db.get('files', id);
  if (!node) return undefined;
  const next: FileNode = {
    ...node,
    deletedAt,
    originalPath: originalPath ?? node.originalPath,
  };
  await db.put('files', next);
  return next;
}

/**
 * 硬删除节点与二进制（彻底删除，不可恢复）；同步清除该文件批注与图谱残留
 */
export async function deleteFile(id: string): Promise<void> {
  const db = await getDb();
  const storeNames = [
    'files',
    'fileBlobs',
    'annotations',
    'bookmarks',
    'fileDocMeta',
    'graphNodes',
    'graphEdges',
    'graphMembers',
    'keywordNodes',
    'keywordEdges',
    'evidenceMatrices',
    'evidenceRows',
    'evidenceAnalyses',
    'researchDigests',
    'researchSignals',
    'researchLeads',
    'qaMessages',
  ] as const;
  const tx = db.transaction([...storeNames], 'readwrite');
  await tx.objectStore('files').delete(id);
  await tx.objectStore('fileBlobs').delete(id);
  // 级联删除该文件下批注与书签，避免孤儿数据
  const annStore = tx.objectStore('annotations');
  const anns = await annStore.index('by-file').getAll(id);
  await Promise.all(anns.map((a) => annStore.delete(a.id)));
  const bmStore = tx.objectStore('bookmarks');
  const bms = await bmStore.index('by-file').getAll(id);
  await Promise.all(bms.map((b) => bmStore.delete(b.id)));
  await tx.objectStore('fileDocMeta').delete(id);

  // 级联移除论文图谱节点、相关边、入图状态
  const nodeId = `file_${id}`;
  await tx.objectStore('graphNodes').delete(nodeId);
  await tx.objectStore('graphMembers').delete(id);
  const edgeStore = tx.objectStore('graphEdges');
  const allEdges = await edgeStore.getAll();
  await Promise.all(
    allEdges
      .filter((e) => e.source === nodeId || e.target === nodeId)
      .map((e) => edgeStore.delete(e.id)),
  );

  // 关键词：摘除挂接；无挂接则删词节点及边
  const kwStore = tx.objectStore('keywordNodes');
  const kwNodes = await kwStore.getAll();
  const removedKwIds: string[] = [];
  await Promise.all(
    kwNodes.map((n) => {
      if (!n.paperNodeIds.includes(nodeId)) return Promise.resolve();
      const nextPapers = n.paperNodeIds.filter((p) => p !== nodeId);
      if (nextPapers.length === 0) {
        removedKwIds.push(n.id);
        return kwStore.delete(n.id);
      }
      return kwStore.put({ ...n, paperNodeIds: nextPapers });
    }),
  );
  if (removedKwIds.length > 0) {
    const removedSet = new Set(removedKwIds);
    const kwEdgeStore = tx.objectStore('keywordEdges');
    const kwEdges = await kwEdgeStore.getAll();
    await Promise.all(
      kwEdges
        .filter((e) => removedSet.has(e.source) || removedSet.has(e.target))
        .map((e) => kwEdgeStore.delete(e.id)),
    );
  }

  // 证据矩阵：永久删除任一选定来源时，整个比较一并删除，避免留下不可解释的半矩阵。
  const matrixStore = tx.objectStore('evidenceMatrices');
  const matrices = await matrixStore.getAll();
  const deletedMatrixIds = new Set(
    matrices
      .filter((matrix) => matrix.fileIds.includes(id))
      .map((matrix) => matrix.id),
  );
  await Promise.all(
    [...deletedMatrixIds].map((matrixId) => matrixStore.delete(matrixId)),
  );
  const evidenceStore = tx.objectStore('evidenceRows');
  const evidenceRows = await evidenceStore.getAll();
  await Promise.all(
    evidenceRows
      .filter((row) => deletedMatrixIds.has(row.matrixId))
      .map((row) => evidenceStore.delete(row.id)),
  );
  const analysisStore = tx.objectStore('evidenceAnalyses');
  const analyses = await analysisStore.index('by-matrix').getAll();
  await Promise.all(
    analyses
      .filter((analysis) => deletedMatrixIds.has(analysis.matrixId))
      .map((analysis) => analysisStore.delete(analysis.id)),
  );

  // 研究环境派生物只保留来源仍存在的记录；永久删除时级联清理。
  const digestStore = tx.objectStore('researchDigests');
  const digests = await digestStore.getAll();
  await Promise.all(
    digests
      .filter((digest) => digest.fileId === id)
      .map((digest) => digestStore.delete(digest.id)),
  );
  const signalStore = tx.objectStore('researchSignals');
  const signals = await signalStore.getAll();
  await Promise.all(
    signals
      .filter((signal) => signal.sourceRefs.some((ref) => ref.fileId === id))
      .map((signal) => signalStore.delete(signal.id)),
  );
  const leadStore = tx.objectStore('researchLeads');
  const leads = await leadStore.getAll();
  await Promise.all(
    leads
      .filter(
        (lead) =>
          lead.fileIds.includes(id) ||
          lead.sourceRefs.some((ref) => ref.fileId === id),
      )
      .map((lead) => leadStore.delete(lead.id)),
  );

  const qaStore = tx.objectStore('qaMessages');
  const qaMessages = await qaStore.index('by-file').getAll(id);
  await Promise.all(qaMessages.map((message) => qaStore.delete(message.id)));

  await tx.done;
}

/**
 * 批量硬删除
 */
export async function deleteFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => deleteFile(id)));
}

/**
 * 保存文件二进制；文件夹无 blob
 */
export async function putFileBlob(record: FileBlobRecord): Promise<void> {
  const db = await getDb();
  await db.put('fileBlobs', record);
}

/**
 * 读取文件二进制
 */
export async function getFileBlob(
  id: string,
): Promise<FileBlobRecord | undefined> {
  const db = await getDb();
  return db.get('fileBlobs', id);
}

/**
 * 删除二进制（彻底删除时调用；软删除时保留）
 */
export async function deleteFileBlob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fileBlobs', id);
}

/**
 * 是否存在二进制（打开阅读前可探测）
 */
export async function hasFileBlob(id: string): Promise<boolean> {
  const db = await getDb();
  const key = await db.getKey('fileBlobs', id);
  return key != null;
}

export type { FileBlobRecord };
