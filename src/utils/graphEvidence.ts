/**
 * 图谱证据适配器：从现有矩阵行派生局部锚点，不创建第二份证据事实源。
 */
import type {
  EvidenceLocator,
  EvidenceMatchMethod,
  EvidenceRow,
  EvidenceVerificationState,
  FileNode,
  FileType,
  GraphEdge,
  GraphNode,
  KeywordEdge,
  KeywordNode,
  ResearchRelationOrigin,
  ResearchRelationProjection,
  ResearchRelationRefKind,
  ResearchRelationStatus,
  ResearchRelationType,
} from '../types';

export type GraphEvidenceSourceState = 'available' | 'unresolved' | 'missing';

/**
 * 图谱边的关系级证据状态。
 * 当前 GraphEdge 没有持久化 rowId，故 projection 永远不会把聚合材料升级为已确认。
 */
export type GraphRelationEvidenceState =
  | 'clue'
  | 'review'
  | 'disputed'
  | 'insufficient'
  | 'stale';

const RELATION_TYPES = new Set<ResearchRelationType>([
  'contains',
  'mentions',
  'relates',
  'supports',
  'contradicts',
  'qualifies',
  'extends',
  'uses_method',
  'uses_dataset',
  'measures',
  'unknown',
]);

const RELATION_STATUSES = new Set<ResearchRelationStatus>([
  'clue',
  'review',
  'verified',
  'disputed',
  'stale',
]);

function stableStringCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableReferenceIds(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ]
    .sort(stableStringCompare);
}

function relationProjectionId(
  sourceKind: ResearchRelationRefKind,
  sourceId: string,
  targetKind: ResearchRelationRefKind,
  targetId: string,
  type: ResearchRelationType,
): string {
  const sourceToken = `${sourceKind}:${sourceId}`;
  const targetToken = `${targetKind}:${targetId}`;
  const symmetric = type === 'relates' || type === 'unknown';
  const endpoints = symmetric
    ? [sourceToken, targetToken].sort(stableStringCompare)
    : [sourceToken, targetToken];
  return `relation:${encodeURIComponent(endpoints[0])}->${encodeURIComponent(endpoints[1])}:${type}`;
}

/** Normalize old edge origins without rewriting the persisted record. */
export function normalizeRelationOrigin(
  origin: GraphEdge['origin'],
): ResearchRelationOrigin {
  if (origin === 'cooccurrence') return 'rule';
  if (origin === 'manual') return 'user';
  if (
    origin === 'user' ||
    origin === 'rule' ||
    origin === 'ai' ||
    origin === 'mixed' ||
    origin === 'unknown'
  ) {
    return origin;
  }
  return 'unknown';
}

function relationTypeFromLegacyEdge(
  edge: Pick<GraphEdge | KeywordEdge, 'origin' | 'reason' | 'relationType'>,
  sourceKind: ResearchRelationRefKind,
  targetKind: ResearchRelationRefKind,
): ResearchRelationType {
  if (edge.relationType && RELATION_TYPES.has(edge.relationType)) {
    return edge.relationType;
  }

  const isPaperConcept =
    sourceKind === 'paper' && targetKind === 'concept';
  if (isPaperConcept) {
    return 'mentions';
  }

  if (sourceKind === 'scope' && targetKind === 'paper') return 'contains';

  if (
    edge.origin === 'cooccurrence' ||
    edge.origin === 'rule' ||
    edge.origin === 'ai' ||
    edge.origin === 'mixed' ||
    edge.origin === 'manual' ||
    edge.origin === 'user'
  ) {
    return 'relates';
  }

  return 'unknown';
}

function relationStatusFromLegacyEdge(
  status: ResearchRelationStatus | undefined,
): ResearchRelationStatus {
  return status && RELATION_STATUSES.has(status) ? status : 'clue';
}

function relationRefKindForNode(
  node: GraphNode | KeywordNode | undefined,
): ResearchRelationRefKind | undefined {
  if (!node) return undefined;
  if ('kind' in node) {
    if (node.kind === 'folder') return 'scope';
    if (node.kind === 'tag') return 'concept';
    return 'paper';
  }
  return 'concept';
}

export interface LegacyRelationProjectionOptions {
  sourceKind?: ResearchRelationRefKind;
  targetKind?: ResearchRelationRefKind;
}

/**
 * Project a legacy graph edge into the canonical relation contract.
 *
 * This is intentionally a pure adapter: it reads explicit edge metadata,
 * keeps stable references only, and never copies evidence text or promotes
 * a graph edge into citation-ready material.
 */
export function projectLegacyEdgeToRelation(
  edge: GraphEdge | KeywordEdge,
  options: LegacyRelationProjectionOptions = {},
): ResearchRelationProjection {
  const sourceKind = options.sourceKind ?? 'paper';
  const targetKind = options.targetKind ?? sourceKind;
  const relationType = relationTypeFromLegacyEdge(edge, sourceKind, targetKind);
  const origin = normalizeRelationOrigin(edge.origin);
  const status = relationStatusFromLegacyEdge(edge.status);

  return {
    id: relationProjectionId(
      sourceKind,
      edge.source,
      targetKind,
      edge.target,
      relationType,
    ),
    type: relationType,
    sourceRef: { kind: sourceKind, id: edge.source },
    targetRef: { kind: targetKind, id: edge.target },
    reason: edge.reason?.trim() || '来源未记录',
    origin,
    status,
    evidenceAnchorIds: stableReferenceIds(edge.evidenceAnchorIds),
    evidenceRowIds: stableReferenceIds(edge.evidenceRowIds),
    conditionIds: stableReferenceIds(edge.conditionIds),
    ...(Number.isFinite(edge.weight)
      ? { navigationWeight: Math.max(0, Math.min(1, edge.weight)) }
      : {}),
  };
}

/** Explicit aliases make the adapter easy to consume from paper/keyword views. */
export const projectLegacyGraphEdge = projectLegacyEdgeToRelation;

/** Resolve endpoint kinds once so every view shares the same legacy mapping. */
export function projectGraphEdgeToRelation(
  edge: GraphEdge,
  nodes: readonly (GraphNode | KeywordNode)[],
): ResearchRelationProjection {
  const sourceNode = nodes.find((node) => node.id === edge.source);
  const targetNode = nodes.find((node) => node.id === edge.target);
  return projectLegacyEdgeToRelation(edge, {
    sourceKind: relationRefKindForNode(sourceNode) ?? 'paper',
    targetKind: relationRefKindForNode(targetNode) ?? 'paper',
  });
}

export const projectLegacyKeywordEdge = (
  edge: KeywordEdge,
): ResearchRelationProjection =>
  projectLegacyEdgeToRelation(edge, {
    sourceKind: 'concept',
    targetKind: 'concept',
  });

/**
 * Graph relations are navigation projections only. Citation-ready output is
 * owned by the evidence matrix and must pass its locator/source gate.
 */
export function isCitationReadyResearchRelation(
  _relation: ResearchRelationProjection,
): false {
  return false;
}

export interface ResearchRelationEvidenceInput {
  rows: EvidenceRow[];
  files: FileNode[];
}

function relationStatusFromEvidenceState(
  state: GraphRelationEvidenceState,
): ResearchRelationStatus {
  if (state === 'stale') return 'stale';
  if (state === 'disputed') return 'disputed';
  if (state === 'review') return 'review';
  return 'clue';
}

/**
 * Reconcile explicitly referenced relation evidence without copying any
 * source text into the relation. Candidate matrix co-membership is kept out
 * of this function on purpose: only row/anchor IDs already bound to the edge
 * can affect its status.
 */
export function reconcileResearchRelationEvidence(
  relation: ResearchRelationProjection,
  input: ResearchRelationEvidenceInput,
): ResearchRelationProjection {
  const rowIds = stableReferenceIds(relation.evidenceRowIds);
  const anchorIds = stableReferenceIds(relation.evidenceAnchorIds);
  if (rowIds.length === 0 && anchorIds.length === 0) {
    return {
      ...relation,
      status: relation.status === 'verified' ? 'review' : relation.status,
    };
  }

  const rowsById = new Map(input.rows.map((row) => [row.id, row]));
  const referencedRows = rowIds.map((rowId) => rowsById.get(rowId));
  if (referencedRows.some((row): row is undefined => !row)) {
    return { ...relation, status: 'stale' };
  }
  if (referencedRows.some((row) => row?.verification === 'disputed')) {
    return { ...relation, status: 'disputed' };
  }

  const candidateRows = rowIds.length > 0 ? referencedRows : input.rows;
  const anchorSet = new Set(anchorIds);
  const referencedItems: Array<{ row: EvidenceRow; item: EvidenceRow['evidence'][number] }> = [];
  for (const row of candidateRows) {
    if (!row) continue;
    for (const item of row.evidence) {
      const derivedAnchorId = `${row.matrixId}:${row.id}:${item.id}`;
      if (anchorSet.has(item.id) || anchorSet.has(derivedAnchorId)) {
        referencedItems.push({ row, item });
      }
    }
  }

  if (
    anchorIds.length > 0 &&
    referencedItems.length !== anchorIds.length
  ) {
    return { ...relation, status: 'stale' };
  }
  if (anchorIds.length === 0) {
    return { ...relation, status: 'review' };
  }

  const fileById = new Map(input.files.map((file) => [file.id, file]));
  if (
    referencedItems.some(({ row, item }) => {
      const file = fileById.get(item.fileId);
      return (
        row.verification === 'disputed' ||
        item.verification === 'disputed' ||
        !file ||
        file.deletedAt !== null ||
        !isResolvableLocator(item.locator, file.type)
      );
    })
  ) {
    const hasDispute = referencedItems.some(
      ({ row, item }) =>
        row.verification === 'disputed' || item.verification === 'disputed',
    );
    return { ...relation, status: hasDispute ? 'disputed' : 'stale' };
  }

  const allVerified = referencedItems.every(
    ({ row, item }) =>
      row.verification === 'verified' && item.verification === 'verified',
  );
  return {
    ...relation,
    status: allVerified
      ? 'verified'
      : relationStatusFromEvidenceState('review'),
  };
}

export interface GraphRelationProjection {
  state: GraphRelationEvidenceState;
  label: string;
  reason: string;
  rowIds: string[];
}

export interface GraphEvidenceAnchor {
  id: string;
  matrixId: string;
  rowId: string;
  fileId: string;
  fileName: string;
  fileType: FileType | null;
  conclusion: string;
  quotedText: string;
  annotationBody: string | null;
  locator: EvidenceLocator;
  match: EvidenceMatchMethod;
  verification: EvidenceVerificationState;
  rowVerification: EvidenceVerificationState;
  sourceState: GraphEvidenceSourceState;
  sourceReason: string | null;
}

const SOURCE_STATE_RANK: Record<GraphEvidenceSourceState, number> = {
  available: 0,
  unresolved: 1,
  missing: 2,
};

const VERIFICATION_RANK: Record<EvidenceVerificationState, number> = {
  verified: 0,
  edited: 1,
  proposed: 2,
  unresolved: 3,
  disputed: 4,
};

export function graphRelationKey(source: string, target: string): string {
  return source < target ? `${source}::${target}` : `${target}::${source}`;
}

function relationProjection(
  state: GraphRelationEvidenceState,
  reason: string,
  rowIds: string[] = [],
): GraphRelationProjection {
  const label =
    state === 'review'
      ? '待核对'
      : state === 'disputed'
        ? '存在争议'
        : state === 'stale'
          ? '来源失效'
          : state === 'clue'
            ? '线索'
            : '证据不足';
  return { state, label, reason, rowIds };
}

/**
 * 将一条论文边投影为关系级状态。
 * 只有同时包含两端论文的矩阵行才会进入候选；即便候选行已确认，也仍标记为待核对，
 * 因为现有 GraphEdge 记录无法证明该行就是这条关系的来源。
 */
export function projectGraphRelationEvidence(
  edge: { source: string; target: string },
  paperNodes: GraphNode[],
  rows: EvidenceRow[],
  files: FileNode[],
): GraphRelationProjection {
  const sourceNode = paperNodes.find((node) => node.id === edge.source);
  const targetNode = paperNodes.find((node) => node.id === edge.target);
  const fileById = new Map(files.map((file) => [file.id, file]));
  const sourceFile = sourceNode?.fileId ? fileById.get(sourceNode.fileId) : undefined;
  const targetFile = targetNode?.fileId ? fileById.get(targetNode.fileId) : undefined;

  if (
    !sourceNode?.fileId ||
    !targetNode?.fileId ||
    !sourceFile ||
    !targetFile ||
    sourceFile.deletedAt !== null ||
    targetFile.deletedAt !== null
  ) {
    return relationProjection('stale', '关系端点的来源文件不存在或已移入回收站');
  }

  const candidateRows = rows.filter((row) => {
    const rowFileIds = new Set(row.evidence.map((item) => item.fileId));
    return rowFileIds.has(sourceNode.fileId!) && rowFileIds.has(targetNode.fileId!);
  });
  if (candidateRows.length === 0) {
    return relationProjection(
      'insufficient',
      '当前没有同时涉及两端论文的矩阵行；这条关系尚未有可回读材料，不能作为引用证据。',
    );
  }

  const hasUnavailableSource = candidateRows.some((row) =>
    row.evidence.some((item) => {
      if (item.fileId !== sourceNode.fileId && item.fileId !== targetNode.fileId) return false;
      const file = fileById.get(item.fileId);
      return (
        !file ||
        file.deletedAt !== null ||
        !isResolvableLocator(item.locator, file.type)
      );
    }),
  );
  if (hasUnavailableSource) {
    return relationProjection(
      'stale',
      '候选矩阵材料中至少有一条来源或定位已失效；这些材料也不能证明该图谱边。',
      candidateRows.map((row) => row.id),
    );
  }

  if (
    candidateRows.some(
      (row) =>
        row.verification === 'disputed' ||
        row.evidence.some((item) => item.verification === 'disputed'),
    )
  ) {
    return relationProjection(
      'disputed',
      '候选矩阵材料存在争议；它们不等同于该图谱边的证据，图谱不会替你裁定关系。',
      candidateRows.map((row) => row.id),
    );
  }

  return relationProjection(
    'review',
    `矩阵中找到 ${candidateRows.length} 条同时涉及两端论文的候选材料，但这些材料不等同于该图谱边的证据；关系尚未绑定到具体主张。`,
    candidateRows.map((row) => row.id),
  );
}

/** 关键词节点挂接的是 GraphNode.id，需要先转换成真实 FileNode.id。 */
export function fileIdsForGraphSelection(input: {
  selectedPaper: GraphNode | null;
  selectedKeyword: KeywordNode | null;
  paperNodes: GraphNode[];
}): string[] {
  if (input.selectedPaper?.fileId) return [input.selectedPaper.fileId];
  if (!input.selectedKeyword) return [];
  return input.selectedKeyword.paperNodeIds
    .map((nodeId) => input.paperNodes.find((node) => node.id === nodeId)?.fileId)
    .filter((fileId, index, fileIds): fileId is string =>
      Boolean(fileId) && fileIds.indexOf(fileId) === index,
    );
}

/** PDF 页码或 EPUB CFI/location 可被现有 Reader renderer 消费。 */
export function isResolvableLocator(
  locator: EvidenceLocator,
  fileType?: FileType | null,
): boolean {
  if (locator.kind === 'pdf-page') {
    return (
      (fileType === undefined || fileType === 'pdf') &&
      Number.isFinite(locator.page) &&
      locator.page > 0
    );
  }
  if (locator.kind !== 'epub-cfi') return false;
  const cfi = locator.cfi?.trim() ?? '';
  return (
    (fileType === undefined || fileType === 'epub') &&
    (/^epubcfi\(.+\)$/.test(cfi) ||
      (locator.location != null &&
        Number.isInteger(locator.location) &&
        locator.location >= 0))
  );
}

export function resolveEvidenceSource(
  locator: EvidenceLocator,
  file: FileNode | undefined,
): { state: GraphEvidenceSourceState; reason: string | null } {
  if (!file || file.deletedAt !== null) {
    return { state: 'missing', reason: '来源文件不存在或已移入回收站' };
  }
  if (!isResolvableLocator(locator, file.type)) {
    return {
      state: 'unresolved',
      reason:
        locator.kind === 'unresolved'
          ? locator.reason
          : file.type === 'pdf' || file.type === 'epub'
            ? '来源定位与文件类型不匹配或暂时无法回放'
            : '该文件类型暂不支持定位回读',
    };
  }
  return { state: 'available', reason: null };
}

/**
 * 把选中节点关联文件的证据行扁平化为检查器需要的局部列表。
 * 只保留现有 EvidenceItem 的引用和快照，永不改变行的核验状态。
 */
export function selectGraphEvidenceAnchors(
  rows: EvidenceRow[],
  files: FileNode[],
  fileIds: string[],
  limit = 20,
): GraphEvidenceAnchor[] {
  const selected = new Set(fileIds);
  if (selected.size === 0) return [];
  const fileById = new Map(files.map((file) => [file.id, file]));
  const anchors: GraphEvidenceAnchor[] = [];
  const seenAnchorIds = new Set<string>();

  for (const row of rows) {
    for (const item of row.evidence) {
      if (!selected.has(item.fileId)) continue;
      const anchorId = `${row.matrixId}:${row.id}:${item.id}`;
      if (seenAnchorIds.has(anchorId)) continue;
      seenAnchorIds.add(anchorId);
      const source = resolveEvidenceSource(item.locator, fileById.get(item.fileId));
      anchors.push({
        id: anchorId,
        matrixId: row.matrixId,
        rowId: row.id,
        fileId: item.fileId,
        fileName: fileById.get(item.fileId)?.name ?? `文件 ${item.fileId}`,
        fileType: fileById.get(item.fileId)?.type ?? null,
        conclusion: row.conclusion,
        quotedText: item.quotedText,
        annotationBody: item.annotationBody,
        locator: item.locator,
        match: item.match,
        verification: item.verification,
        rowVerification: row.verification,
        sourceState: source.state,
        sourceReason: source.reason,
      });
    }
  }

  return anchors
    .sort((left, right) => {
      const stateDelta = SOURCE_STATE_RANK[left.sourceState] - SOURCE_STATE_RANK[right.sourceState];
      if (stateDelta !== 0) return stateDelta;
      const verificationDelta = VERIFICATION_RANK[left.verification] - VERIFICATION_RANK[right.verification];
      if (verificationDelta !== 0) return verificationDelta;
      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

export function locatorLabel(locator: EvidenceLocator): string {
  if (locator.kind === 'pdf-page') return `PDF 第 ${locator.page} 页`;
  if (locator.kind === 'epub-cfi') {
    if (locator.location != null) return `EPUB location ${locator.location}`;
    if (locator.sectionIndex != null) return `EPUB 章节 ${locator.sectionIndex}`;
    return 'EPUB CFI';
  }
  return `定位不可回读：${locator.reason}`;
}

export function matchLabel(match: EvidenceMatchMethod): string {
  if (match === 'annotation-exact') return '批注匹配';
  if (match === 'transcript-exact') return '文字稿匹配';
  return '未匹配';
}

export function verificationLabel(state: EvidenceVerificationState): string {
  if (state === 'verified') return '已确认';
  if (state === 'disputed') return '存在争议';
  if (state === 'unresolved') return '待核对';
  if (state === 'edited') return '已编辑';
  return 'AI 提议';
}

export function sourceStateLabel(state: GraphEvidenceSourceState): string {
  if (state === 'available') return '来源可回读';
  if (state === 'missing') return '来源失效';
  return '定位不可回读';
}

/** 避免未来 UI 把图谱锚点误当作可复制引用。 */
export function canOpenGraphEvidence(anchor: GraphEvidenceAnchor): boolean {
  return (
    anchor.sourceState === 'available' &&
    isResolvableLocator(anchor.locator, anchor.fileType)
  );
}
