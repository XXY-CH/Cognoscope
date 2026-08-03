/**
 * EvidenceRowEditor - 单条结论与证据的审核/编辑界面。
 * 将 AI 提议、确定性匹配结果和用户确认动作并列展示。
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Check, CircleHelp, Flag } from 'lucide-react';
import { Badge, Button } from '../../components/common';
import type { EvidenceItem, EvidenceRow, EvidenceVerificationState, FileNode } from '../../types';
import { isResolvableLocator } from '../../utils/graphEvidence';
import styles from './EvidenceRowEditor.module.css';

interface EvidenceRowEditorProps {
  row: EvidenceRow;
  files: FileNode[];
  selected: boolean;
  onToggleSelected: () => void;
  onUpdateConclusion: (value: string) => void;
  onUpdateNote: (evidenceId: string, value: string) => void;
  onSetVerification: (
    state: Extract<EvidenceVerificationState, 'verified' | 'disputed' | 'unresolved'>,
  ) => void;
  onOpenSource: (item: EvidenceItem) => void;
}

function verificationLabel(state: EvidenceVerificationState): string {
  if (state === 'verified') return '已确认';
  if (state === 'disputed') return '存在争议';
  if (state === 'unresolved') return '待核对';
  if (state === 'edited') return '已编辑';
  return 'AI 提议';
}

function verificationTone(
  state: EvidenceVerificationState,
): 'success' | 'warning' | 'danger' | 'accent' | 'neutral' {
  if (state === 'verified') return 'success';
  if (state === 'disputed') return 'danger';
  if (state === 'unresolved') return 'warning';
  if (state === 'edited') return 'accent';
  return 'neutral';
}

function locatorLabel(item: EvidenceItem): string {
  if (item.locator.kind === 'pdf-page') return `PDF 第 ${item.locator.page} 页`;
  if (item.locator.kind === 'epub-cfi') {
    if (item.locator.location != null) return `EPUB location ${item.locator.location}`;
    if (item.locator.sectionIndex != null) return `EPUB 章节 ${item.locator.sectionIndex}`;
    return 'EPUB 位置待核对';
  }
  return `定位待核对：${item.locator.reason}`;
}

export function EvidenceRowEditor({
  row,
  files,
  selected,
  onToggleSelected,
  onUpdateConclusion,
  onUpdateNote,
  onSetVerification,
  onOpenSource,
}: EvidenceRowEditorProps) {
  const [conclusion, setConclusion] = useState(row.conclusion);
  useEffect(() => setConclusion(row.conclusion), [row.conclusion]);
  const fileById = new Map(files.map((file) => [file.id, file]));
  const sourceUnavailable = row.evidence.some((item) => {
    const file = fileById.get(item.fileId);
    return (
      !file ||
      file.deletedAt !== null ||
      file.type === 'folder' ||
      !isResolvableLocator(item.locator, file.type)
    );
  });
  const displayState = sourceUnavailable ? 'unresolved' : row.verification;

  return (
    <article className={styles.root} aria-label={`证据结论：${row.conclusion}`}>
      <header className={styles.header}>
        <label className={styles.selectLabel}>
          <input
            type="checkbox"
            className={styles.checkbox}
            aria-label={`选择结论 ${row.conclusion}`}
            checked={selected}
            onChange={onToggleSelected}
          />
          <span>用于复制</span>
        </label>
        <Badge
          aria-label={`结论状态：${sourceUnavailable ? '来源失效' : verificationLabel(row.verification)}`}
          tone={sourceUnavailable ? 'warning' : verificationTone(row.verification)}
          soft
        >
          {sourceUnavailable ? '来源失效' : verificationLabel(displayState)}
        </Badge>
      </header>

      <textarea
        className={styles.conclusion}
        aria-label="编辑结论"
        value={conclusion}
        rows={2}
        onChange={(event) => setConclusion(event.target.value)}
        onBlur={() => {
          if (conclusion !== row.conclusion) onUpdateConclusion(conclusion);
        }}
      />
      {row.originalProposal && row.originalProposal !== row.conclusion ? (
        <p className={styles.original}>AI 原始提议：{row.originalProposal}</p>
      ) : null}

      <div className={styles.evidenceList}>
        {row.evidence.length === 0 ? (
          <p className={styles.emptyEvidence}>
            <CircleHelp size={15} strokeWidth={1.5} aria-hidden="true" />
            没有可核对的来源摘录
          </p>
        ) : (
          row.evidence.map((item) => {
            const file = fileById.get(item.fileId);
            const unavailable =
              !file ||
              file.deletedAt !== null ||
              file.type === 'folder' ||
              !isResolvableLocator(item.locator, file.type);
            return (
              <div className={styles.evidence} key={item.id}>
                <div className={styles.evidenceHeader}>
                  <div className={styles.source}>
                    <span className={styles.sourceName}>
                      {file?.name ?? `文件 ${item.fileId}`}
                    </span>
                    <span className={styles.sourceMeta}>{locatorLabel(item)}</span>
                    {item.match === 'none' ? (
                      <Badge aria-label="摘录未匹配本地材料" tone="warning" soft>
                        未匹配
                      </Badge>
                    ) : item.match === 'annotation-exact' ? (
                      <Badge aria-label="摘录匹配用户批注" tone="success" soft>
                        批注匹配
                      </Badge>
                    ) : (
                      <Badge aria-label="摘录匹配本地文字稿" tone="accent" soft>
                        文字稿匹配
                      </Badge>
                    )}
                  </div>
                  <Button
                    aria-label={unavailable ? '来源或定位不可用' : '打开来源位置'}
                    variant="ghost"
                    size="sm"
                    leftIcon={<BookOpen size={14} strokeWidth={1.5} />}
                    disabled={unavailable}
                    onClick={() => onOpenSource(item)}
                  >
                    回读
                  </Button>
                </div>
                {item.annotationId ? (
                  <p className={styles.annotationHint}>
                    用户批注：{item.annotationBody || '（无批注正文）'}；原始批注记录保持不变。
                  </p>
                ) : null}
                {unavailable ? (
                  <p className={styles.unavailable}>
                    <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
                    来源已移入回收站或定位不可用，恢复来源并重新核对后再回读。
                  </p>
                ) : null}
                <blockquote className={styles.quote}>
                  {item.quotedText || '（没有摘录）'}
                </blockquote>
                <textarea
                  className={styles.note}
                  aria-label="编辑证据备注"
                  defaultValue={item.note}
                  rows={2}
                  onBlur={(event) => {
                    if (event.target.value !== item.note) {
                      onUpdateNote(item.id, event.target.value);
                    }
                  }}
                  placeholder="补充证据备注（可选）"
                />
              </div>
            );
          })
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerHint}>
          {sourceUnavailable
            ? '来源失效：恢复后仍需重新核对'
            : row.verification === 'verified'
            ? '已确认：可复制到文献综述'
            : row.verification === 'disputed'
              ? '请处理争议后再确认'
              : '确认前请核对原文与定位'}
        </div>
        <div className={styles.actions} role="group" aria-label="证据审核操作">
          <Button
            aria-label="确认证据"
            variant="primary"
            size="sm"
            leftIcon={<Check size={14} strokeWidth={1.5} />}
            disabled={row.verification === 'verified' || sourceUnavailable}
            onClick={() => onSetVerification('verified')}
          >
            确认
          </Button>
          <Button
            aria-label="标记存在争议"
            variant="ghost"
            size="sm"
            leftIcon={<Flag size={14} strokeWidth={1.5} />}
            disabled={row.verification === 'disputed'}
            onClick={() => onSetVerification('disputed')}
          >
            争议
          </Button>
          <Button
            aria-label="标记为待核对"
            variant="ghost"
            size="sm"
            onClick={() => onSetVerification('unresolved')}
          >
            待核对
          </Button>
        </div>
      </footer>
    </article>
  );
}
