/**
 * db/graph.ts - 知识图谱节点/边/入图状态 IndexedDB 读写
 * 所属：C · 知识图谱
 * 规范参考：UI_spec.md §9；本地优先，与后端 demo 解耦
 */
import type { GraphEdge, GraphMember, GraphNode } from '../types';
import { getDb, type GraphEdgeRecord } from './index';

export function edgeRecordId(source: string, target: string): string {
  // 无向去重：字典序拼接
  return source < target ? `${source}__${target}` : `${target}__${source}`;
}

export async function listGraphNodes(): Promise<GraphNode[]> {
  const db = await getDb();
  return db.getAll('graphNodes');
}

export async function putGraphNode(node: GraphNode): Promise<void> {
  const db = await getDb();
  await db.put('graphNodes', node);
}

export async function putGraphNodes(nodes: GraphNode[]): Promise<void> {
  if (nodes.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('graphNodes', 'readwrite');
  await Promise.all(nodes.map((n) => tx.store.put(n)));
  await tx.done;
}

export async function deleteGraphNode(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('graphNodes', id);
}

/**
 * 按文件 id 级联移除论文节点、相关边、入图状态（软删/硬删共用）
 */
export async function removeFilesFromGraphDb(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const nodeIds = new Set(fileIds.map((id) => `file_${id}`));
  const fileIdSet = new Set(fileIds);
  const db = await getDb();
  const tx = db.transaction(
    ['graphNodes', 'graphEdges', 'graphMembers'],
    'readwrite',
  );
  await Promise.all([
    ...[...nodeIds].map((nid) => tx.objectStore('graphNodes').delete(nid)),
    ...[...fileIdSet].map((fid) => tx.objectStore('graphMembers').delete(fid)),
  ]);
  const edgeStore = tx.objectStore('graphEdges');
  const allEdges = await edgeStore.getAll();
  await Promise.all(
    allEdges
      .filter((e) => nodeIds.has(e.source) || nodeIds.has(e.target))
      .map((e) => edgeStore.delete(e.id)),
  );
  await tx.done;
}

export async function listGraphEdges(): Promise<GraphEdge[]> {
  const db = await getDb();
  const all = await db.getAll('graphEdges');
  return all.map(({ source, target, weight }) => ({ source, target, weight }));
}

export async function putGraphEdges(edges: GraphEdge[]): Promise<void> {
  if (edges.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('graphEdges', 'readwrite');
  await Promise.all(
    edges.map((e) => {
      const id = edgeRecordId(e.source, e.target);
      const record: GraphEdgeRecord = {
        id,
        source: e.source,
        target: e.target,
        weight: e.weight,
      };
      return tx.store.put(record);
    }),
  );
  await tx.done;
}

export async function clearGraphEdges(): Promise<void> {
  const db = await getDb();
  await db.clear('graphEdges');
}

export async function clearGraphAll(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['graphNodes', 'graphEdges', 'graphMembers'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('graphNodes').clear(),
    tx.objectStore('graphEdges').clear(),
    tx.objectStore('graphMembers').clear(),
  ]);
  await tx.done;
}

export async function listGraphMembers(): Promise<GraphMember[]> {
  const db = await getDb();
  return db.getAll('graphMembers');
}

export async function getGraphMember(
  fileId: string,
): Promise<GraphMember | undefined> {
  const db = await getDb();
  return db.get('graphMembers', fileId);
}

export async function putGraphMember(member: GraphMember): Promise<void> {
  const db = await getDb();
  await db.put('graphMembers', member);
}

export async function putGraphMembers(members: GraphMember[]): Promise<void> {
  if (members.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('graphMembers', 'readwrite');
  await Promise.all(members.map((m) => tx.store.put(m)));
  await tx.done;
}
