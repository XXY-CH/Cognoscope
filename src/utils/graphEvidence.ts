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
  GraphNode,
  KeywordNode,
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
