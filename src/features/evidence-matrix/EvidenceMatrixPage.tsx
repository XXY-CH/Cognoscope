/**
 * EvidenceMatrixPage - 跨论文结论/证据工作区。
 * 入口来自文件目录的三至五篇多选，也支持通过 URL 重新打开已保存矩阵。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ClipboardCopy, LoaderCircle, Save, Sparkles, Trash2, WifiOff } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, toast } from '../../components/common';
import { useFileStore } from '../../stores/fileStore';
import { useEvidenceMatrixStore } from '../../stores/evidenceMatrixStore';
import { useUiStore } from '../../stores/uiStore';
import { useReaderStore } from '../../stores/readerStore';
import { copyEvidenceCitation, formatEvidenceCitation } from '../../utils/evidenceCitation';
import { formatEvidenceAnalysisCitation } from '../../utils/evidenceAnalysisCitation';
import type { EvidenceItem } from '../../types';
import { EvidenceAnalysisPanel } from './EvidenceAnalysisPanel';
import { EvidenceRowEditor } from './EvidenceRowEditor';
import styles from './EvidenceMatrixPage.module.css';

const MIN_FILES = 3;
const MAX_FILES = 5;

function parseFileIds(searchParams: URLSearchParams): string[] {
  return [...new Set(searchParams.getAll('files').filter(Boolean))];
}

export function EvidenceMatrixPage() {
  const navigate = useNavigate();
  const { matrixId } = useParams<{ matrixId?: string }>();
  const [searchParams] = useSearchParams();
  const files = useFileStore((state) => state.files);
  const fileStatus = useFileStore((state) => state.status);
  const loadFiles = useFileStore((state) => state.loadFiles);
  const isOnline = useUiStore((state) => state.isOnline);
  const [questionDraft, setQuestionDraft] = useState('');
  const initializedRef = useRef<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);

  const matrices = useEvidenceMatrixStore((state) => state.matrices);
  const activeMatrix = useEvidenceMatrixStore((state) => state.activeMatrix);
  const rows = useEvidenceMatrixStore((state) => state.rows);
  const analysis = useEvidenceMatrixStore((state) => state.analysis);
  const selectedRowIds = useEvidenceMatrixStore((state) => state.selectedRowIds);
  const loadStatus = useEvidenceMatrixStore((state) => state.loadStatus);
  const errorMessage = useEvidenceMatrixStore((state) => state.errorMessage);
  const requestId = useEvidenceMatrixStore((state) => state.requestId);
  const analysisRequestId = useEvidenceMatrixStore((state) => state.analysisRequestId);
  const loadMatrices = useEvidenceMatrixStore((state) => state.loadMatrices);
  const createMatrix = useEvidenceMatrixStore((state) => state.create);
  const openMatrix = useEvidenceMatrixStore((state) => state.open);
  const setComparisonQuestion = useEvidenceMatrixStore((state) => state.setComparisonQuestion);
  const generateProposals = useEvidenceMatrixStore((state) => state.generateProposals);
  const cancelExtraction = useEvidenceMatrixStore((state) => state.cancelExtraction);
  const generateAnalysis = useEvidenceMatrixStore((state) => state.generateAnalysis);
  const cancelAnalysis = useEvidenceMatrixStore((state) => state.cancelAnalysis);
  const updateConclusion = useEvidenceMatrixStore((state) => state.updateConclusion);
  const updateEvidenceNote = useEvidenceMatrixStore((state) => state.updateEvidenceNote);
  const setVerification = useEvidenceMatrixStore((state) => state.setVerification);
  const updateAnalysisItem = useEvidenceMatrixStore((state) => state.updateAnalysisItem);
  const setAnalysisVerification = useEvidenceMatrixStore((state) => state.setAnalysisVerification);
  const toggleRowSelection = useEvidenceMatrixStore((state) => state.toggleRowSelection);
  const clearRowSelection = useEvidenceMatrixStore((state) => state.clearRowSelection);
  const deleteActive = useEvidenceMatrixStore((state) => state.deleteActive);

  useEffect(() => {
    void loadFiles();
    void loadMatrices();
  }, [loadFiles, loadMatrices]);

  useEffect(() => {
    if (matrixId) {
      if (initializedRef.current === `open:${matrixId}`) return;
      initializedRef.current = `open:${matrixId}`;
      setOpening(true);
      void openMatrix(matrixId).finally(() => setOpening(false));
      return;
    }
    const selectedIds = parseFileIds(searchParams);
    const validSelectedIds = selectedIds.filter((id) => {
      const file = files.find((candidate) => candidate.id === id);
      return file?.type !== 'folder' && file?.deletedAt === null;
    });
    if (
      validSelectedIds.length < MIN_FILES ||
      validSelectedIds.length > MAX_FILES ||
      validSelectedIds.length !== selectedIds.length
    ) {
      return;
    }
    const key = `create:${validSelectedIds.join(',')}`;
    if (initializedRef.current === key) return;
    initializedRef.current = key;
    setCreating(true);
    void createMatrix(validSelectedIds).then((id) => {
      setCreating(false);
      navigate(`/evidence-matrix/${encodeURIComponent(id)}`, { replace: true });
    });
  }, [matrixId, searchParams, files, openMatrix, createMatrix, navigate]);

  useEffect(() => {
    setQuestionDraft(activeMatrix?.comparisonQuestion ?? '');
  }, [activeMatrix?.id, activeMatrix?.comparisonQuestion]);

  const activeFiles = useMemo(
    () => files.filter((file) => activeMatrix?.fileIds.includes(file.id)),
    [files, activeMatrix?.fileIds],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedRowIds.includes(row.id) && row.verification === 'verified'),
    [rows, selectedRowIds],
  );

  const onQuestionBlur = () => {
    if (activeMatrix && questionDraft !== activeMatrix.comparisonQuestion) {
      void setComparisonQuestion(questionDraft);
    }
  };

  const onCopy = async () => {
    try {
      const text = formatEvidenceCitation(selectedRows, files);
      await copyEvidenceCitation(text);
      toast.success(`已复制 ${selectedRows.length} 条确认证据`);
      clearRowSelection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制失败');
    }
  };

  const onCopyAnalysis = async () => {
    if (!analysis) return;
    try {
      await copyEvidenceCitation(formatEvidenceAnalysisCitation(analysis, rows, files));
      toast.success('已复制已确认研究分析');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制分析失败');
    }
  };

  const onOpenSource = (item: EvidenceItem, rowId: string) => {
    const file = files.find((candidate) => candidate.id === item.fileId);
    if (!file || file.deletedAt !== null) {
      toast.warning('来源不可用，请先从回收站恢复文件');
      return;
    }
    if (!activeMatrix) return;
    useReaderStore.getState().setPendingLocator({
      fileId: file.id,
      matrixId: activeMatrix.id,
      rowId,
      locator: item.locator,
    });
    navigate(
      `/read/${encodeURIComponent(file.id)}?matrixId=${encodeURIComponent(activeMatrix.id)}&rowId=${encodeURIComponent(rowId)}`,
    );
  };

  if (!matrixId && !creating && parseFileIds(searchParams).length === 0) {
    return (
      <main className={styles.root} aria-label="证据矩阵">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMain}>
            <div>
              <h2 className={styles.title}>跨论文证据矩阵</h2>
              <p className={styles.matrixMeta}>把批注和原文整理成可核对、可引用的比较材料。</p>
            </div>
            <Button aria-label="返回文件目录" variant="ghost" leftIcon={<ArrowLeft size={16} strokeWidth={1.5} />} onClick={() => navigate('/')}>
              文件目录
            </Button>
          </div>
        </div>
        {loadStatus === 'loading' ? <p className={styles.empty}>正在读取已保存矩阵…</p> : null}
        {matrices.length === 0 && loadStatus !== 'loading' ? (
          <EmptyState aria-label="暂无证据矩阵" title="暂无已保存的比较" description="回到文件目录，选择三至五篇论文开始比较。" />
        ) : (
          <div className={styles.rows}>
            {matrices.map((matrix) => (
              <button
                className={styles.savedMatrix}
                type="button"
                key={matrix.id}
                aria-label={`打开比较：${matrix.comparisonQuestion || '未命名比较'}`}
                onClick={() => navigate(`/evidence-matrix/${encodeURIComponent(matrix.id)}`)}
              >
                <span>{matrix.comparisonQuestion || '未命名比较'}</span>
                <span>{matrix.fileIds.length} 篇论文</span>
              </button>
            ))}
          </div>
        )}
      </main>
    );
  }

  if (
    !matrixId &&
    !creating &&
    parseFileIds(searchParams).length > 0 &&
    fileStatus === 'loading'
  ) {
    return (
      <main className={styles.root} aria-label="证据矩阵">
        <p className={styles.empty}>正在读取文件选择…</p>
      </main>
    );
  }

  if (!matrixId && !creating && parseFileIds(searchParams).length > 0) {
    return (
      <main className={styles.root} aria-label="证据矩阵">
        <EmptyState
          aria-label="论文选择无效"
          title="无法开始比较"
          description="请选择三至五篇仍在文件目录中的非文件夹文献。"
          actionLabel="返回文件目录"
          actionAriaLabel="返回文件目录"
          onAction={() => navigate('/')}
        />
      </main>
    );
  }

  if (opening) {
    return <main className={styles.root} aria-label="证据矩阵"><p className={styles.empty}>正在准备比较工作区…</p></main>;
  }

  if (matrixId && !activeMatrix) {
    return (
      <main className={styles.root} aria-label="证据矩阵">
        <EmptyState
          aria-label="证据矩阵不存在"
          title="找不到该证据矩阵"
          description={errorMessage ?? '它可能已被删除，或尚未完成本地保存。'}
          actionLabel="返回证据矩阵列表"
          actionAriaLabel="返回证据矩阵列表"
          onAction={() => navigate('/evidence-matrix')}
        />
      </main>
    );
  }

  if (creating || !activeMatrix) {
    return <main className={styles.root} aria-label="证据矩阵"><p className={styles.empty}>正在准备比较工作区…</p></main>;
  }

  return (
    <main className={styles.root} aria-label="跨论文证据矩阵">
      <section className={styles.toolbar} aria-label="矩阵工具栏">
        <div className={styles.toolbarMain}>
          <div>
            <h2 className={styles.title}>跨论文证据矩阵</h2>
            <div className={styles.matrixMeta}>
              <span>{activeFiles.length} 篇论文</span>
              <Badge aria-label={`提取状态：${activeMatrix.extractionState}`} tone={activeMatrix.extractionState === 'ready' ? 'success' : activeMatrix.extractionState === 'error' ? 'danger' : 'neutral'} soft>
                {activeMatrix.extractionState === 'extracting' ? '提取中' : activeMatrix.extractionState === 'ready' ? '已生成' : activeMatrix.extractionState === 'cancelled' ? '已取消' : '待生成'}
              </Badge>
              {!isOnline ? <span className={styles.offline}><WifiOff size={14} strokeWidth={1.5} aria-hidden="true" />离线：已保存内容仍可编辑</span> : null}
            </div>
          </div>
          <div className={styles.toolbarActions}>
            <Button aria-label="返回文件目录" variant="ghost" leftIcon={<ArrowLeft size={16} strokeWidth={1.5} />} onClick={() => navigate('/')}>
              文件目录
            </Button>
            <Button aria-label="删除当前矩阵" variant="ghost" leftIcon={<Trash2 size={15} strokeWidth={1.5} />} onClick={() => { void deleteActive().then(() => navigate('/evidence-matrix')); }}>
              删除
            </Button>
          </div>
        </div>
        <p className={styles.matrixMeta}>
          图谱关系只用于帮助选文；结论必须回到批注或原文核对后，才能标记为已确认并复制。
        </p>
        <label>
          <span className={styles.matrixMeta}>比较问题（必填）</span>
          <textarea className={styles.question} aria-label="比较问题" value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} onBlur={onQuestionBlur} placeholder="例如：不同研究对该方法有效性的结论和证据有什么差异？" rows={2} />
        </label>
        <div className={styles.toolbarActions}>
          {requestId ? (
            <Button aria-label="取消证据提取" variant="ghost" leftIcon={<LoaderCircle size={15} strokeWidth={1.5} />} onClick={() => { void cancelExtraction(); }}>取消提取</Button>
          ) : (
            <Button aria-label="生成证据提议" variant="primary" leftIcon={<Sparkles size={15} strokeWidth={1.5} />} disabled={!isOnline || !questionDraft.trim()} onClick={() => { void generateProposals(); }}>生成证据提议</Button>
          )}
          <Button aria-label="保存比较问题" variant="secondary" leftIcon={<Save size={15} strokeWidth={1.5} />} onClick={() => { void setComparisonQuestion(questionDraft); toast.success('比较问题已保存'); }}>保存
          </Button>
          <Button aria-label="复制已确认材料" variant="secondary" leftIcon={<ClipboardCopy size={15} strokeWidth={1.5} />} disabled={selectedRows.length === 0} onClick={() => { void onCopy(); }}>复制 {selectedRows.length > 0 ? `(${selectedRows.length})` : ''}
          </Button>
        </div>
        {errorMessage ? <p className={styles.warning} role="alert">{errorMessage}</p> : null}
        {activeMatrix.extractionError ? <p className={styles.warning}>{activeMatrix.extractionError}</p> : null}
      </section>

      <div className={styles.content}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>填写比较问题后生成候选结论；每条结论都需要回到原文核对。</span>
          </div>
        ) : (
          <div className={styles.rows}>
            {rows.map((row) => (
              <EvidenceRowEditor
                key={row.id}
                row={row}
                files={files}
                selected={selectedRowIds.includes(row.id)}
                onToggleSelected={() => toggleRowSelection(row.id)}
                onUpdateConclusion={(value) => { void updateConclusion(row.id, value); }}
                onUpdateNote={(evidenceId, value) => { void updateEvidenceNote(row.id, evidenceId, value); }}
                onSetVerification={(state) => { void setVerification(row.id, state); }}
                onOpenSource={(item) => onOpenSource(item, row.id)}
              />
            ))}
          </div>
        )}
        <EvidenceAnalysisPanel
          analysis={analysis}
          rows={rows}
          online={isOnline}
          requestId={analysisRequestId}
          onGenerate={() => { void generateAnalysis(); }}
          onCancel={() => { void cancelAnalysis(); }}
          onUpdate={(itemId, statement, rationale) => { void updateAnalysisItem(itemId, statement, rationale); }}
          onVerify={(itemId, state) => { void setAnalysisVerification(itemId, state); }}
          onCopy={() => { void onCopyAnalysis(); }}
        />
      </div>
    </main>
  );
}
