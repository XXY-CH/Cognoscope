/**
 * ResultsCenterPage - 将已核验的矩阵材料投影为可交付成果。
 * 结果中心只读现有证据事实，不创建新的持久化实体或替代写作工具。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ClipboardCopy,
  ExternalLink,
  FileText,
  TriangleAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, toast } from '../../components/common';
import * as evidenceAnalysesDb from '../../db/evidenceAnalyses';
import * as evidenceMatricesDb from '../../db/evidenceMatrices';
import * as evidenceRowsDb from '../../db/evidenceRows';
import { useFileStore } from '../../stores/fileStore';
import { useReaderStore } from '../../stores/readerStore';
import type {
  EvidenceAnalysisItem,
  EvidenceItem,
  EvidenceMatrix,
  EvidenceRow,
  FileNode,
} from '../../types';
import {
  copyEvidenceCitation,
  formatEvidenceCitation,
  isCitationReadyEvidenceRow,
} from '../../utils/evidenceCitation';
import { isResolvableLocator, locatorLabel } from '../../utils/graphEvidence';
import styles from './ResultsCenterPage.module.css';

interface ResultBundle {
  matrix: EvidenceMatrix;
  rows: EvidenceRow[];
  analysisItems: EvidenceAnalysisItem[];
}

interface ResultRowProps {
  row: EvidenceRow;
  matrix: EvidenceMatrix;
  filesById: ReadonlyMap<string, FileNode>;
  onOpenSource: (matrix: EvidenceMatrix, row: EvidenceRow, itemId: string) => void;
}

function ResultRow({ row, matrix, filesById, onOpenSource }: ResultRowProps) {
  return (
    <article className={styles.resultRow}>
      <div className={styles.resultRowHeader}>
        <div>
          <p className={styles.rowLabel}>主张</p>
          <h3 className={styles.rowTitle}>{row.conclusion}</h3>
        </div>
        <Badge aria-label="主张状态：已确认" tone="success" soft>
          已确认
        </Badge>
      </div>
      <ul className={styles.sourceList} aria-label="主张来源">
        {row.evidence.map((item) => {
          const file = filesById.get(item.fileId);
          const canOpen = Boolean(
            file &&
              file.deletedAt === null &&
              file.type !== 'folder' &&
              isResolvableLocator(item.locator, file.type),
          );
          return (
            <li className={styles.sourceItem} key={item.id}>
              <div className={styles.sourceCopy}>
                <strong>{file?.name ?? `文件 ${item.fileId}`}</strong>
                <span>{locatorLabel(item.locator)}</span>
                <blockquote>{item.quotedText}</blockquote>
              </div>
              <Button
                aria-label={canOpen ? `回读 ${file?.name ?? '来源'}` : '来源不可回读'}
                variant="ghost"
                size="sm"
                leftIcon={<BookOpen size={14} strokeWidth={1.5} />}
                disabled={!canOpen}
                onClick={() => {
                  if (canOpen) onOpenSource(matrix, row, item.id);
                }}
              >
                回读
              </Button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function AnalysisBlock({
  item,
  rowsById,
  filesById,
  matrix,
  onOpenMatrix,
  onOpenSource,
}: {
  item: EvidenceAnalysisItem;
  rowsById: ReadonlyMap<string, EvidenceRow>;
  filesById: ReadonlyMap<string, FileNode>;
  matrix: EvidenceMatrix;
  onOpenMatrix: (matrixId: string) => void;
  onOpenSource: (matrix: EvidenceMatrix, row: EvidenceRow, itemId: string) => void;
}) {
  return (
    <article className={styles.analysisBlock}>
      <div className={styles.analysisHeader}>
        <Badge aria-label="分析状态：已确认" tone="success" soft>
          已确认
        </Badge>
        <span>{item.rowIds.length} 条矩阵行回指</span>
      </div>
      <h3>{item.statement}</h3>
      {item.rationale ? <p>{item.rationale}</p> : null}
      <ul className={styles.referenceList} aria-label="分析依据">
        {item.rowIds.map((rowId) => {
          const row = rowsById.get(rowId);
          return (
            <li key={rowId}>
              <div className={styles.referenceCopy}>
                <span>{row?.conclusion ?? '矩阵行已移除'}</span>
                {row?.evidence.map((evidence) => {
                  const file = filesById.get(evidence.fileId);
                  return (
                    <small key={evidence.id}>
                      {file?.name ?? evidence.fileId} · {locatorLabel(evidence.locator)}
                      {evidence.quotedText ? ` · “${evidence.quotedText}”` : ''}
                    </small>
                  );
                })}
              </div>
              <div className={styles.referenceActions}>
                {row?.evidence.map((evidence: EvidenceItem) => {
                  const file = filesById.get(evidence.fileId);
                  const canOpen = Boolean(
                    file &&
                      file.deletedAt === null &&
                      file.type !== 'folder' &&
                      isResolvableLocator(evidence.locator, file.type),
                  );
                  return (
                    <Button
                      key={evidence.id}
                      aria-label={canOpen ? `回读 ${file?.name ?? '来源'}` : '来源不可回读'}
                      variant="ghost"
                      size="sm"
                      leftIcon={<BookOpen size={13} strokeWidth={1.5} />}
                      disabled={!canOpen}
                      onClick={() => onOpenSource(matrix, row, evidence.id)}
                    >
                      回读
                    </Button>
                  );
                })}
                <button type="button" aria-label="打开对应证据矩阵" onClick={() => onOpenMatrix(matrix.id)}>
                  <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
                  查看矩阵
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function ResultsCenterPage() {
  const navigate = useNavigate();
  const files = useFileStore((state) => state.files);
  const loadFiles = useFileStore((state) => state.loadFiles);
  const [bundles, setBundles] = useState<ResultBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        await loadFiles();
        const matrices = await evidenceMatricesDb.listEvidenceMatrices();
        const next = await Promise.all(
          matrices.map(async (matrix) => {
            const [rows, analysis] = await Promise.all([
              evidenceRowsDb.listEvidenceRowsByMatrix(matrix.id),
              evidenceAnalysesDb.getEvidenceAnalysisByMatrix(matrix.id),
            ]);
            return {
              matrix,
              rows,
              analysisItems: analysis?.items ?? [],
            };
          }),
        );
        if (!cancelled) setBundles(next);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '无法读取成果材料');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFiles]);

  const filesById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files],
  );
  const citationGroups = useMemo(
    () =>
      bundles
        .map((bundle) => ({
          ...bundle,
          rows: bundle.rows.filter((row) => isCitationReadyEvidenceRow(row, files)),
        }))
        .filter((bundle) => bundle.rows.length > 0),
    [bundles, files],
  );
  const reviewCount = useMemo(
    () =>
      bundles.reduce(
        (count, bundle) =>
          count +
          bundle.rows.filter((row) => !isCitationReadyEvidenceRow(row, files)).length,
        0,
      ),
    [bundles, files],
  );
  const confirmedRows = useMemo(
    () => citationGroups.flatMap((group) => group.rows),
    [citationGroups],
  );
  const analysisGroups = useMemo(
    () =>
      bundles
        .map((bundle) => {
          const validRowIds = new Set(
            bundle.rows
              .filter((row) => isCitationReadyEvidenceRow(row, files))
              .map((row) => row.id),
          );
          const items = bundle.analysisItems.filter(
            (item) =>
              item.verification === 'verified' &&
              item.rowIds.length > 0 &&
              item.rowIds.every((rowId) => validRowIds.has(rowId)),
          );
          return { ...bundle, analysisItems: items };
        })
        .filter((bundle) => bundle.analysisItems.length > 0),
    [bundles, files],
  );

  const handleCopy = async () => {
    try {
      await copyEvidenceCitation(formatEvidenceCitation(confirmedRows, files));
      toast.success(`已复制 ${confirmedRows.length} 条成果材料`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '复制成果材料失败');
    }
  };

  const handleOpenSource = (
    matrix: EvidenceMatrix,
    row: EvidenceRow,
    itemId: string,
  ) => {
    const item = row.evidence.find((candidate) => candidate.id === itemId);
    const fileId = item?.fileId;
    const file = fileId ? filesById.get(fileId) : undefined;
    if (
      !fileId ||
      !file ||
      !item ||
      file.deletedAt !== null ||
      file.type === 'folder' ||
      !isResolvableLocator(item.locator, file.type)
    ) {
      toast.warning('来源或定位不可用，请回到证据工作台重新核对');
      return;
    }
    useReaderStore.getState().setPendingLocator({
      fileId,
      matrixId: matrix.id,
      rowId: row.id,
      locator: item.locator,
    });
    navigate(
      `/read/${encodeURIComponent(fileId)}?matrixId=${encodeURIComponent(matrix.id)}&rowId=${encodeURIComponent(row.id)}&returnTo=results`,
    );
  };

  if (loading && bundles.length === 0) {
    return (
      <main className={styles.root} aria-label="成果中心">
        <p className={styles.status} role="status" aria-live="polite">
          正在读取成果材料…
        </p>
      </main>
    );
  }

  if (error && bundles.length === 0) {
    return (
      <main className={styles.root} aria-label="成果中心">
        <EmptyState
          aria-label="成果材料读取失败"
          icon={<TriangleAlert strokeWidth={1.5} />}
          title="成果材料暂时无法读取"
          description={error}
          actionLabel="重试"
          actionAriaLabel="重新读取成果材料"
          onAction={() => window.location.reload()}
        />
      </main>
    );
  }

  if (bundles.length === 0) {
    return (
      <main className={styles.root} aria-label="成果中心">
        <EmptyState
          aria-label="暂无成果材料"
          icon={<FileText strokeWidth={1.5} />}
          title="还没有可交付成果"
          description="先在证据工作台确认矩阵行，成果中心会按主张、来源和定位整理输出。"
          actionLabel="打开证据工作台"
          actionAriaLabel="打开证据工作台"
          onAction={() => navigate('/evidence-matrix')}
        />
      </main>
    );
  }

  return (
    <main className={styles.root} aria-label="成果中心">
      <section className={styles.intro} aria-labelledby="results-title">
        <div>
          <p className={styles.eyebrow}>输出</p>
          <h1 id="results-title" className={styles.title}>
            成果中心
          </h1>
          <p className={styles.subtitle}>
            只展示能回到论文和定位的材料；没有完整证据链的内容继续留在待核对区。
          </p>
        </div>
        <div className={styles.introActions}>
          <Button
            aria-label="打开证据工作台"
            variant="secondary"
            leftIcon={<FileText size={16} strokeWidth={1.5} />}
            onClick={() => navigate('/evidence-matrix')}
          >
            证据工作台
          </Button>
          <Button
            aria-label="复制全部已确认成果材料"
            variant="primary"
            leftIcon={<ClipboardCopy size={16} strokeWidth={1.5} />}
            disabled={confirmedRows.length === 0}
            onClick={() => void handleCopy()}
          >
            复制已确认材料
          </Button>
        </div>
      </section>

      <section className={styles.summary} aria-label="成果状态">
        <div>
          <span>已确认主张</span>
          <strong>{confirmedRows.length}</strong>
          <small>保留来源和定位</small>
        </div>
        <div>
          <span>待核对主张</span>
          <strong>{reviewCount}</strong>
          <small>不会进入可引用输出</small>
        </div>
        <div>
          <span>分析判断</span>
          <strong>{analysisGroups.reduce((count, group) => count + group.analysisItems.length, 0)}</strong>
          <small>仅引用已确认矩阵行</small>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="conclusions-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>01</p>
            <h2 id="conclusions-title">研究结论与证据</h2>
          </div>
          <span>{confirmedRows.length} 条可引用主张</span>
        </header>
        {citationGroups.length === 0 ? (
          <p className={styles.empty}>还没有通过核验的矩阵行。</p>
        ) : (
          <div className={styles.groupList}>
            {citationGroups.map((group) => (
              <div className={styles.group} key={group.matrix.id}>
                <div className={styles.groupHeader}>
                  <h3>{group.matrix.comparisonQuestion || '未命名比较'}</h3>
                  <button
                    type="button"
                    aria-label="打开对应证据矩阵"
                    onClick={() => navigate(`/evidence-matrix/${encodeURIComponent(group.matrix.id)}`)}
                  >
                    查看矩阵 <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
                {group.rows.map((row) => (
                  <ResultRow
                    key={row.id}
                    row={row}
                    matrix={group.matrix}
                    filesById={filesById}
                    onOpenSource={handleOpenSource}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {(['limitations', 'gaps'] as const).map((sectionKey) => {
        const title = sectionKey === 'limitations' ? '局限与矛盾' : '研究空白与机会';
        const sectionGroups = analysisGroups
          .map((group) => ({
            ...group,
            analysisItems: group.analysisItems.filter((item) => item.section === sectionKey),
          }))
          .filter((group) => group.analysisItems.length > 0);
        return (
          <section className={styles.section} aria-labelledby={`${sectionKey}-title`} key={sectionKey}>
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>{sectionKey === 'limitations' ? '02' : '03'}</p>
                <h2 id={`${sectionKey}-title`}>{title}</h2>
              </div>
              <span>{sectionGroups.reduce((count, group) => count + group.analysisItems.length, 0)} 条已确认判断</span>
            </header>
            {sectionGroups.length === 0 ? (
              <p className={styles.empty}>暂无保留完整证据回指的判断。</p>
            ) : (
              <div className={styles.analysisList}>
                {sectionGroups.flatMap((group) =>
                  group.analysisItems.map((item) => (
                    <AnalysisBlock
                      key={item.id}
                      item={item}
                      matrix={group.matrix}
                      rowsById={new Map(group.rows.map((row) => [row.id, row]))}
                      filesById={filesById}
                      onOpenMatrix={(matrixId) =>
                        navigate(`/evidence-matrix/${encodeURIComponent(matrixId)}`)
                      }
                      onOpenSource={handleOpenSource}
                    />
                  )),
                )}
              </div>
            )}
          </section>
        );
      })}

      <section className={styles.section} aria-labelledby="review-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>04</p>
            <h2 id="review-title">跨论文综述</h2>
          </div>
          <Badge aria-label="综述状态：由矩阵材料构成" tone="neutral" soft>
            矩阵投影
          </Badge>
        </header>
        <p className={styles.reviewCopy}>
          当前综述材料由 {bundles.length} 个比较和 {confirmedRows.length} 条已确认主张构成。
          系统不把图谱关系或阅读行为直接写成科学结论。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="citation-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>05</p>
            <h2 id="citation-title">引用材料</h2>
          </div>
          <Button
            aria-label="复制引用材料"
            variant="ghost"
            size="sm"
            leftIcon={<ClipboardCopy size={14} strokeWidth={1.5} />}
            disabled={confirmedRows.length === 0}
            onClick={() => void handleCopy()}
          >
            复制 Markdown
          </Button>
        </header>
        <p className={styles.reviewCopy}>
          复制内容保留主张、原文摘录、论文名称和页码/EPUB 定位，可继续放入你的综述草稿。
        </p>
      </section>

      <section className={styles.section} aria-labelledby="export-title">
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>06</p>
            <h2 id="export-title">BibTeX 与 LaTeX</h2>
          </div>
          <Badge aria-label="导出状态：暂未提供" tone="neutral" soft>
            暂未提供
          </Badge>
        </header>
        <p className={styles.reviewCopy}>
          当前阶段只交付可回读的 Markdown 证据材料，不替代文献管理器或写作编辑器。
        </p>
      </section>
    </main>
  );
}
