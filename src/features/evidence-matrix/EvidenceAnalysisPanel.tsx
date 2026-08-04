/** EvidenceAnalysisPanel - 审核结论、局限/矛盾与研究空白分析提议。 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, FileText, Flag, LoaderCircle } from 'lucide-react';
import { Badge, Button } from '../../components/common';
import type {
  EvidenceAnalysis,
  EvidenceAnalysisItem,
  EvidenceAnalysisSection,
  EvidenceRow,
  EvidenceVerificationState,
} from '../../types';
import styles from './EvidenceAnalysisPanel.module.css';

interface EvidenceAnalysisPanelProps {
  analysis: EvidenceAnalysis | null;
  rows: EvidenceRow[];
  online: boolean;
  requestId: string | null;
  onGenerate: () => void;
  onCancel: () => void;
  onUpdate: (itemId: string, statement: string, rationale: string) => void;
  onVerify: (
    itemId: string,
    state: Extract<EvidenceVerificationState, 'verified' | 'disputed' | 'unresolved'>,
  ) => void;
  onCopy: () => void;
}

const SECTIONS: Array<{ key: EvidenceAnalysisSection; label: string; description: string }> = [
  { key: 'findings', label: '研究结论与证据', description: '哪些结论被当前矩阵中的证据支持？' },
  { key: 'limitations', label: '局限与矛盾', description: '哪些边界、方法差异或相互冲突值得保留？' },
  { key: 'gaps', label: '研究空白与机会', description: '哪些机会是由现有证据明确暴露出来的？' },
];

function statusLabel(state: EvidenceVerificationState): string {
  if (state === 'verified') return '已确认';
  if (state === 'disputed') return '存在争议';
  if (state === 'unresolved') return '待核对';
  if (state === 'edited') return '已编辑';
  return '待审阅';
}

function statusTone(state: EvidenceVerificationState): 'success' | 'danger' | 'warning' | 'accent' | 'neutral' {
  if (state === 'verified') return 'success';
  if (state === 'disputed') return 'danger';
  if (state === 'unresolved') return 'warning';
  if (state === 'edited') return 'accent';
  return 'neutral';
}

function AnalysisItemEditor({
  item,
  referencedRows,
  onUpdate,
  onVerify,
}: {
  item: EvidenceAnalysisItem;
  referencedRows: EvidenceRow[];
  onUpdate: (statement: string, rationale: string) => void;
  onVerify: (state: Extract<EvidenceVerificationState, 'verified' | 'disputed' | 'unresolved'>) => void;
}) {
  const [statement, setStatement] = useState(item.statement);
  const [rationale, setRationale] = useState(item.rationale);
  useEffect(() => {
    setStatement(item.statement);
    setRationale(item.rationale);
  }, [item.id, item.statement, item.rationale]);
  return (
    <article className={styles.item} aria-label={`分析项：${item.statement}`}>
      <div className={styles.itemHeader}>
        <Badge aria-label={`分析状态：${statusLabel(item.verification)}`} tone={statusTone(item.verification)} soft>
          {statusLabel(item.verification)}
        </Badge>
        <span className={styles.referenceCount}>{referencedRows.length} 条矩阵行回指</span>
      </div>
      <textarea
        className={styles.statement}
        aria-label="编辑分析判断"
        value={statement}
        rows={2}
        onChange={(event) => setStatement(event.target.value)}
        onBlur={() => {
          if (statement !== item.statement || rationale !== item.rationale) onUpdate(statement, rationale);
        }}
      />
      <textarea
        className={styles.rationale}
        aria-label="编辑分析依据"
        value={rationale}
        rows={2}
        placeholder="说明为什么这些矩阵行支持该判断"
        onChange={(event) => setRationale(event.target.value)}
        onBlur={() => {
          if (statement !== item.statement || rationale !== item.rationale) onUpdate(statement, rationale);
        }}
      />
      <ul className={styles.references} aria-label="分析引用的矩阵行">
        {referencedRows.length > 0 ? referencedRows.map((row) => (
          <li key={row.id}>
            <span className={styles.referenceId}>{row.id.slice(-8)}</span>
            <span>{row.conclusion}</span>
          </li>
        )) : <li className={styles.unresolved}>没有有效的已确认矩阵行回指</li>}
      </ul>
      <div className={styles.actions} role="group" aria-label="分析审核操作">
        <Button aria-label="确认分析项" variant="primary" size="sm" leftIcon={<Check size={14} strokeWidth={1.5} />} disabled={item.verification === 'verified'} onClick={() => onVerify('verified')}>确认</Button>
        <Button aria-label="标记分析项争议" variant="ghost" size="sm" leftIcon={<Flag size={14} strokeWidth={1.5} />} disabled={item.verification === 'disputed'} onClick={() => onVerify('disputed')}>争议</Button>
        <Button aria-label="将分析项标记为待核对" variant="ghost" size="sm" onClick={() => onVerify('unresolved')}>待核对</Button>
      </div>
    </article>
  );
}

export function EvidenceAnalysisPanel({
  analysis,
  rows,
  online,
  requestId,
  onGenerate,
  onCancel,
  onUpdate,
  onVerify,
  onCopy,
}: EvidenceAnalysisPanelProps) {
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  return (
    <section className={styles.root} aria-label="研究分析">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>研究判断</h2>
          <p className={styles.description}>只基于已确认矩阵行提议结论、局限与空白；每项都保留矩阵行回指。</p>
        </div>
        <div className={styles.toolbarActions}>
          {requestId ? (
            <Button aria-label="取消研究分析" variant="ghost" size="sm" leftIcon={<LoaderCircle size={14} strokeWidth={1.5} />} onClick={onCancel}>取消分析</Button>
          ) : (
            <Button aria-label="生成研究判断草稿" variant="secondary" size="sm" leftIcon={<FileText size={14} strokeWidth={1.5} />} disabled={!online || !rows.some((row) => row.verification === 'verified')} onClick={onGenerate}>生成判断草稿</Button>
          )}
          <Button aria-label="复制已确认分析" variant="ghost" size="sm" leftIcon={<ClipboardCopy size={14} strokeWidth={1.5} />} disabled={!analysis?.items.some((item) => item.verification === 'verified')} onClick={onCopy}>复制分析</Button>
        </div>
      </header>
      {!analysis || analysis.items.length === 0 ? (
        <p className={styles.empty}><FileText size={16} strokeWidth={1.5} aria-hidden="true" />先确认矩阵行，再生成研究结论、局限与空白草稿。</p>
      ) : (
        <div className={styles.sections}>
          {SECTIONS.map((section) => {
            const sectionItems = analysis.items.filter((item) => item.section === section.key);
            return (
              <div className={styles.section} key={section.key}>
                <div className={styles.sectionHeader}>
                  <h3>{section.label}</h3>
                  <span>{section.description}</span>
                </div>
                {sectionItems.length === 0 ? <p className={styles.muted}>暂无提议</p> : sectionItems.map((item) => (
                  <AnalysisItemEditor
                    key={item.id}
                    item={item}
                    referencedRows={item.rowIds.map((rowId) => rowById.get(rowId)).filter((row): row is EvidenceRow => Boolean(row))}
                    onUpdate={(statement, rationale) => onUpdate(item.id, statement, rationale)}
                    onVerify={(state) => onVerify(item.id, state)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {analysis?.extractionError ? <p className={styles.warning} role="alert">{analysis.extractionError}</p> : null}
    </section>
  );
}
