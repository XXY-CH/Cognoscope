import { BookOpen, ExternalLink, History, Rows3 } from 'lucide-react';
import { Badge, Button } from '../../components/common';
import type { EvidenceLocator } from '../../types';
import {
  canOpenGraphEvidence,
  locatorLabel,
  sourceStateLabel,
  type GraphEvidenceAnchor,
} from '../../utils/graphEvidence';
import styles from './ComparisonEvolutionView.module.css';

export type ComparisonViewMode = 'comparison' | 'evolution';

export interface ComparisonColumn {
  id: string;
  label: string;
}

export interface ComparisonCell {
  id: string;
  label: string;
  detail?: string;
  status: 'verified' | 'review' | 'disputed' | 'stale' | 'unresolved' | 'missing';
  rowId: string;
  matrixId: string;
  anchor: GraphEvidenceAnchor | null;
  locator?: EvidenceLocator;
}

export interface ComparisonClaim {
  id: string;
  text: string;
  rowId: string;
  matrixId: string;
  cells: Readonly<Record<string, ComparisonCell>>;
}

export interface EvolutionEvent {
  id: string;
  state: string;
  statement: string;
  reason: string;
  status: ComparisonCell['status'];
  occurredAt: string;
  matrixId?: string;
  rowId?: string;
  anchor?: GraphEvidenceAnchor | null;
  sourceLabels: readonly string[];
}

interface ComparisonEvolutionViewProps {
  mode: ComparisonViewMode;
  question: string;
  columns: readonly ComparisonColumn[];
  claims: readonly ComparisonClaim[];
  events: readonly EvolutionEvent[];
  onOpenEvidenceMatrix: (matrixId: string, rowId: string) => void;
  onOpenReader: (anchor: GraphEvidenceAnchor) => void;
  className?: string;
}

function statusLabel(status: ComparisonCell['status']): string {
  if (status === 'verified') return '已核验';
  if (status === 'disputed') return '争议';
  if (status === 'stale') return '来源失效';
  if (status === 'review') return '待核对';
  if (status === 'unresolved') return '定位待核对';
  return '未涉及';
}

function statusTone(
  status: ComparisonCell['status'],
): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'verified') return 'success';
  if (status === 'disputed') return 'danger';
  if (status === 'review' || status === 'stale' || status === 'unresolved') return 'warning';
  return 'neutral';
}

function eventDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '时间待补'
    : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
}

function Cell({
  cell,
  onOpenEvidenceMatrix,
  onOpenReader,
}: {
  cell: ComparisonCell | undefined;
  onOpenEvidenceMatrix: ComparisonEvolutionViewProps['onOpenEvidenceMatrix'];
  onOpenReader: ComparisonEvolutionViewProps['onOpenReader'];
}) {
  if (!cell) {
    return <span className={styles.missingCell}>未涉及</span>;
  }
  const readable = Boolean(cell.anchor && canOpenGraphEvidence(cell.anchor));
  return (
    <div className={styles.cellContent}>
      <div className={styles.cellHeading}>
        <strong>{cell.label}</strong>
        <Badge tone={statusTone(cell.status)} soft aria-label={`证据状态：${statusLabel(cell.status)}`}>
          {statusLabel(cell.status)}
        </Badge>
      </div>
      {cell.detail ? <p className={styles.cellDetail}>{cell.detail}</p> : null}
      <div className={styles.cellMeta}>
        <span>{cell.locator ? locatorLabel(cell.locator) : '定位待核对'}</span>
        {cell.anchor ? <span>{sourceStateLabel(cell.anchor.sourceState)}</span> : null}
      </div>
      <div className={styles.cellActions}>
        <Button
          aria-label="查看证据行"
          variant="ghost"
          size="sm"
          leftIcon={<Rows3 size={13} strokeWidth={1.5} />}
          onClick={() => onOpenEvidenceMatrix(cell.matrixId, cell.rowId)}
        >
          证据
        </Button>
        <Button
          aria-label={readable ? '回读来源' : '来源不可回读'}
          variant="ghost"
          size="sm"
          leftIcon={<BookOpen size={13} strokeWidth={1.5} />}
          disabled={!readable}
          onClick={() => {
            if (cell.anchor && readable) onOpenReader(cell.anchor);
          }}
        >
          回读
        </Button>
      </div>
    </div>
  );
}

export function ComparisonEvolutionView({
  mode,
  question,
  columns,
  claims,
  events,
  onOpenEvidenceMatrix,
  onOpenReader,
  className,
}: ComparisonEvolutionViewProps) {
  const rootClassName = [styles.root, className].filter(Boolean).join(' ');
  return (
    <section className={rootClassName} aria-label={mode === 'comparison' ? '比较视图' : '判断演化视图'}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{mode === 'comparison' ? '证据矩阵摘要' : '研究判断时间线'}</p>
          <h2 className={styles.title}>{mode === 'comparison' ? '比较' : '演化'}</h2>
          <p className={styles.description}>
            {question || '先从证据工作台提出一个跨论文比较问题。'}
          </p>
        </div>
        <Badge aria-label="视图说明" tone="neutral" soft>
          {mode === 'comparison' ? '摘要，不是第二套编辑器' : '来源驱动，不使用提交历史'}
        </Badge>
      </header>

      {mode === 'comparison' ? (
        claims.length === 0 ? (
          <div className={styles.empty} role="status">
            <Rows3 size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>还没有可比较的主张；先在证据工作台整理 3–5 篇论文。</span>
          </div>
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="主张与论文比较摘要" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.claimHeader}>主张 / 条件</th>
                  {columns.map((column) => <th scope="col" key={column.id}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <th scope="row" className={styles.claimCell}>
                      <span>{claim.text}</span>
                      <Button
                        aria-label={`打开主张 ${claim.text} 的证据行`}
                        variant="ghost"
                        size="sm"
                        leftIcon={<ExternalLink size={13} strokeWidth={1.5} />}
                        onClick={() => onOpenEvidenceMatrix(claim.matrixId, claim.rowId)}
                      >
                        打开证据工作台
                      </Button>
                    </th>
                    {columns.map((column) => (
                      <td key={`${claim.id}:${column.id}`}>
                        <Cell
                          cell={claim.cells[column.id]}
                          onOpenEvidenceMatrix={onOpenEvidenceMatrix}
                          onOpenReader={onOpenReader}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : events.length === 0 ? (
        <div className={styles.empty} role="status">
          <History size={22} strokeWidth={1.5} aria-hidden="true" />
          <span>还没有可回读的判断变化；证据核验后，时间线会记录判断收窄和反例。</span>
        </div>
      ) : (
        <ol className={styles.timeline} aria-label="研究判断演化时间线">
          {events.map((event) => {
            const readable = Boolean(event.anchor && canOpenGraphEvidence(event.anchor));
            return (
              <li className={styles.event} key={event.id}>
                <div className={styles.eventRail} aria-hidden="true"><span /></div>
                <div className={styles.eventBody}>
                  <div className={styles.eventHeader}>
                    <div>
                      <p className={styles.eventDate}>{eventDate(event.occurredAt)}</p>
                      <h3>{event.state}</h3>
                    </div>
                    <Badge aria-label={`判断状态：${statusLabel(event.status)}`} tone={statusTone(event.status)} soft>{statusLabel(event.status)}</Badge>
                  </div>
                  <p className={styles.eventStatement}>{event.statement}</p>
                  <p className={styles.eventReason}>{event.reason}</p>
                  {event.sourceLabels.length > 0 ? (
                    <p className={styles.eventSources}>触发来源：{event.sourceLabels.join('、')}</p>
                  ) : null}
                  <div className={styles.eventActions}>
                    {event.matrixId && event.rowId ? (
                      <Button
                        aria-label="查看触发证据"
                        variant="ghost"
                        size="sm"
                        leftIcon={<Rows3 size={13} strokeWidth={1.5} />}
                        onClick={() => onOpenEvidenceMatrix(event.matrixId!, event.rowId!)}
                      >
                        查看证据
                      </Button>
                    ) : null}
                    <Button
                      aria-label={readable ? '回读触发来源' : '触发来源不可回读'}
                      variant="ghost"
                      size="sm"
                      leftIcon={<BookOpen size={13} strokeWidth={1.5} />}
                      disabled={!readable}
                      onClick={() => {
                        if (event.anchor && readable) onOpenReader(event.anchor);
                      }}
                    >
                      回读来源
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
