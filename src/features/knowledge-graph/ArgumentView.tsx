import { AlertTriangle, BookOpen, ExternalLink, Plus } from 'lucide-react';
import { Badge, Button, Select } from '../../components/common';
import type {
  ResearchRelationProjection,
  ResearchRelationStatus,
  ResearchRelationType,
} from '../../types';
import {
  canOpenGraphEvidence,
  locatorLabel,
  matchLabel,
  sourceStateLabel,
  type GraphEvidenceAnchor,
} from '../../utils/graphEvidence';
import styles from './ArgumentView.module.css';

const ARGUMENT_RELATION_TYPES = [
  'supports',
  'contradicts',
  'qualifies',
  'extends',
] as const satisfies readonly ResearchRelationType[];

type ArgumentRelationType = (typeof ARGUMENT_RELATION_TYPES)[number];

export interface ArgumentQuestion {
  id: string;
  label: string;
  description?: string;
}

export interface ArgumentClaim {
  id: string;
  questionId: string;
  text: string;
  context?: string;
  relationIds?: string[];
  evidenceAnchorIds?: string[];
}

export interface ArgumentViewProps {
  questions: readonly ArgumentQuestion[];
  selectedQuestionId: string | null;
  onSelectQuestion: (questionId: string) => void;
  claims: readonly ArgumentClaim[];
  relations: readonly ResearchRelationProjection[];
  evidenceAnchors: readonly GraphEvidenceAnchor[];
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
  referenceLabels?: Readonly<Record<string, string>>;
  loading?: boolean;
  onOpenEvidenceMatrix: (claimId: string, rowIds: string[]) => void;
  onAddToEvidenceMatrix: (claimId: string, rowIds: string[]) => void;
  onOpenReader: (anchor: GraphEvidenceAnchor) => void;
  className?: string;
}

function relationLabel(type: ArgumentRelationType): string {
  if (type === 'supports') return '支持';
  if (type === 'contradicts') return '反驳';
  if (type === 'qualifies') return '条件化';
  return '延伸';
}

function relationTone(
  type: ArgumentRelationType,
): 'success' | 'danger' | 'warning' | 'accent' {
  if (type === 'supports') return 'success';
  if (type === 'contradicts') return 'danger';
  if (type === 'qualifies') return 'warning';
  return 'accent';
}

function relationStatusLabel(
  status: ResearchRelationStatus,
  origin: ResearchRelationProjection['origin'],
): string {
  if (origin === 'ai') return 'AI 提议 · 线索';
  if (status === 'verified') return '已核验';
  if (status === 'review') return '待核对';
  if (status === 'disputed') return '存在争议';
  if (status === 'stale') return '来源失效';
  return '线索';
}

function relationStatusTone(
  status: ResearchRelationStatus,
  origin: ResearchRelationProjection['origin'],
): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
  if (origin === 'ai') return 'accent';
  if (status === 'verified') return 'success';
  if (status === 'disputed') return 'danger';
  if (status === 'review' || status === 'stale') return 'warning';
  return 'neutral';
}

function relationReferenceLabel(
  relation: ResearchRelationProjection,
  claimId: string,
  referenceLabels: ArgumentViewProps['referenceLabels'],
): string {
  const reference =
    relation.sourceRef.kind === 'claim' && relation.sourceRef.id === claimId
      ? relation.targetRef
      : relation.sourceRef;
  return (
    referenceLabels?.[`${reference.kind}:${reference.id}`] ??
    referenceLabels?.[reference.id] ??
    `${reference.kind} ${reference.id}`
  );
}

function relationForClaim(
  relation: ResearchRelationProjection,
  claim: ArgumentClaim,
): boolean {
  if (claim.relationIds) return claim.relationIds.includes(relation.id);
  return (
    (relation.sourceRef.kind === 'claim' && relation.sourceRef.id === claim.id) ||
    (relation.targetRef.kind === 'claim' && relation.targetRef.id === claim.id)
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function EvidenceAnchor({
  anchor,
  onOpenReader,
}: {
  anchor: GraphEvidenceAnchor;
  onOpenReader: ArgumentViewProps['onOpenReader'];
}) {
  const readable = canOpenGraphEvidence(anchor);
  return (
    <li className={styles.anchor}>
      <div className={styles.anchorHeader}>
        <div className={styles.anchorSource}>
          <strong>{anchor.fileName}</strong>
          <span>{locatorLabel(anchor.locator)}</span>
        </div>
        <Badge
          aria-label={`来源状态：${sourceStateLabel(anchor.sourceState)}`}
          tone={readable ? 'success' : 'warning'}
          soft
        >
          {sourceStateLabel(anchor.sourceState)}
        </Badge>
      </div>
      <blockquote className={styles.quote}>
        {anchor.quotedText || '（没有摘录）'}
      </blockquote>
      <div className={styles.anchorMeta}>
        <span>{matchLabel(anchor.match)}</span>
        <span>{anchor.verification === 'verified' ? '摘录已核验' : '摘录待核对'}</span>
        <span>{anchor.rowVerification === 'verified' ? '矩阵行已核验' : '矩阵行待核对'}</span>
      </div>
      {!readable ? (
        <p className={styles.unavailable}>
          <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
          {anchor.sourceReason ?? '该来源暂时不能回读'}
        </p>
      ) : null}
      <Button
        aria-label={readable ? `回读 ${anchor.fileName}` : '来源不可回读'}
        className={styles.anchorAction}
        variant="secondary"
        size="sm"
        leftIcon={<BookOpen size={14} strokeWidth={1.5} />}
        disabled={!readable}
        onClick={() => onOpenReader(anchor)}
      >
        回读来源
      </Button>
    </li>
  );
}

export function ArgumentView({
  questions,
  selectedQuestionId,
  onSelectQuestion,
  claims,
  relations,
  evidenceAnchors,
  selectedClaimId,
  onSelectClaim,
  referenceLabels,
  loading = false,
  onOpenEvidenceMatrix,
  onAddToEvidenceMatrix,
  onOpenReader,
  className,
}: ArgumentViewProps) {
  const question = questions.find((item) => item.id === selectedQuestionId) ?? null;
  const questionClaims = claims.filter((claim) => claim.questionId === selectedQuestionId);
  const visibleClaims = questionClaims.slice(0, 10);
  const selectedClaim =
    questionClaims.find((claim) => claim.id === selectedClaimId) ??
    visibleClaims[0] ??
    null;
  const selectedRelations = selectedClaim
    ? relations.filter(
        (relation) =>
          ARGUMENT_RELATION_TYPES.includes(relation.type as ArgumentRelationType) &&
          relationForClaim(relation, selectedClaim),
      )
    : [];
  const anchorIds = new Set([
    ...(selectedClaim?.evidenceAnchorIds ?? []),
    ...selectedRelations.flatMap((relation) => relation.evidenceAnchorIds),
  ]);
  const selectedAnchors = evidenceAnchors
    .filter((anchor) => anchorIds.has(anchor.id))
    .slice(0, 20);
  const rowIds = unique(selectedRelations.flatMap((relation) => relation.evidenceRowIds));
  const rootClassName = [styles.root, className].filter(Boolean).join(' ');

  return (
    <section className={rootClassName} aria-label="论证视图">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>主张中心</p>
          <h2 className={styles.title}>论证</h2>
          <p className={styles.description}>
            关系用于解释证据路径；图谱距离和 AI 候选只代表导航线索。
          </p>
        </div>
        <div className={styles.questionField}>
          <label htmlFor="argument-question">当前研究问题</label>
          <Select
            id="argument-question"
            aria-label="选择研究问题"
            value={selectedQuestionId ?? ''}
            disabled={loading || questions.length === 0}
            options={
              questions.length > 0
                ? questions.map((item) => ({ value: item.id, label: item.label }))
                : [{ value: '', label: '暂无研究问题' }]
            }
            onChange={(event) => onSelectQuestion(event.target.value)}
          />
          {question?.description ? (
            <span className={styles.questionDescription}>{question.description}</span>
          ) : null}
        </div>
      </header>

      {!question ? (
        <div className={styles.empty} role="status">
          先选择一个研究问题，再查看其主张与证据关系。
        </div>
      ) : questionClaims.length === 0 ? (
        <div className={styles.empty} role="status">
          当前研究问题还没有主张；请先从证据工作台建立一条可核对主张。
        </div>
      ) : (
        <div className={styles.body}>
          <aside className={styles.claimRail} aria-label="研究主张列表">
            <div className={styles.laneHeader}>
              <span>研究主张</span>
              <span>{questionClaims.length}</span>
            </div>
            <ul className={styles.claimList}>
              {visibleClaims.map((claim) => {
                const active = claim.id === selectedClaim?.id;
                return (
                  <li key={claim.id}>
                    <button
                      type="button"
                      className={`${styles.claimButton}${active ? ` ${styles.claimButtonActive}` : ''}`}
                      aria-label={`查看主张：${claim.text}`}
                      aria-pressed={active}
                      onClick={() => onSelectClaim(claim.id)}
                    >
                      <span className={styles.claimIndex}>{String(visibleClaims.indexOf(claim) + 1).padStart(2, '0')}</span>
                      <span className={styles.claimText}>{claim.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {questionClaims.length > visibleClaims.length ? (
              <p className={styles.moreClaims}>其余 {questionClaims.length - visibleClaims.length} 条主张已折叠。</p>
            ) : null}
          </aside>

          {!selectedClaim ? (
            <div className={styles.empty}>选择一条主张，查看支持、反驳与局部证据。</div>
          ) : (
            <div className={styles.detail}>
              <div className={styles.claimHeading}>
                <div>
                  <p className={styles.kicker}>当前主张</p>
                  <h3 className={styles.claimTitle}>{selectedClaim.text}</h3>
                  {selectedClaim.context ? <p className={styles.claimContext}>{selectedClaim.context}</p> : null}
                </div>
                <Badge aria-label="图谱关系事实等级" tone="neutral" soft>
                  关系仅作导航线索
                </Badge>
              </div>

              <div className={styles.laneGrid}>
                <section className={styles.relationLane} aria-label="主张关系">
                  <div className={styles.laneHeader}>
                    <span>关系解释</span>
                    <span>{selectedRelations.length}</span>
                  </div>
                  {selectedRelations.length === 0 ? (
                    <p className={styles.muted}>暂无已绑定的支持、反驳、条件化或延伸关系。</p>
                  ) : (
                    <ul className={styles.relationList}>
                      {selectedRelations.map((relation) => {
                        const type = relation.type as ArgumentRelationType;
                        const aiClue = relation.origin === 'ai';
                        return (
                          <li className={`${styles.relation} ${aiClue ? styles.relationClue : ''}`} key={relation.id}>
                            <div className={styles.relationHeader}>
                              <Badge aria-label={`关系类型：${relationLabel(type)}`} tone={relationTone(type)} soft>
                                {relationLabel(type)}
                              </Badge>
                              <Badge
                                aria-label={`关系状态：${relationStatusLabel(relation.status, relation.origin)}`}
                                tone={relationStatusTone(relation.status, relation.origin)}
                                soft
                              >
                                {relationStatusLabel(relation.status, relation.origin)}
                              </Badge>
                            </div>
                            <strong className={styles.relationTarget}>
                              {relationReferenceLabel(relation, selectedClaim.id, referenceLabels)}
                            </strong>
                            <p className={styles.relationReason}>{relation.reason || '来源未记录'}</p>
                            <span className={styles.relationSource}>
                              {aiClue ? 'AI 候选，不是已确认事实' : `来源：${relation.origin === 'unknown' ? '来源未记录' : relation.origin}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className={styles.evidenceLane} aria-label="局部证据锚点">
                  <div className={styles.laneHeader}>
                    <span>局部证据锚点</span>
                    <span>{selectedAnchors.length}{anchorIds.size > 20 ? ' / 20' : ''}</span>
                  </div>
                  {selectedAnchors.length === 0 ? (
                    <p className={styles.muted}>该主张尚未绑定可回读证据；关系不会因此自动升级为事实。</p>
                  ) : (
                    <ul className={styles.anchorList}>
                      {selectedAnchors.map((anchor) => (
                        <EvidenceAnchor key={anchor.id} anchor={anchor} onOpenReader={onOpenReader} />
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <footer className={styles.actions}>
                <Button
                  aria-label="查看证据矩阵"
                  variant="secondary"
                  size="sm"
                  leftIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                  disabled={rowIds.length === 0}
                  onClick={() => onOpenEvidenceMatrix(selectedClaim.id, rowIds)}
                >
                  查看证据
                </Button>
                <Button
                  aria-label="加入证据矩阵"
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus size={14} strokeWidth={1.5} />}
                  disabled={rowIds.length === 0}
                  onClick={() => onAddToEvidenceMatrix(selectedClaim.id, rowIds)}
                >
                  加入证据矩阵
                </Button>
                <span className={styles.actionHint}>
                  {rowIds.length > 0 ? `已关联 ${rowIds.length} 条矩阵行` : '暂无矩阵行可操作'}
                </span>
              </footer>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
