/**
 * CurrentResearchStatePage - 返回学术工作时先看“现在研究到哪里”。
 * 页面只组合本地文件、会话、图谱和证据状态；AI 整理结果接入后仍需保留来源状态。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  GitCompareArrows,
  Library,
  Network,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Skeleton } from '../../components/common';
import * as evidenceAnalysesDb from '../../db/evidenceAnalyses';
import * as evidenceRowsDb from '../../db/evidenceRows';
import { useEvidenceMatrixStore } from '../../stores/evidenceMatrixStore';
import { useFileStore } from '../../stores/fileStore';
import { useGraphStore } from '../../stores/graphStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useResearchArtifactStore } from '../../stores/researchArtifactStore';
import { formatFriendlyTime } from '../../utils/format';
import {
  buildCurrentResearchState,
  type CurrentResearchStateSnapshot,
} from '../../utils/currentResearchState';
import type { EvidenceAnalysis, EvidenceRow } from '../../types';
import { PostReadingSummary } from './PostReadingSummary';
import { ResearchLeadReview } from './ResearchLeadReview';
import styles from './CurrentResearchStatePage.module.css';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

function statusLabel(snapshot: CurrentResearchStateSnapshot): string {
  if (!snapshot.hasLibrary) return '等待第一篇文献进入研究空间';
  if (
    snapshot.pendingRowCount > 0 ||
    snapshot.disputedRowCount > 0 ||
    snapshot.pendingLeadCount > 0
  ) {
    return '有证据或研究线索需要回读和判断';
  }
  if (snapshot.active) return '研究正在本地持续';
  return '准备开始下一次阅读';
}

export function CurrentResearchStatePage() {
  const navigate = useNavigate();
  const files = useFileStore((state) => state.files);
  const fileStatus = useFileStore((state) => state.status);
  const loadFiles = useFileStore((state) => state.loadFiles);
  const openImport = useFileStore((state) => state.openImport);
  const sessions = useSessionStore((state) => state.sessions);
  const sessionStatus = useSessionStore((state) => state.status);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const matrices = useEvidenceMatrixStore((state) => state.matrices);
  const matrixStatus = useEvidenceMatrixStore((state) => state.loadStatus);
  const loadMatrices = useEvidenceMatrixStore((state) => state.loadMatrices);
  const graphNodes = useGraphStore((state) => state.nodes);
  const loadGraph = useGraphStore((state) => state.loadGraph);
  const digests = useResearchArtifactStore((state) => state.digests);
  const leads = useResearchArtifactStore((state) => state.leads);
  const signals = useResearchArtifactStore((state) => state.signals);
  const artifactStatus = useResearchArtifactStore((state) => state.loadStatus);
  const loadArtifacts = useResearchArtifactStore((state) => state.loadArtifacts);
  const setLeadStatus = useResearchArtifactStore((state) => state.setLeadStatus);
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [analyses, setAnalyses] = useState<EvidenceAnalysis[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const handleImport = () => {
    // ImportDialog 挂在资料库页；先打开状态，再导航让对话框在同一 store 状态下出现。
    openImport();
    navigate('/library');
  };

  useEffect(() => {
    void loadFiles();
    void loadSessions();
    void loadMatrices();
    void loadGraph();
    void loadArtifacts();
  }, [loadArtifacts, loadFiles, loadGraph, loadMatrices, loadSessions]);

  useEffect(() => {
    let cancelled = false;
    if (matrices.length === 0) {
      setRows([]);
      setAnalyses([]);
      return;
    }
    setEvidenceLoading(true);
    void Promise.all(
      matrices.map(async (matrix) => {
        const [matrixRows, analysis] = await Promise.all([
          evidenceRowsDb.listEvidenceRowsByMatrix(matrix.id),
          evidenceAnalysesDb.getEvidenceAnalysisByMatrix(matrix.id),
        ]);
        return { matrixRows, analysis };
      }),
    )
      .then((result) => {
        if (cancelled) return;
        setRows(result.flatMap((item) => item.matrixRows));
        setAnalyses(
          result.flatMap((item) => (item.analysis ? [item.analysis] : [])),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setAnalyses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matrices]);

  const snapshot = useMemo(
    () =>
      buildCurrentResearchState({
        files,
        sessions,
        matrices,
        rows,
        analyses,
        graphNodes,
        digests,
        leads,
        signals,
      }),
    [analyses, digests, files, graphNodes, leads, matrices, rows, sessions, signals],
  );

  const loading =
    fileStatus === 'loading' ||
    sessionStatus === 'loading' ||
    matrixStatus === 'loading' ||
    evidenceLoading ||
    artifactStatus === 'loading';

  if (loading && files.length === 0 && sessions.length === 0) {
    return <Skeleton aria-label="正在读取当前研究状态" variant="text" lines={6} />;
  }

  return (
    <div className={styles.root}>
      <section className={styles.intro} aria-labelledby="research-state-title">
        <div>
          <p className={styles.eyebrow}>现在</p>
          <h1 id="research-state-title" className={styles.title}>
            研究正在推进
          </h1>
          <p className={styles.subtitle}>
            {statusLabel(snapshot)}。把注意力留给原文，环境负责记住进展和需要回看的地方。
          </p>
        </div>
        <div className={styles.introActions}>
          {snapshot.active ? (
            <Button
              aria-label={`继续阅读 ${snapshot.active.file.name}`}
              leftIcon={<BookOpen size={16} strokeWidth={1.5} />}
              onClick={() => navigate(`/read/${snapshot.active!.file.id}`)}
            >
              继续阅读
            </Button>
          ) : (
            <Button
              aria-label="导入第一篇文献"
              leftIcon={<FilePlus2 size={16} strokeWidth={1.5} />}
              onClick={handleImport}
            >
              导入文献
            </Button>
          )}
          <Button
            aria-label="打开资料库"
            variant="secondary"
            leftIcon={<Library size={16} strokeWidth={1.5} />}
            onClick={() => navigate('/library')}
          >
            资料库
          </Button>
        </div>
      </section>

      {!snapshot.hasLibrary ? (
        <EmptyState
          aria-label="研究空间暂无文献"
          icon={<BookOpen strokeWidth={1.5} />}
          title="从一篇本地文献开始"
          description="导入 PDF 或 EPUB 后，阅读、批注和跨论文整理会在这里接上。"
          actionLabel="导入文献"
          actionAriaLabel="导入本地文献"
          onAction={handleImport}
        />
      ) : (
        <>
          <section className={styles.focusGrid} aria-label="当前研究焦点">
            <div className={styles.focusSurface}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>当前焦点</p>
                  <h2 className={styles.sectionTitle}>从这里继续</h2>
                </div>
                <span className={styles.statusMark}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  本地
                </span>
              </div>
              {snapshot.active ? (
                <button
                  type="button"
                  className={styles.activeReading}
                  aria-label={`打开 ${snapshot.active.file.name}`}
                  onClick={() => navigate(`/read/${snapshot.active!.file.id}`)}
                >
                  <span className={styles.activeReadingIcon} aria-hidden="true">
                    <BookOpen size={20} strokeWidth={1.5} />
                  </span>
                  <span className={styles.activeReadingCopy}>
                    <strong>{snapshot.active.file.name}</strong>
                    <span>
                      {snapshot.active.session.linesRead > 0
                        ? `已读 ${snapshot.active.session.linesRead.toLocaleString('zh-CN')} 行`
                        : '已进入阅读空间'}
                      {' · '}
                      {formatFriendlyTime(
                        snapshot.active.file.lastReadAt ?? snapshot.active.file.updatedAt,
                      )}
                    </span>
                  </span>
                  <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ) : (
                <p className={styles.inlineEmpty}>打开一篇文献，下一次回来时会从这里继续。</p>
              )}
            </div>

            <div className={styles.nextSurface}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionKicker}>下一步</p>
                  <h2 className={styles.sectionTitle}>环境已经记住的事</h2>
                </div>
                <Sparkles size={20} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <ul className={styles.actionList}>
                <li>
                  <button type="button" onClick={() => navigate('/evidence-matrix')}>
                    <span>待审阅证据</span>
                    <strong>{snapshot.pendingRowCount + snapshot.disputedRowCount}</strong>
                    <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigate('/knowledge-graph')}>
                    <span>个人研究图谱</span>
                    <strong>{snapshot.graphNodeCount}</strong>
                    <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigate('/library')}>
                    <span>本地文献</span>
                    <strong>{snapshot.activeFiles.length}</strong>
                    <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
              </ul>
            </div>
          </section>

          <section className={styles.metrics} aria-label="研究空间概览">
            <div className={styles.metric}>
              <span>已确认证据</span>
              <strong>{snapshot.verifiedRowCount}</strong>
              <small>可回读后引用</small>
            </div>
            <div className={styles.metric}>
              <span>证据矩阵</span>
              <strong>{snapshot.matrixCount}</strong>
              <small>{snapshot.analysisCount} 个研究分析</small>
            </div>
            <div className={styles.metric}>
              <span>待审阅</span>
              <strong>
                {snapshot.pendingRowCount + snapshot.disputedRowCount + snapshot.pendingLeadCount}
              </strong>
              <small>证据和线索，保留判断权</small>
            </div>
          </section>

          {snapshot.latestDigest ? (
            <PostReadingSummary
              digest={snapshot.latestDigest}
              fileName={
                files.find((file) => file.id === snapshot.latestDigest?.fileId)?.name ??
                '来源已从资料库移除'
              }
              pendingLeadCount={snapshot.pendingLeadCount}
              onReadSource={() => {
                const source = files.find(
                  (file) =>
                    file.id === snapshot.latestDigest?.fileId &&
                    file.deletedAt === null &&
                    file.type !== 'folder',
                );
                if (source) navigate(`/read/${source.id}`);
                else navigate('/library');
              }}
              onOpenGraph={() => navigate('/knowledge-graph')}
            />
          ) : null}

          <ResearchLeadReview
            leads={leads.filter((lead) => lead.status === 'proposed').slice(0, 4)}
            onAccept={(leadId) => {
              void setLeadStatus(leadId, 'accepted');
            }}
            onDismiss={(leadId) => {
              void setLeadStatus(leadId, 'dismissed');
            }}
            onReadSource={(lead) => {
              const source = files.find(
                (file) =>
                  file.id === lead.fileIds[0] &&
                  file.deletedAt === null &&
                  file.type !== 'folder',
              );
              if (source) navigate(`/read/${source.id}`);
              else navigate('/library');
            }}
          />

          <section className={styles.history} aria-labelledby="recent-reading-title">
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>研究轨迹</p>
                <h2 id="recent-reading-title" className={styles.sectionTitle}>
                  最近阅读
                </h2>
              </div>
              <Button
                aria-label="查看全部阅读会话"
                variant="ghost"
                size="sm"
                rightIcon={<ArrowRight size={16} strokeWidth={1.5} />}
                onClick={() => navigate('/dashboard')}
              >
                查看进展
              </Button>
            </div>
            {snapshot.recentSessions.length === 0 ? (
              <p className={styles.inlineEmpty}>还没有完整的阅读会话，打开一篇文献即可开始。</p>
            ) : (
              <div className={styles.sessionList}>
                {snapshot.recentSessions.map(({ session, file }) => (
                  <button
                    type="button"
                    className={styles.sessionRow}
                    key={session.id}
                    aria-label={`打开 ${file.name}`}
                    onClick={() => navigate(`/read/${file.id}`)}
                  >
                    <span className={styles.sessionIcon} aria-hidden="true">
                      <BookOpen size={16} strokeWidth={1.5} />
                    </span>
                    <span className={styles.sessionName}>{file.name}</span>
                    <span className={styles.sessionMeta}>
                      {formatDuration(session.durationSec)} · {formatFriendlyTime(session.startedAt)}
                    </span>
                    <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={styles.statusStrip} aria-label="研究状态说明">
            <span className={styles.statusStripIcon} aria-hidden="true">
              {snapshot.disputedRowCount > 0 ? (
                <TriangleAlert size={18} strokeWidth={1.5} />
              ) : (
                <CheckCircle2 size={18} strokeWidth={1.5} />
              )}
            </span>
            <span>
              {snapshot.disputedRowCount > 0
                ? `有 ${snapshot.disputedRowCount} 条证据存在冲突，系统保留它们供你判断。`
                : '本地阅读、批注和已确认证据会持续留在研究空间里。'}
            </span>
            <GitCompareArrows size={18} strokeWidth={1.5} aria-hidden="true" />
            <Network size={18} strokeWidth={1.5} aria-hidden="true" />
          </section>
        </>
      )}
    </div>
  );
}
