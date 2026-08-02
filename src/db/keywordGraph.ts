/**
 * keywordGraph.ts - 关键词图谱 IndexedDB 读写
 * 所属：C · 知识图谱 > 关键词画布
 */
import type { KeywordEdge, KeywordNode } from '../types';
import { edgeRecordId } from './graph';
import { getDb, type GraphEdgeRecord } from './index';

export async function listKeywordNodes(): Promise<KeywordNode[]> {
  const db = await getDb();
  return db.getAll('keywordNodes');
}

export async function putKeywordNode(node: KeywordNode): Promise<void> {
  const db = await getDb();
  await db.put('keywordNodes', node);
}

export async function putKeywordNodes(nodes: KeywordNode[]): Promise<void> {
  if (nodes.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('keywordNodes', 'readwrite');
  await Promise.all(nodes.map((n) => tx.store.put(n)));
  await tx.done;
}

export async function listKeywordEdges(): Promise<KeywordEdge[]> {
  const db = await getDb();
  const all = await db.getAll('keywordEdges');
  return all.map(({ source, target, weight, origin, reason }) => ({
    source,
    target,
    weight,
    ...(origin ? { origin } : {}),
    ...(reason ? { reason } : {}),
  }));
}

export async function putKeywordEdges(edges: KeywordEdge[]): Promise<void> {
  if (edges.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('keywordEdges', 'readwrite');
  await Promise.all(
    edges.map((e) => {
      const id = edgeRecordId(e.source, e.target);
      const record: GraphEdgeRecord = {
        id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        ...(e.origin ? { origin: e.origin } : {}),
        ...(e.reason ? { reason: e.reason } : {}),
      };
      return tx.store.put(record);
    }),
  );
  await tx.done;
}

export async function clearKeywordGraph(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['keywordNodes', 'keywordEdges'], 'readwrite');
  await Promise.all([
    tx.objectStore('keywordNodes').clear(),
    tx.objectStore('keywordEdges').clear(),
  ]);
  await tx.done;
}

export async function deleteKeywordNodes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('keywordNodes', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function deleteKeywordEdgesTouching(
  keywordIds: string[],
): Promise<void> {
  if (keywordIds.length === 0) return;
  const idSet = new Set(keywordIds);
  const db = await getDb();
  const tx = db.transaction('keywordEdges', 'readwrite');
  const all = await tx.store.getAll();
  await Promise.all(
    all
      .filter((e) => idSet.has(e.source) || idSet.has(e.target))
      .map((e) => tx.store.delete(e.id)),
  );
  await tx.done;
}

/**
 * 论文节点离开图谱后：从关键词上摘除挂接；无挂接的词节点与其边一并删除
 * @returns 更新后的全量节点与边（便于写回 store）
 */
export async function detachPapersFromKeywords(
  paperNodeIds: string[],
): Promise<{ nodes: KeywordNode[]; edges: KeywordEdge[] }> {
  if (paperNodeIds.length === 0) {
    const [nodes, edges] = await Promise.all([
      listKeywordNodes(),
      listKeywordEdges(),
    ]);
    return { nodes, edges };
  }
  const paperSet = new Set(paperNodeIds);
  const existing = await listKeywordNodes();
  const kept: KeywordNode[] = [];
  const removedIds: string[] = [];
  const toPut: KeywordNode[] = [];

  for (const n of existing) {
    const touched = n.paperNodeIds.some((id) => paperSet.has(id));
    if (!touched) {
      kept.push(n);
      continue;
    }
    const nextPapers = n.paperNodeIds.filter((id) => !paperSet.has(id));
    // 挂接被摘空 → 删除词节点及其边
    if (nextPapers.length === 0) {
      removedIds.push(n.id);
      continue;
    }
    const next = { ...n, paperNodeIds: nextPapers };
    toPut.push(next);
    kept.push(next);
  }

  if (toPut.length > 0) await putKeywordNodes(toPut);
  if (removedIds.length > 0) {
    await deleteKeywordNodes(removedIds);
    await deleteKeywordEdgesTouching(removedIds);
  }

  const edges = (await listKeywordEdges()).filter(
    (e) => !removedIds.includes(e.source) && !removedIds.includes(e.target),
  );
  return { nodes: kept, edges };
}
