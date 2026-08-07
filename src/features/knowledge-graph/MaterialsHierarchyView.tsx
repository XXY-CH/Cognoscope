import { ChevronDown, ChevronRight, Database, FileText, FlaskConical, Layers3 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import styles from './MaterialsHierarchyView.module.css';

export type MaterialsNodeKind = 'scope' | 'cluster' | 'paper' | 'method' | 'dataset';
export type MaterialsSourceKind = 'structure' | 'metadata' | 'evidence' | 'user' | 'unknown';

export interface MaterialsNavigationTarget {
  kind: MaterialsNodeKind;
  id: string;
  label: string;
  path: string[];
  reason: string;
  source: MaterialsSourceKind;
  fileId?: string | null;
}

export interface MaterialsLeaf {
  id: string;
  label: string;
  kind: 'method' | 'dataset';
  reason?: string;
  source?: MaterialsSourceKind;
}

export interface MaterialsPaper {
  id: string;
  label: string;
  fileId?: string | null;
  reason?: string;
  source?: MaterialsSourceKind;
  methods?: readonly MaterialsLeaf[];
  datasets?: readonly MaterialsLeaf[];
}

export interface MaterialsTopicCluster {
  id: string;
  label: string;
  description?: string;
  reason?: string;
  source?: MaterialsSourceKind;
  papers: readonly MaterialsPaper[];
}

export interface MaterialsResearchScope {
  id: string;
  label: string;
  description?: string;
  reason?: string;
  source?: MaterialsSourceKind;
}

export interface MaterialsHierarchyData {
  scope: MaterialsResearchScope;
  clusters: readonly MaterialsTopicCluster[];
}

export interface MaterialsHierarchyViewProps {
  data: MaterialsHierarchyData;
  selectedId?: string | null;
  /** Maximum number of rendered hierarchy nodes; clusters remain available when content is capped. */
  maxVisibleNodes?: number;
  onNavigate?: (target: MaterialsNavigationTarget) => void;
  onClusterToggle?: (clusterId: string, collapsed: boolean) => void;
  className?: string;
}

const DEFAULT_MAX_VISIBLE_NODES = 80;

function nodeCount(data: MaterialsHierarchyData): number {
  return (
    1 +
    data.clusters.length +
    data.clusters.reduce(
      (clusterTotal, cluster) =>
        clusterTotal +
        cluster.papers.reduce(
          (paperTotal, paper) =>
            paperTotal +
            (paper.methods?.length ?? 0) +
            (paper.datasets?.length ?? 0),
          0,
        ),
      0,
    )
  );
}

function leafLabel(kind: MaterialsLeaf['kind']): string {
  return kind === 'method' ? '方法' : '数据集';
}

function iconForNode(kind: MaterialsNodeKind): ReactNode {
  if (kind === 'scope' || kind === 'cluster') {
    return <Layers3 size={16} strokeWidth={1.6} aria-hidden="true" />;
  }
  if (kind === 'paper') {
    return <FileText size={16} strokeWidth={1.6} aria-hidden="true" />;
  }
  return kind === 'method' ? (
    <FlaskConical size={15} strokeWidth={1.6} aria-hidden="true" />
  ) : (
    <Database size={15} strokeWidth={1.6} aria-hidden="true" />
  );
}

function targetFor(
  kind: MaterialsNodeKind,
  id: string,
  label: string,
  path: string[],
  reason: string | undefined,
  source: MaterialsSourceKind | undefined,
  fileId?: string | null,
): MaterialsNavigationTarget {
  return {
    kind,
    id,
    label,
    path,
    reason:
      reason?.trim() ||
      (kind === 'scope'
        ? '研究范围是资料地图的顶层导航入口。'
        : kind === 'cluster'
          ? '主题簇用于把相关材料收敛为可浏览的局部范围。'
          : kind === 'paper'
            ? '论文是可回读的原始来源，主题和下层元数据只提供导航线索。'
            : `${leafLabel(kind === 'method' ? 'method' : 'dataset')}来自论文元数据或证据整理，不能单独替代原文核验。`),
    source: source ?? 'unknown',
    ...(fileId !== undefined ? { fileId } : {}),
  };
}

function isSelected(selectedId: string | null | undefined, id: string): boolean {
  return selectedId === id;
}

export function MaterialsHierarchyView({
  data,
  selectedId = null,
  maxVisibleNodes = DEFAULT_MAX_VISIBLE_NODES,
  onNavigate,
  onClusterToggle,
  className,
}: MaterialsHierarchyViewProps) {
  const initialCollapsed = nodeCount(data) > maxVisibleNodes
    ? new Set(data.clusters.map((cluster) => cluster.id))
    : new Set<string>();
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(initialCollapsed);
  const safeLimit = Math.max(1, Math.floor(maxVisibleNodes) || DEFAULT_MAX_VISIBLE_NODES);
  const capped = nodeCount(data) > safeLimit;
  const hasClusters = data.clusters.length > 0;

  const navigate = (target: MaterialsNavigationTarget) => {
    onNavigate?.(target);
  };

  const toggleCluster = (clusterId: string) => {
    setCollapsedClusters((current) => {
      const next = new Set(current);
      const collapsed = !next.has(clusterId);
      if (collapsed) next.add(clusterId);
      else next.delete(clusterId);
      onClusterToggle?.(clusterId, collapsed);
      return next;
    });
  };

  if (!hasClusters) {
    return (
      <section className={`${styles.container}${className ? ` ${className}` : ''}`} aria-label="资料分层视图">
        <div className={styles.emptyState}>
          <Layers3 size={24} strokeWidth={1.5} aria-hidden="true" />
          <h2>暂无资料层级</h2>
          <p>先把论文加入研究范围，主题簇和可回读来源会出现在这里。</p>
        </div>
      </section>
    );
  }

  let remaining = safeLimit - 1 - data.clusters.length;
  let hiddenNodeCount = 0;

  return (
    <section className={`${styles.container}${className ? ` ${className}` : ''}`} aria-label="资料分层视图">
      <header className={styles.scopeHeader}>
        <button
          type="button"
          className={`${styles.nodeButton} ${styles.scopeButton}${isSelected(selectedId, data.scope.id) ? ` ${styles.selected}` : ''}`}
          aria-label={`打开研究范围 ${data.scope.label}`}
          onClick={() =>
            navigate(
              targetFor(
                'scope',
                data.scope.id,
                data.scope.label,
                [data.scope.label],
                data.scope.reason,
                data.scope.source,
              ),
            )
          }
        >
          <span className={styles.nodeIcon}>{iconForNode('scope')}</span>
          <span className={styles.nodeCopy}>
            <span className={styles.eyebrow}>研究范围</span>
            <strong>{data.scope.label}</strong>
            {data.scope.description ? <small>{data.scope.description}</small> : null}
          </span>
        </button>
      </header>

      <div className={styles.connector} aria-hidden="true" />
      <div className={styles.clusterList} role="list" aria-label="主题簇">
        {data.clusters.map((cluster) => {
          const collapsed = collapsedClusters.has(cluster.id);
          const clusterPath = [data.scope.label, cluster.label];
          const clusterNodeVisible = remaining >= 0;
          if (clusterNodeVisible) remaining -= 1;
          else hiddenNodeCount += 1;

          const visiblePapers: MaterialsPaper[] = [];
          if (!collapsed && clusterNodeVisible) {
            for (const paper of cluster.papers) {
              const leafCount = (paper.methods?.length ?? 0) + (paper.datasets?.length ?? 0);
              if (remaining < 1) {
                hiddenNodeCount += 1 + leafCount;
                continue;
              }
              remaining -= 1;
              const visibleLeaves = [...(paper.methods ?? []), ...(paper.datasets ?? [])].filter(() => {
                if (remaining < 1) {
                  hiddenNodeCount += 1;
                  return false;
                }
                remaining -= 1;
                return true;
              });
              visiblePapers.push({
                ...paper,
                methods: visibleLeaves.filter((leaf) => leaf.kind === 'method'),
                datasets: visibleLeaves.filter((leaf) => leaf.kind === 'dataset'),
              });
              const omittedLeaves = leafCount - visibleLeaves.length;
              hiddenNodeCount += omittedLeaves;
            }
          } else if (collapsed) {
            hiddenNodeCount += cluster.papers.reduce(
              (total, paper) =>
                total + 1 + (paper.methods?.length ?? 0) + (paper.datasets?.length ?? 0),
              0,
            );
          }

          return (
            <article className={styles.cluster} key={cluster.id} role="listitem">
              <div className={styles.clusterHeader}>
                <button
                  type="button"
                  className={styles.toggleButton}
                  aria-label={`${collapsed ? '展开' : '收起'}主题簇 ${cluster.label}`}
                  aria-expanded={!collapsed}
                  onClick={() => toggleCluster(cluster.id)}
                >
                  {collapsed ? (
                    <ChevronRight size={16} strokeWidth={1.7} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.nodeButton} ${styles.clusterButton}${isSelected(selectedId, cluster.id) ? ` ${styles.selected}` : ''}`}
                  aria-label={`打开主题簇 ${cluster.label}`}
                  onClick={() =>
                    navigate(
                      targetFor(
                        'cluster',
                        cluster.id,
                        cluster.label,
                        clusterPath,
                        cluster.reason,
                        cluster.source,
                      ),
                    )
                  }
                >
                  <span className={styles.nodeIcon}>{iconForNode('cluster')}</span>
                  <span className={styles.nodeCopy}>
                    <strong>{cluster.label}</strong>
                    <small>{cluster.papers.length} 篇论文</small>
                  </span>
                </button>
              </div>
              {cluster.description ? <p className={styles.clusterDescription}>{cluster.description}</p> : null}
              {!collapsed ? (
                <div className={styles.paperList} role="list" aria-label={`${cluster.label}中的论文`}>
                  {visiblePapers.length === 0 ? (
                    <p className={styles.localEmpty}>该主题簇暂无可显示论文。</p>
                  ) : (
                    visiblePapers.map((paper) => {
                      const paperPath = [...clusterPath, paper.label];
                      const leaves = [...(paper.methods ?? []), ...(paper.datasets ?? [])];
                      return (
                        <div className={styles.paperRow} key={paper.id} role="listitem">
                          <button
                            type="button"
                            className={`${styles.nodeButton} ${styles.paperButton}${isSelected(selectedId, paper.id) ? ` ${styles.selected}` : ''}`}
                            aria-label={`打开论文 ${paper.label}`}
                            onClick={() =>
                              navigate(
                                targetFor(
                                  'paper',
                                  paper.id,
                                  paper.label,
                                  paperPath,
                                  paper.reason,
                                  paper.source,
                                  paper.fileId,
                                ),
                              )
                            }
                          >
                            <span className={styles.nodeIcon}>{iconForNode('paper')}</span>
                            <span className={styles.nodeCopy}>
                              <strong>{paper.label}</strong>
                              {leaves.length > 0 ? <small>{leaves.length} 个方法/数据集</small> : null}
                            </span>
                          </button>
                          {leaves.length > 0 ? (
                            <div className={styles.leafList} role="list" aria-label={`${paper.label}的方法和数据集`}>
                              {leaves.map((leaf) => (
                                <button
                                  type="button"
                                  className={`${styles.leafButton}${isSelected(selectedId, leaf.id) ? ` ${styles.selected}` : ''}`}
                                  key={leaf.id}
                                  aria-label={`打开${leafLabel(leaf.kind)} ${leaf.label}`}
                                  onClick={() =>
                                    navigate(
                                      targetFor(
                                        leaf.kind,
                                        leaf.id,
                                        leaf.label,
                                        [...paperPath, leaf.label],
                                        leaf.reason,
                                        leaf.source ?? 'metadata',
                                        paper.fileId,
                                      ),
                                    )
                                  }
                                >
                                  <span className={styles.nodeIcon}>{iconForNode(leaf.kind)}</span>
                                  <span className={styles.nodeCopy}>
                                    <span>{leaf.label}</span>
                                    <small>{leafLabel(leaf.kind)}</small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.localEmpty}>方法 / 数据集待整理</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {capped ? (
        <p className={styles.capNotice} role="status">
          为保持层级可读性，默认折叠主题簇并限制列表为 {safeLimit} 个节点。
          {hiddenNodeCount > 0 ? ` 当前隐藏 ${hiddenNodeCount} 个节点。` : ''}
          展开单个主题簇查看局部资料。
        </p>
      ) : null}
    </section>
  );
}

export { DEFAULT_MAX_VISIBLE_NODES };
