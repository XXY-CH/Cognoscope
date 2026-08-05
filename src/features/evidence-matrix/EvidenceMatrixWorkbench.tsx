/**
 * EvidenceMatrixWorkbench - claim-first comparison surface.
 * The table is a projection of existing EvidenceRow/EvidenceItem records;
 * the source inspector owns the return-to-reader action and review state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Flag, X } from 'lucide-react';
import { Badge, Button, IconButton } from '../../components/common';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type {
  EvidenceItem,
  EvidenceRow,
  EvidenceType,
  EvidenceVerificationState,
  FileNode,
} from '../../types';
import {
  resolveEvidenceSource,
  sourceStateLabel,
  locatorLabel,
} from '../../utils/graphEvidence';
import styles from './EvidenceMatrixWorkbench.module.css';

interface EvidenceMatrixWorkbenchProps {
  rows: EvidenceRow[];
  files: FileNode[];
  selectedRowIds: string[];
  activeRowId: string | null;
  selectedFileId: string | null;
  onSelectRow: (rowId: string, fileId?: string) => void;
  onCloseInspector: () => void;
  onToggleSelected: (rowId: string) => void;
  onUpdateConclusion: (rowId: string, value: string) => void;
  onUpdateNote: (rowId: string, evidenceId: string, value: string) => void;
  onSetVerification: (
    rowId: string,
    state: Extract<EvidenceVerificationState, 'verified' | 'disputed' | 'unresolved'>,
  ) => void;
  onOpenSource: (item: EvidenceItem, rowId: string) => void;
}

function evidenceTypeLabel(type: EvidenceType | undefined): string {
  if (type === 'support') return '支持';
  if (type === 'refute') return '反驳';
  if (type === 'condition') return '条件化';
  if (type === 'limitation') return '局限';
  if (type === 'method') return '方法';
  if (type === 'data') return '数据';
  return '类型待核对';
}

function verificationLabel(state: EvidenceVerificationState): string {
  if (state === 'verified') return '已确认';
  if (state === 'disputed') return '存在争议';
  if (state === 'unresolved') return '待核对';
  if (state === 'edited') return '已编辑';
  return '待审核';
}

function cellState(
  row: EvidenceRow,
  item: EvidenceItem | undefined,
  file: FileNode | undefined,
): { label: string; detail: string; state: string } {
  if (!item) return { label: '未涉及', detail: '没有该论文的证据摘录', state: 'absent' };
  const source = resolveEvidenceSource(item.locator, file);
  if (source.state !== 'available') {
    return {
      label: sourceStateLabel(source.state),
      detail:
        source.reason ??
        (source.state === 'missing' ? '来源文件不存在或已移入回收站' : '定位不可回读'),
      state: 'stale',
    };
  }
  if (row.verification === 'disputed' || item.verification === 'disputed') {
    return { label: '存在争议', detail: evidenceTypeLabel(item.evidenceType), state: 'disputed' };
  }
  return {
    label: evidenceTypeLabel(item.evidenceType),
    detail: verificationLabel(item.verification),
    state: item.verification === 'verified' ? 'verified' : 'review',
  };
}

function ConclusionCell({
  row,
  onUpdate,
}: {
  row: EvidenceRow;
  onUpdate: (value: string) => void;
}) {
  const [value, setValue] = useState(row.conclusion);
  useEffect(() => setValue(row.conclusion), [row.conclusion]);
  return (
    <textarea
      className={styles.claimInput}
      aria-label="编辑研究主张"
      value={value}
      rows={3}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== row.conclusion) onUpdate(value);
      }}
    />
  );
}

export function EvidenceMatrixWorkbench({
  rows,
  files,
  selectedRowIds,
  activeRowId,
  selectedFileId,
  onSelectRow,
  onCloseInspector,
  onToggleSelected,
  onUpdateConclusion,
  onUpdateNote,
  onSetVerification,
  onOpenSource,
}: EvidenceMatrixWorkbenchProps) {
  const inspectorRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useFocusTrap(inspectorRef, Boolean(activeRowId) && compact, onCloseInspector);

  const row = rows.find((item) => item.id === activeRowId) ?? null;
  const activeFile = files.find((file) => file.id === selectedFileId) ?? null;
  const activeEvidence = useMemo(
    () => {
      if (!row) return null;
      if (selectedFileId) return row.evidence.find((item) => item.fileId === selectedFileId) ?? null;
      return row.evidence[0] ?? null;
    },
    [row, selectedFileId],
  );
  const activeEvidenceFile = files.find((file) => file.id === activeEvidence?.fileId) ?? activeFile;
  const activeSource = activeEvidence
    ? resolveEvidenceSource(activeEvidence.locator, activeEvidenceFile ?? undefined)
    : null;
  const available = activeSource?.state === 'available';

  return (
    <div className={styles.workbench}>
      <section className={styles.matrixSurface} aria-label="主张与论文证据矩阵">
        <div className={styles.matrixIntro}>
          <div>
            <p className={styles.kicker}>核对几何</p>
            <h3 className={styles.surfaceTitle}>主张 × 论文</h3>
          </div>
          <span className={styles.surfaceMeta}>{rows.length} 条主张 · {files.length} 篇论文</span>
        </div>
        <div className={styles.tableScroll} role="region" aria-label="横向滚动的证据矩阵" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.claimHeader} scope="col">研究主张</th>
                {files.map((file) => (
                  <th scope="col" key={file.id}>{file.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((currentRow) => (
                <tr className={currentRow.id === activeRowId ? styles.activeRow : ''} key={currentRow.id}>
                  <th className={styles.claimCell} scope="row">
                    <label className={styles.copyToggle}>
                      <input
                        type="checkbox"
                        aria-label={`选择主张 ${currentRow.conclusion}`}
                        checked={selectedRowIds.includes(currentRow.id)}
                        onChange={() => onToggleSelected(currentRow.id)}
                      />
                      <span>复制</span>
                    </label>
                    <ConclusionCell row={currentRow} onUpdate={(value) => onUpdateConclusion(currentRow.id, value)} />
                    <span className={styles.rowState}>{verificationLabel(currentRow.verification)}</span>
                  </th>
                  {files.map((file) => {
                    const item = currentRow.evidence.find((candidate) => candidate.fileId === file.id);
                    const state = cellState(currentRow, item, file);
                    return (
                      <td className={`${styles.evidenceCell} ${currentRow.id === activeRowId && file.id === selectedFileId ? styles.activeCell : ''}`} key={file.id}>
                        <button
                          type="button"
                          className={styles.cellButton}
                          aria-label={`${file.name}：${state.label}，${state.detail}`}
                          onClick={() => onSelectRow(currentRow.id, file.id)}
                        >
                          <span className={styles.cellState} data-state={state.state}>
                            <span className={styles.cellMarker} aria-hidden="true" />
                            {state.label}
                          </span>
                          <span className={styles.cellDetail}>{state.detail}</span>
                          {item?.quotedText ? <span className={styles.cellQuote}>{item.quotedText}</span> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p className={styles.empty}>还没有主张。先生成候选，再逐条回读和核对。</p> : null}
      </section>

      <aside
        ref={inspectorRef}
        className={styles.inspector}
        data-open={Boolean(row)}
        role={compact ? 'dialog' : undefined}
        aria-modal={compact ? true : undefined}
        aria-label="来源检查器"
      >
        <header className={styles.inspectorHeader}>
          <div>
            <p className={styles.kicker}>来源检查器</p>
            <h3 className={styles.inspectorTitle}>{activeEvidenceFile?.name ?? '选择矩阵单元格'}</h3>
          </div>
          {compact ? <IconButton aria-label="关闭来源检查器" onClick={onCloseInspector}><X size={18} strokeWidth={1.5} /></IconButton> : null}
        </header>
        {!row ? (
          <p className={styles.inspectorEmpty}>选择一条主张和一篇论文，查看摘录、定位和核验状态。</p>
        ) : !activeEvidence ? (
          <p className={styles.inspectorEmpty}>该论文没有进入这条主张的证据集合，当前状态为“未涉及”。</p>
        ) : (
          <>
            <p className={styles.inspectorClaim}>{row.conclusion}</p>
            <div className={styles.inspectorStatus}>
              <Badge aria-label={`证据类型：${evidenceTypeLabel(activeEvidence.evidenceType)}`} tone="neutral" soft>{evidenceTypeLabel(activeEvidence.evidenceType)}</Badge>
              <Badge aria-label={`核验状态：${verificationLabel(activeEvidence.verification)}`} tone={activeEvidence.verification === 'verified' ? 'success' : activeEvidence.verification === 'disputed' ? 'danger' : 'warning'} soft>{verificationLabel(activeEvidence.verification)}</Badge>
              {activeSource ? (
                <Badge
                  aria-label={`来源状态：${sourceStateLabel(activeSource.state)}`}
                  tone={activeSource.state === 'available' ? 'success' : 'warning'}
                  soft
                >
                  {sourceStateLabel(activeSource.state)}
                </Badge>
              ) : null}
            </div>
            <blockquote className={styles.inspectorQuote}>{activeEvidence.quotedText || '（没有原文摘录）'}</blockquote>
            <dl className={styles.sourceFacts}>
              <div><dt>定位</dt><dd>{locatorLabel(activeEvidence.locator)}</dd></div>
              {activeSource ? <div><dt>来源</dt><dd>{sourceStateLabel(activeSource.state)}</dd></div> : null}
              <div><dt>匹配</dt><dd>{activeEvidence.match === 'annotation-exact' ? '用户批注精确匹配' : activeEvidence.match === 'transcript-exact' ? '本地文字稿精确匹配' : '未匹配本地材料'}</dd></div>
              {activeEvidence.method ? <div><dt>方法</dt><dd>{activeEvidence.method}</dd></div> : null}
              {activeEvidence.dataset ? <div><dt>数据集</dt><dd>{activeEvidence.dataset}</dd></div> : null}
              {activeEvidence.condition ? <div><dt>条件</dt><dd>{activeEvidence.condition}</dd></div> : null}
            </dl>
            {activeEvidence.annotationBody ? <p className={styles.annotation}>用户批注：{activeEvidence.annotationBody}</p> : null}
            <textarea
              className={styles.note}
              aria-label="编辑证据备注"
              defaultValue={activeEvidence.note}
              rows={3}
              placeholder="补充核对备注"
              onBlur={(event) => {
                if (event.target.value !== activeEvidence.note) onUpdateNote(row.id, activeEvidence.id, event.target.value);
              }}
            />
            {!available && activeSource ? (
              <p className={styles.unavailable}>
                {activeSource.state === 'missing'
                  ? '来源失效：文件不存在或已移入回收站，恢复来源并重新核对后才能确认。'
                  : `定位不可回读：${activeSource.reason ?? '缺少可回放的页码、CFI 或 location'}。`}
              </p>
            ) : null}
            <div className={styles.inspectorActions} role="group" aria-label="来源与核验操作">
              <Button aria-label="回读来源" variant="secondary" size="sm" leftIcon={<BookOpen size={14} strokeWidth={1.5} />} disabled={!available} onClick={() => onOpenSource(activeEvidence, row.id)}>回读来源</Button>
              <Button aria-label="确认证据" variant="primary" size="sm" leftIcon={<Check size={14} strokeWidth={1.5} />} disabled={!available || row.verification === 'verified'} onClick={() => onSetVerification(row.id, 'verified')}>确认</Button>
              <Button aria-label="标记存在争议" variant="ghost" size="sm" leftIcon={<Flag size={14} strokeWidth={1.5} />} onClick={() => onSetVerification(row.id, 'disputed')}>争议</Button>
              <Button aria-label="标记待核对" variant="ghost" size="sm" onClick={() => onSetVerification(row.id, 'unresolved')}>待核对</Button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
