/** GraphToolbar - 图谱统计、搜索、筛选与刷新操作 */
import { RefreshCw, Trash2 } from 'lucide-react';
import { Badge, Button, SearchInput, Select } from '../../components/common';
import type { GraphKindFilter } from './graphFilters';
import styles from './KnowledgeGraphPage.module.css';

interface GraphToolbarProps {
  paperCount: number;
  paperEdgeCount: number;
  keywordCount: number;
  keywordEdgeCount: number;
  syncing: boolean;
  loading: boolean;
  query: string;
  kindFilter: GraphKindFilter;
  onQueryChange: (query: string) => void;
  onKindFilterChange: (kind: GraphKindFilter) => void;
  onRefresh: () => void;
  onClear: () => void;
}

export function GraphToolbar({
  paperCount,
  paperEdgeCount,
  keywordCount,
  keywordEdgeCount,
  syncing,
  loading,
  query,
  kindFilter,
  onQueryChange,
  onKindFilterChange,
  onRefresh,
  onClear,
}: GraphToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <p className={styles.meta}>
          论文 {paperCount} 节点 · {paperEdgeCount} 边 · 关键词 {keywordCount} 节点 ·{' '}
          {keywordEdgeCount} 边
          {syncing ? ' · 关键词同步中…' : ''}
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
        <SearchInput
          aria-label="搜索图谱"
          className={styles.search}
          value={query}
          placeholder="搜索论文标题或关键词"
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={() => onQueryChange('')}
        />
        <Select
          aria-label="筛选节点类型"
          value={kindFilter}
          options={[
            { value: 'all', label: '全部节点' },
            { value: 'paper', label: '只看论文' },
            { value: 'keyword', label: '只看关键词' },
          ]}
          onChange={(event) =>
            onKindFilterChange(event.target.value as GraphKindFilter)
          }
        />
      </div>
      <p className={styles.explanation}>
        图谱用于整理已导入论文之间的主题关联；选中节点可查看关系依据并回到原文。
      </p>
      <div className={styles.legend} aria-label="关系来源图例">
        <span className={styles.legendLabel}>关系来源</span>
        <Badge aria-label="AI 语义关系" tone="accent" soft>
          AI 语义
        </Badge>
        <Badge aria-label="关键词共现关系" tone="success" soft>
          关键词共现
        </Badge>
        <Badge aria-label="共现与 AI 混合关系" tone="accent" soft>
          共现 + AI
        </Badge>
      </div>
    </div>
  );
}
