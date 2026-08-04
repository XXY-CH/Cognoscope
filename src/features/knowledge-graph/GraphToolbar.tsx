/** GraphToolbar - 图谱统计、搜索、筛选与刷新操作 */
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button, SearchInput, Select } from '../../components/common';
import type { GraphKindFilter } from './graphFilters';
import styles from './KnowledgeGraphPage.module.css';

export type GraphView = 'overview' | 'papers' | 'topics' | 'evidence';
export type GraphEvidenceFilter =
  | 'all'
  | 'review'
  | 'disputed'
  | 'stale'
  | 'insufficient';

interface GraphToolbarProps {
  paperCount: number;
  paperEdgeCount: number;
  keywordCount: number;
  keywordEdgeCount: number;
  view: GraphView;
  syncing: boolean;
  loading: boolean;
  query: string;
  kindFilter: GraphKindFilter;
  evidenceFilter: GraphEvidenceFilter;
  onQueryChange: (query: string) => void;
  onKindFilterChange: (kind: GraphKindFilter) => void;
  onEvidenceFilterChange: (filter: GraphEvidenceFilter) => void;
  onViewChange: (view: GraphView) => void;
  onRefresh: () => void;
  onClear: () => void;
}

export function GraphToolbar({
  paperCount,
  paperEdgeCount,
  keywordCount,
  keywordEdgeCount,
  view,
  syncing,
  loading,
  query,
  kindFilter,
  evidenceFilter,
  onQueryChange,
  onKindFilterChange,
  onEvidenceFilterChange,
  onViewChange,
  onRefresh,
  onClear,
}: GraphToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <p className={styles.meta}>
          {paperCount} 篇论文 · {keywordCount} 个主题 · {paperEdgeCount + keywordEdgeCount} 条关系线索
          {syncing ? ' · 主题同步中…' : ''}
        </p>
        <div className={styles.actions}>
          <Button
            aria-label="刷新图谱"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={16} strokeWidth={1.5} />}
            disabled={loading}
            onClick={onRefresh}
          >
            刷新
          </Button>
          <Button
            aria-label="清除图谱"
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 size={16} strokeWidth={1.5} />}
            disabled={loading}
            onClick={onClear}
          >
            清除
          </Button>
        </div>
      </div>
      <div className={styles.filters}>
        <div className={styles.viewSwitcher} role="tablist" aria-label="图谱视图">
          {(
            [
              ['overview', '概览'],
              ['papers', '论文'],
              ['topics', '主题'],
              ['evidence', '证据'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={view === value}
              className={`${styles.viewTab}${view === value ? ` ${styles.viewTabActive}` : ''}`}
              key={value}
              onClick={() => onViewChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchInput
          aria-label="搜索图谱"
          className={styles.search}
          value={query}
          placeholder="搜索论文或主题"
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={() => onQueryChange('')}
        />
        <Select
          aria-label="筛选节点类型"
          value={kindFilter}
          options={[
            { value: 'all', label: '全部节点' },
            { value: 'paper', label: '只看论文' },
            { value: 'keyword', label: '只看主题' },
          ]}
          onChange={(event) =>
            onKindFilterChange(event.target.value as GraphKindFilter)
          }
        />
        <Select
          aria-label="筛选证据状态"
          value={evidenceFilter}
          options={[
            { value: 'all', label: '全部证据状态' },
            { value: 'review', label: '待核对' },
            { value: 'disputed', label: '存在争议' },
            { value: 'stale', label: '来源失效' },
            { value: 'insufficient', label: '证据不足' },
          ]}
          onChange={(event) =>
            onEvidenceFilterChange(event.target.value as GraphEvidenceFilter)
          }
        />
      </div>
      <p className={styles.explanation}>
        图谱用于关系导航；来源和证据状态在检查器中分开显示，只有矩阵核验后的定位材料可引用。
      </p>
      <div className={styles.legend} aria-label="关系来源图例">
        <span className={styles.legendLabel}>关系来源</span>
        <span className={styles.legendItem}>自动语义线索</span>
        <span className={styles.legendItem}>关键词共现</span>
        <span className={styles.legendItem}>用户确认</span>
        <span className={styles.legendItem}>来源未记录</span>
      </div>
    </div>
  );
}
