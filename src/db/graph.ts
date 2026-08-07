/**
 * db/graph.ts - 知识图谱节点/边/入图状态 IndexedDB 读写
 * 所属：C · 知识图谱
 * 规范参考：UI_spec.md §9；本地优先，与后端 demo 解耦
 */
import type { GraphEdge, GraphMember, GraphNode } from '../types';
import { getDb, type GraphEdgeRecord } from './index';

export function edgeRecordId(
  source: string,
  target: string,
  relationType?: GraphEdge['relationType'],
): string {
  // Legacy edges keep their endpoint-only key; typed relations add a semantic
  // suffix so distinct relation types cannot overwrite one another.
  const symmetric =
    relationType === undefined ||
    relationType === 'relates' ||
    relationType === 'unknown';
  const endpoints = symmetric
    ? source < target
      ? `${source}__${target}`
      : `${target}__${source}`
    : `${source}__${target}`;
  return relationType
    ? `${endpoints}__${encodeURIComponent(relationType)}`
    : endpoints;
}

export function graphEdgeRecordFromEdge(edge: GraphEdge): GraphEdgeRecord {
  return {
    id: edgeRecordId(edge.source, edge.target, edge.relationType),
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
    ...(edge.origin ? { origin: edge.origin } : {}),
    ...(edge.reason ? { reason: edge.reason } : {}),
    ...(edge.relationType ? { relationType: edge.relationType } : {}),
    ...(edge.status ? { status: edge.status } : {}),
    ...(edge.evidenceAnchorIds
      ? { evidenceAnchorIds: edge.evidenceAnchorIds }
      : {}),
    ...(edge.evidenceRowIds ? { evidenceRowIds: edge.evidenceRowIds } : {}),
    ...(edge.conditionIds ? { conditionIds: edge.conditionIds } : {}),
  };
}

export function graphEdgeFromRecord({
  id: _id,
  source,
  target,
  weight,
  origin,
  reason,
  relationType,
  status,
  evidenceAnchorIds,
  evidenceRowIds,
  conditionIds,
}: GraphEdgeRecord): GraphEdge {
  return {
    source,
    target,
    weight,
    ...(origin ? { origin } : {}),
    ...(reason ? { reason } : {}),
    ...(relationType ? { relationType } : {}),
    ...(status ? { status } : {}),
    ...(evidenceAnchorIds ? { evidenceAnchorIds } : {}),
    ...(evidenceRowIds ? { evidenceRowIds } : {}),
    ...(conditionIds ? { conditionIds } : {}),
  };
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
  return all.map(graphEdgeFromRecord);
}

export async function putGraphEdges(edges: GraphEdge[]): Promise<void> {
  if (edges.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('graphEdges', 'readwrite');
  await Promise.all(
    edges.map((e) => {
      return tx.store.put(graphEdgeRecordFromEdge(e));
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
