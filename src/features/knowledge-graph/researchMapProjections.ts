import type {
  EvidenceItem,
  EvidenceMatrix,
  EvidenceRow,
  EvidenceType,
  FileNode,
  GraphNode,
  KeywordNode,
  ResearchRelationOrigin,
  ResearchRelationProjection,
  ResearchRelationStatus,
} from '../../types';
import {
  isResolvableLocator,
  selectGraphEvidenceAnchors,
  type GraphEvidenceAnchor,
} from '../../utils/graphEvidence';
import type { ArgumentClaim, ArgumentQuestion } from './ArgumentView';
import type {
  ComparisonCell,
  ComparisonClaim,
  ComparisonColumn,
  EvolutionEvent,
} from './ComparisonEvolutionView';
import type {
  MaterialsHierarchyData,
  MaterialsPaper,
  MaterialsTopicCluster,
} from './MaterialsHierarchyView';

export interface ArgumentProjection {
  questions: ArgumentQuestion[];
  claims: ArgumentClaim[];
  relations: ResearchRelationProjection[];
  anchors: GraphEvidenceAnchor[];
  referenceLabels: Record<string, string>;
}

export interface ComparisonProjection {
  question: string;
  columns: ComparisonColumn[];
  claims: ComparisonClaim[];
}

const ARGUMENT_TYPE_BY_EVIDENCE: Partial<Record<EvidenceType, ResearchRelationProjection['type']>> = {
  support: 'supports',
  refute: 'contradicts',
  condition: 'qualifies',
  limitation: 'qualifies',
  method: 'extends',
  data: 'extends',
};

function relationOrigin(item: EvidenceItem): ResearchRelationOrigin {
  if (item.provenance === 'ai') return 'ai';
  if (item.provenance === 'mixed') return 'mixed';
  if (item.provenance === 'annotation' || item.provenance === 'user') return 'user';
  return 'unknown';
}

function anchorId(row: EvidenceRow, item: EvidenceItem): string {
  return `${row.matrixId}:${row.id}:${item.id}`;
}

function statusForItem(
  row: EvidenceRow,
  item: EvidenceItem,
  file: FileNode | undefined,
): ResearchRelationStatus {
  if (!file || file.deletedAt !== null || !isResolvableLocator(item.locator, file.type)) {
    return 'stale';
  }
  if (row.verification === 'disputed' || item.verification === 'disputed') return 'disputed';
  if (row.verification === 'verified' && item.verification === 'verified') return 'verified';
  return 'review';
}

function displayQuestion(matrix: EvidenceMatrix): ArgumentQuestion {
  return {
    id: matrix.id,
    label: matrix.comparisonQuestion.trim() || '未命名研究问题',
    description: `${matrix.fileIds.length} 篇论文 · 证据状态：${matrix.extractionState === 'ready' ? '已整理' : '待整理'}`,
  };
}

export function buildArgumentProjection(
  matrices: readonly EvidenceMatrix[],
  rows: readonly EvidenceRow[],
  files: readonly FileNode[],
): ArgumentProjection {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const anchors = selectGraphEvidenceAnchors(
    [...rows],
    [...files],
    [...new Set(rows.flatMap((row) => row.evidence.map((item) => item.fileId)))],
    2000,
  );
  const referenceLabels: Record<string, string> = {};
  for (const anchor of anchors) {
    referenceLabels[anchor.id] = `${anchor.fileName} · ${anchor.conclusion}`;
    referenceLabels[`evidence:${anchor.id}`] = `${anchor.fileName} · ${anchor.conclusion}`;
  }

  const questions = matrices.map(displayQuestion);
  const claims: ArgumentClaim[] = rows.map((row) => ({
    id: row.id,
    questionId: row.matrixId,
    text: row.conclusion || '未命名主张',
    context: row.originalProposal ?? undefined,
    evidenceAnchorIds: row.evidence.map((item) => anchorId(row, item)),
  }));

  const relations: ResearchRelationProjection[] = [];
  for (const row of rows) {
    for (const item of row.evidence) {
      const type = ARGUMENT_TYPE_BY_EVIDENCE[item.evidenceType ?? 'unknown'];
      if (!type) continue;
      const evidenceId = anchorId(row, item);
      relations.push({
        id: `relation:claim:${encodeURIComponent(row.id)}->evidence:${encodeURIComponent(evidenceId)}:${type}`,
        type,
        sourceRef: { kind: 'claim', id: row.id },
        targetRef: { kind: 'evidence', id: evidenceId },
        reason:
          item.condition?.trim() ||
          item.note?.trim() ||
          row.originalProposal?.trim() ||
          '关系来自证据矩阵中的作用标注；仍需回读来源核验。',
        origin: relationOrigin(item),
        status: statusForItem(row, item, fileById.get(item.fileId)),
        evidenceAnchorIds: [evidenceId],
        evidenceRowIds: [row.id],
        conditionIds: [],
      });
    }
  }

  return { questions, claims, relations, anchors, referenceLabels };
}

function cellLabel(item: EvidenceItem): string {
  if (item.evidenceType === 'support') return '支持';
  if (item.evidenceType === 'refute') return '反驳';
  if (item.evidenceType === 'condition') return '条件';
  if (item.evidenceType === 'limitation') return '局限';
  if (item.evidenceType === 'method') return '方法';
  if (item.evidenceType === 'data') return '数据';
  return '待核对';
}

function comparisonStatus(
  row: EvidenceRow,
  item: EvidenceItem,
  file: FileNode | undefined,
): ComparisonCell['status'] {
  const status = statusForItem(row, item, file);
  if (status === 'verified') return 'verified';
  if (status === 'disputed') return 'disputed';
  if (status === 'stale') return 'stale';
  return item.verification === 'unresolved' ? 'unresolved' : 'review';
}

export function buildComparisonProjection(
  matrix: EvidenceMatrix | null,
  rows: readonly EvidenceRow[],
  files: readonly FileNode[],
  anchors: readonly GraphEvidenceAnchor[],
): ComparisonProjection {
  if (!matrix) return { question: '', columns: [], claims: [] };
  const fileById = new Map(files.map((file) => [file.id, file]));
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const matrixRows = rows.filter((row) => row.matrixId === matrix.id);
  const columns = matrix.fileIds
    .map((fileId) => ({ id: fileId, label: fileById.get(fileId)?.name ?? `文件 ${fileId}` }));
  const claims = matrixRows.map((row) => {
    const cells: Record<string, ComparisonCell> = {};
    for (const fileId of matrix.fileIds) {
      const item = row.evidence.find((candidate) => candidate.fileId === fileId);
      if (!item) continue;
      const id = anchorId(row, item);
      const anchor = anchorById.get(id) ?? null;
      cells[fileId] = {
        id,
        label: cellLabel(item),
        detail: item.condition?.trim() || item.note?.trim() || undefined,
        status: comparisonStatus(row, item, fileById.get(fileId)),
        rowId: row.id,
        matrixId: row.matrixId,
        anchor,
        locator: item.locator,
      };
    }
    return { id: row.id, text: row.conclusion || '未命名主张', rowId: row.id, matrixId: row.matrixId, cells };
  });
  return { question: matrix.comparisonQuestion, columns, claims };
}

export function buildEvolutionEvents(
  rows: readonly EvidenceRow[],
  files: readonly FileNode[],
  anchors: readonly GraphEvidenceAnchor[],
): EvolutionEvent[] {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  return [...rows]
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .map((row) => {
      const firstItem = row.evidence[0];
      const firstAnchor = firstItem ? anchorById.get(anchorId(row, firstItem)) ?? null : null;
      const sourceLabels = [...new Set(row.evidence.map((item) => fileById.get(item.fileId)?.name ?? item.fileId))];
      const stale = row.evidence.some((item) => {
        const file = fileById.get(item.fileId);
        return !file || file.deletedAt !== null || !isResolvableLocator(item.locator, file.type);
      });
      const hasEvidence = row.evidence.length > 0;
      const status: EvolutionEvent['status'] = !hasEvidence
        ? 'review'
        : stale
        ? 'stale'
        : row.verification === 'disputed'
          ? 'disputed'
          : row.verification === 'verified'
            ? 'verified'
            : 'review';
      const state = !hasEvidence
        ? '草案'
        : stale
        ? '待审视'
        : row.verification === 'disputed'
          ? '出现反例'
          : row.verification === 'verified'
            ? '当前判断'
            : '条件化';
      return {
        id: `evolution:${row.matrixId}:${row.id}`,
        state,
        statement: row.conclusion || '未命名判断',
        reason: !hasEvidence
          ? '尚未绑定证据锚点，保留为待核对草案。'
          : stale
          ? '来源或定位已失效，判断自动降级为待审视。'
          : row.originalProposal || '判断来自证据矩阵行，保留原始核验状态。',
        status,
        occurredAt: row.updatedAt || row.createdAt,
        matrixId: row.matrixId,
        rowId: row.id,
        anchor: firstAnchor,
        sourceLabels,
      } satisfies EvolutionEvent;
    });
}

export function buildMaterialsHierarchy(
  paperNodes: readonly GraphNode[],
  keywordNodes: readonly KeywordNode[],
): MaterialsHierarchyData {
  const paperById = new Map(paperNodes.map((node) => [node.id, node]));
  const usedPaperIds = new Set<string>();
  const clusters: MaterialsTopicCluster[] = [...keywordNodes]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((keyword) => {
      const papers: MaterialsPaper[] = keyword.paperNodeIds
        .map((paperId) => paperById.get(paperId))
        .filter((paper): paper is GraphNode => Boolean(paper))
        .map((paper) => {
          usedPaperIds.add(paper.id);
          return {
            id: paper.id,
            label: paper.label,
            fileId: paper.fileId,
            reason: '论文由主题元数据挂接到该主题簇；主题本身只是整理线索。',
            source: 'metadata',
          };
        });
      return {
        id: `cluster:${keyword.id}`,
        label: keyword.label,
        description: keyword.aliases.length > 0 ? `别名：${keyword.aliases.join('、')}` : undefined,
        reason: '主题来自论文元数据或关键词提取；展开后查看局部资料。',
        source: 'metadata',
        papers,
      };
    });
  const ungrouped = paperNodes
    .filter((paper) => !usedPaperIds.has(paper.id))
    .map((paper) => ({
      id: paper.id,
      label: paper.label,
      fileId: paper.fileId,
      reason: '论文尚未挂接主题簇，仍可作为独立来源回读。',
      source: 'structure' as const,
    }));
  if (ungrouped.length > 0) {
    clusters.push({
      id: 'cluster:ungrouped',
      label: '未分组资料',
      description: '尚未被主题元数据覆盖的论文',
      reason: '未分组不表示论文之间存在科学关系。',
      source: 'structure',
      papers: ungrouped,
    });
  }
  return {
    scope: {
      id: 'scope:local',
      label: '本地研究空间',
      description: `${paperNodes.length} 篇论文 · ${keywordNodes.length} 个主题`,
      reason: '研究范围只约束当前资料投影，不生成科学关系。',
      source: 'structure',
    },
    clusters,
  };
}
