/**
 * GraphInspector - 选中节点的证据与回读入口
 * 将图上的一条关系还原为论文、关键词和生成依据，避免只看视觉连线。
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  FileText,
  GitCompareArrows,
  Hash,
  Link2,
  X,
} from 'lucide-react';
import { Badge, Button, IconButton } from '../../components/common';
import type {
  FileDocMeta,
  GraphEdge,
  GraphNode,
  KeywordEdge,
  KeywordNode,
} from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  canOpenGraphEvidence,
  graphRelationKey,
  locatorLabel,
  matchLabel,
  type GraphRelationProjection,
  sourceStateLabel,
  type GraphEvidenceAnchor,
  verificationLabel,
} from '../../utils/graphEvidence';
import styles from './GraphInspector.module.css';

interface GraphInspectorProps {
  selectedPaper: GraphNode | null;
  selectedKeyword: KeywordNode | null;
  paperNodes: GraphNode[];
  paperEdges: GraphEdge[];
  keywordNodes: KeywordNode[];
  keywordEdges: KeywordEdge[];
  selectedMeta: FileDocMeta | null;
  metaLoading: boolean;
  readableFileIds: ReadonlySet<string>;
  evidenceAnchors: GraphEvidenceAnchor[];
  evidenceLoading: boolean;
  evidenceError: string | null;
  relationEvidenceByKey: ReadonlyMap<string, GraphRelationProjection>;
  onSelectPaper: (node: GraphNode) => void;
  onOpenPaper: (fileId: string) => void;
  onOpenEvidence: (anchor: GraphEvidenceAnchor) => void;
  onCreateComparison: (fileIds: string[]) => void;
  onClose: () => void;
}

function originLabel(origin: GraphEdge['origin']): string {
  if (origin === 'ai') return '自动语义线索';
  if (origin === 'cooccurrence') return '关键词共现';
  if (origin === 'mixed') return '共现 + 自动语义';
  if (origin === 'manual') return '用户确认';
  return '来源未记录';
}

function evidenceStateForSelection(
  anchors: GraphEvidenceAnchor[],
): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  if (anchors.length === 0) return { label: '暂无回读材料', tone: 'neutral' };
  if (anchors.some((anchor) => canOpenGraphEvidence(anchor))) {
    return { label: '有可回读锚点', tone: 'success' };
  }
  return { label: '锚点待核对', tone: 'warning' };
}

function originTone(
  origin: GraphEdge['origin'],
): 'accent' | 'success' | 'warning' | 'neutral' {
  if (origin === 'ai') return 'accent';
  if (origin === 'cooccurrence') return 'success';
  if (origin === 'mixed') return 'accent';
  if (origin === 'manual') return 'warning';
  return 'neutral';
}

function relationReason(
  origin: GraphEdge['origin'],
  reason: string | undefined,
): string {
  return (
    reason ||
    (origin === 'cooccurrence'
      ? '两篇论文的关键词在图谱中共同出现'
      : origin === 'ai'
        ? '自动语义分析提供关系导航建议'
        : origin === 'mixed'
          ? '关键词共现与自动语义分析共同提供导航建议'
          : origin === 'manual'
            ? '由用户确认的关系'
            : '该关系在早期版本中生成，来源尚未记录')
  );
}

function edgeOtherId(edge: GraphEdge | KeywordEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}

function EvidenceBadge({
  origin,
}: {
  origin: GraphEdge['origin'];
}) {
  const label = originLabel(origin);
  return (
    <Badge aria-label={`关系来源：${label}`} tone={originTone(origin)} soft>
      {label}
    </Badge>
  );
}

function RelationStatusBadge({
  projection,
}: {
  projection: GraphRelationProjection;
}) {
  const tone =
    projection.state === 'disputed'
      ? 'danger'
      : projection.state === 'stale'
        ? 'warning'
        : projection.state === 'review'
          ? 'accent'
          : 'neutral';
  return (
    <Badge aria-label={`证据状态：${projection.label}`} tone={tone} soft>
      {projection.label}
    </Badge>
  );
}

function relationProjectionFor(
  relationEvidenceByKey: ReadonlyMap<string, GraphRelationProjection>,
  source: string,
  target: string,
): GraphRelationProjection {
  return (
    relationEvidenceByKey.get(graphRelationKey(source, target)) ?? {
      state: 'insufficient',
      label: '证据不足',
      reason: '该关系尚未绑定到具体矩阵主张，不能直接作为引用证据。',
      rowIds: [],
    }
  );
}

function metadataRelationProjection(): GraphRelationProjection {
  return {
    state: 'clue',
    label: '主题关联',
    reason: '主题来自论文元数据或关键词提取；可用于整理与回读，不能替代主张核验。',
    rowIds: [],
  };
}

function relationSupportLabel(projection: GraphRelationProjection): string {
  return projection.rowIds.length > 0
    ? `矩阵候选 ${projection.rowIds.length} 条，仍需核对`
    : '尚未绑定矩阵主张';
}

function EvidenceAnchorList({
  anchors,
  loading,
  error,
  onOpenEvidence,
  fromKeyword = false,
}: {
  anchors: GraphEvidenceAnchor[];
  loading: boolean;
  error: string | null;
  onOpenEvidence: (anchor: GraphEvidenceAnchor) => void;
  fromKeyword?: boolean;
}) {
  return (
    <div className={styles.evidenceAnchors}>
      <div className={styles.sectionHeading}>
        {fromKeyword ? '关联论文的证据锚点' : '证据锚点'}
      </div>
      {loading ? (
        <p className={styles.muted} role="status">正在读取可回读证据…</p>
      ) : error ? (
        <p className={styles.unavailable} role="alert">
          <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
          证据读取失败：{error}
        </p>
      ) : anchors.length === 0 ? (
        <p className={styles.muted}>暂无已保存的证据锚点；当前节点还没有可回读材料。</p>
      ) : (
        <ul className={styles.anchorList}>
          {anchors.map((anchor) => {
            const canOpen = canOpenGraphEvidence(anchor);
            return (
              <li className={styles.anchor} key={anchor.id}>
                <div className={styles.anchorHeader}>
                  <div className={styles.anchorSource}>
                    <strong>{anchor.fileName}</strong>
                    <span>{anchor.conclusion}</span>
                  </div>
                  <Badge
                    aria-label={`来源状态：${sourceStateLabel(anchor.sourceState)}`}
                    tone={canOpen ? 'success' : 'warning'}
                    soft
                  >
                    {sourceStateLabel(anchor.sourceState)}
                  </Badge>
                </div>
                <blockquote className={styles.quote}>
                  {anchor.quotedText || '（没有摘录）'}
                </blockquote>
                {anchor.annotationBody ? (
                  <p className={styles.annotationHint}>
                    用户批注：{anchor.annotationBody}
                  </p>
                ) : null}
                <div className={styles.anchorMeta}>
                  <span>{locatorLabel(anchor.locator)}</span>
                  <Badge aria-label={`匹配方式：${matchLabel(anchor.match)}`} tone={anchor.match === 'none' ? 'warning' : 'success'} soft>
                    {matchLabel(anchor.match)}
                  </Badge>
                  <Badge aria-label={`核验状态：${verificationLabel(anchor.verification)}`} tone={anchor.verification === 'verified' ? 'success' : 'neutral'} soft>
                    摘录：{verificationLabel(anchor.verification)}
                  </Badge>
                  <Badge aria-label={`矩阵行状态：${verificationLabel(anchor.rowVerification)}`} tone={anchor.rowVerification === 'verified' ? 'success' : 'neutral'} soft>
                    行：{verificationLabel(anchor.rowVerification)}
                  </Badge>
                </div>
                {!canOpen ? (
                  <p className={styles.unavailable}>
                    <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
                    {anchor.sourceReason ?? '该来源暂时不能回读'}
                  </p>
                ) : null}
                <Button
                  className={styles.anchorAction}
                  aria-label={canOpen ? `回读 ${anchor.fileName}` : '来源不可回读'}
                  variant="secondary"
                  size="sm"
                  leftIcon={<BookOpen size={14} strokeWidth={1.5} />}
                  disabled={!canOpen}
                  onClick={() => onOpenEvidence(anchor)}
                >
                  回读来源
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {fromKeyword ? (
        <p className={styles.reason}>这些锚点来自关联论文，不代表主题关系本身已经得到主张核验。</p>
      ) : null}
    </div>
  );
}

export function GraphInspector({
  selectedPaper,
  selectedKeyword,
  paperNodes,
  paperEdges,
  keywordNodes,
  keywordEdges,
  selectedMeta,
  metaLoading,
  readableFileIds,
  evidenceAnchors,
  evidenceLoading,
  evidenceError,
  relationEvidenceByKey,
  onSelectPaper,
  onOpenPaper,
  onOpenEvidence,
  onCreateComparison,
  onClose,
}: GraphInspectorProps) {
  const selectedId = selectedPaper?.id ?? selectedKeyword?.id ?? null;
  const inspectorRef = useRef<HTMLElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useFocusTrap(inspectorRef, Boolean(selectedId) && isMobile, onClose);

  if (!selectedId) {
    return (
      <section className={styles.inspector} aria-label="节点详情">
        <div className={styles.empty}>
          <Link2 size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>选择论文或关键词，查看关联证据</span>
        </div>
      </section>
    );
  }

  if (selectedPaper) {
    const evidenceState = evidenceStateForSelection(evidenceAnchors);
    const relatedPapers = paperEdges
      .filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .map((edge) => ({
        edge,
        node: paperNodes.find((node) => node.id === edgeOtherId(edge, selectedId)),
      }))
      .filter((item): item is { edge: GraphEdge; node: GraphNode } => Boolean(item.node));
    const relatedKeywords = keywordNodes.filter((node) =>
      node.paperNodeIds.includes(selectedId),
    );
    const fileId = selectedPaper.fileId;
    const comparisonFileIds = [
      fileId,
      ...relatedPapers
        .sort((left, right) => right.edge.weight - left.edge.weight)
        .map(({ node }) => node.fileId),
    ]
      .filter(
        (id, index, ids): id is string =>
          typeof id === 'string' &&
          readableFileIds.has(id) &&
          ids.indexOf(id) === index,
      )
      .slice(0, 5);
    const canOpenPaper = Boolean(fileId && readableFileIds.has(fileId));

    return (
      <section
        ref={inspectorRef}
        className={styles.inspector}
        data-active="true"
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-label="论文节点详情"
      >
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <FileText size={18} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <h3 className={styles.title}>{selectedPaper.label}</h3>
              <p className={styles.subtitle}>
                <Badge aria-label="节点类型：论文" tone="neutral" soft>
                  论文
                </Badge>
                <span>{relatedPapers.length} 条论文关系</span>
                <Badge
                  aria-label={`选中节点证据状态：${evidenceState.label}`}
                  tone={evidenceState.tone}
                  soft
                >
                  {evidenceState.label}
                </Badge>
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <IconButton
              className={styles.mobileClose}
              aria-label="关闭节点详情"
              onClick={onClose}
            >
              <X size={18} strokeWidth={1.5} />
            </IconButton>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.sectionHeading}>文献线索</div>
            {metaLoading ? (
              <p className={styles.muted}>正在读取摘要…</p>
            ) : selectedMeta?.abstract ? (
              <p className={styles.abstract}>{selectedMeta.abstract}</p>
            ) : (
              <p className={styles.muted}>暂无摘要；可回到文件目录补充文首元数据。</p>
            )}
            {relatedKeywords.length > 0 ? (
              <div className={styles.evidence}>
                <div className={styles.sectionHeading}>关联主题</div>
                <ul className={styles.list}>
                  {relatedKeywords.map((keyword) => {
                    const projection = metadataRelationProjection();
                    return (
                      <li className={styles.listItem} key={keyword.id}>
                        <div className={styles.relationMeta}>
                          <span className={styles.relationTitle}>{keyword.label}</span>
                          <EvidenceBadge origin="cooccurrence" />
                          <RelationStatusBadge projection={metadataRelationProjection()} />
                        </div>
                        <p className={styles.reason}>
                          主题来自论文元数据或关键词提取；可用于整理与回读，不能替代主张核验。
                        </p>
                        <p className={styles.reason}>{projection.reason}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          <div className={styles.evidence}>
            <div className={styles.sectionHeading}>论文关系依据</div>
            {relatedPapers.length === 0 ? (
              <p className={styles.muted}>暂无跨论文关系。</p>
            ) : (
              <ul className={styles.list}>
                {relatedPapers.map(({ edge, node }) => {
                  const projection = relationProjectionFor(
                    relationEvidenceByKey,
                    edge.source,
                    edge.target,
                  );
                  return (
                    <li key={`${edge.source}-${edge.target}`} className={styles.listItem}>
                      <button
                        type="button"
                        className={styles.relationButton}
                        aria-label={`查看关联论文 ${node.label}`}
                        onClick={() => onSelectPaper(node)}
                      >
                        <span className={styles.relationTitle}>{node.label}</span>
                        <span className={styles.relationMeta}>
                          <EvidenceBadge origin={edge.origin} />
                          <RelationStatusBadge projection={projection} />
                        </span>
                      </button>
                      <p className={styles.reason}>
                        {relationReason(edge.origin, edge.reason)}
                      </p>
                      <p className={styles.reason}>
                        {relationSupportLabel(projection)}；{projection.reason}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <EvidenceAnchorList
            anchors={evidenceAnchors}
            loading={evidenceLoading}
            error={evidenceError}
            onOpenEvidence={onOpenEvidence}
          />
        </div>
        <div className={styles.actions} role="group" aria-label="论文节点操作">
          {fileId ? (
            <Button
              aria-label={`打开 ${selectedPaper.label}`}
              title={canOpenPaper ? undefined : '来源文件不存在或已移入回收站'}
              variant="secondary"
              size="sm"
              leftIcon={<BookOpen size={15} strokeWidth={1.5} />}
              disabled={!canOpenPaper}
              onClick={() => onOpenPaper(fileId)}
            >
              打开阅读
            </Button>
          ) : null}
          <Button
            aria-label="用当前论文簇创建证据矩阵"
            title={comparisonFileIds.length < 3 ? '当前论文簇不足 3 篇论文' : undefined}
            variant="ghost"
            size="sm"
            leftIcon={<GitCompareArrows size={15} strokeWidth={1.5} />}
            disabled={comparisonFileIds.length < 3}
            onClick={() => onCreateComparison(comparisonFileIds)}
          >
            比较论文簇
          </Button>
        </div>
      </section>
    );
  }

  // 状态 id 与节点列表异步更新时可能短暂不一致。
  if (!selectedKeyword) return null;

  const relatedPapers = selectedKeyword.paperNodeIds
    .map((id) => paperNodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => Boolean(node));
  const relatedKeywords = keywordEdges
    .filter(
      (edge) => edge.source === selectedKeyword.id || edge.target === selectedKeyword.id,
    )
    .map((edge) => ({
      edge,
      node: keywordNodes.find(
        (node) => node.id === edgeOtherId(edge, selectedKeyword.id),
      ),
    }))
    .filter((item): item is { edge: KeywordEdge; node: KeywordNode } => Boolean(item.node));
  const comparisonFileIds = relatedPapers
    .map((paper) => paper.fileId)
    .filter(
      (id, index, ids): id is string =>
        typeof id === 'string' &&
        readableFileIds.has(id) &&
        ids.indexOf(id) === index,
    )
    .slice(0, 5);
  const evidenceState = evidenceStateForSelection(evidenceAnchors);

  return (
    <section
      ref={inspectorRef}
      className={styles.inspector}
      data-active="true"
      role={isMobile ? 'dialog' : undefined}
      aria-modal={isMobile ? true : undefined}
      aria-label="关键词节点详情"
    >
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <Hash size={18} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h3 className={styles.title}>{selectedKeyword.label}</h3>
            <p className={styles.subtitle}>
              <Badge aria-label="节点类型：关键词" tone="success" soft>
                关键词
              </Badge>
              <span>{relatedPapers.length} 篇关联论文</span>
              <Badge
                aria-label={`选中节点证据状态：${evidenceState.label}`}
                tone={evidenceState.tone}
                soft
              >
                {evidenceState.label}
              </Badge>
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <IconButton
            className={styles.mobileClose}
            aria-label="关闭节点详情"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.evidence}>
          <div className={styles.sectionHeading}>关联论文</div>
          {relatedPapers.length === 0 ? (
            <p className={styles.muted}>暂无可回读的论文。</p>
          ) : (
            <ul className={styles.list}>
              {relatedPapers.map((paper) => {
                const canOpenPaper = Boolean(
                  paper.fileId && readableFileIds.has(paper.fileId),
                );
                const projection = metadataRelationProjection();
                return (
                  <li key={paper.id} className={styles.listItem}>
                    <div className={styles.paperRow}>
                      <button
                        type="button"
                        className={styles.relationButton}
                        aria-label={`查看论文 ${paper.label}`}
                        onClick={() => onSelectPaper(paper)}
                      >
                        <span className={styles.relationTitle}>{paper.label}</span>
                      </button>
                      <div className={styles.relationMeta}>
                        <EvidenceBadge origin="cooccurrence" />
                        <RelationStatusBadge projection={projection} />
                      </div>
                      {paper.fileId ? (
                        <Button
                          aria-label={`打开 ${paper.label}`}
                          title={
                            canOpenPaper
                              ? undefined
                              : '来源文件不存在或已移入回收站'
                          }
                          variant="ghost"
                          size="sm"
                          leftIcon={<BookOpen size={14} strokeWidth={1.5} />}
                          disabled={!canOpenPaper}
                          onClick={() => onOpenPaper(paper.fileId!)}
                        >
                          阅读
                        </Button>
                      ) : null}
                    </div>
                    <p className={styles.reason}>
                      主题来自论文元数据或关键词提取；可用于整理与回读，不能替代主张核验。
                    </p>
                    <p className={styles.reason}>{relationSupportLabel(projection)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.evidence}>
          <div className={styles.sectionHeading}>邻近关键词</div>
          {relatedKeywords.length === 0 ? (
            <p className={styles.muted}>暂无关键词关系。</p>
          ) : (
            <ul className={styles.list}>
              {relatedKeywords.map(({ edge, node }) => (
                <li key={`${edge.source}-${edge.target}`} className={styles.listItem}>
                  <div className={styles.relationMeta}>
                    <span className={styles.relationTitle}>{node.label}</span>
                    <EvidenceBadge origin={edge.origin} />
                    <RelationStatusBadge projection={metadataRelationProjection()} />
                  </div>
                  <p className={styles.reason}>
                    {relationReason(edge.origin, edge.reason)}
                  </p>
                  <p className={styles.reason}>{metadataRelationProjection().reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <EvidenceAnchorList
          anchors={evidenceAnchors}
          loading={evidenceLoading}
          error={evidenceError}
          onOpenEvidence={onOpenEvidence}
          fromKeyword
        />
      </div>
      <div className={styles.actions} role="group" aria-label="关键词节点操作">
        <Button
          aria-label="用当前关键词关联论文创建证据矩阵"
          title={comparisonFileIds.length < 3 ? '当前关键词关联论文不足 3 篇' : undefined}
          variant="ghost"
          size="sm"
          leftIcon={<GitCompareArrows size={15} strokeWidth={1.5} />}
          disabled={comparisonFileIds.length < 3}
          onClick={() => onCreateComparison(comparisonFileIds)}
        >
          比较论文簇
        </Button>
      </div>
    </section>
  );
}
