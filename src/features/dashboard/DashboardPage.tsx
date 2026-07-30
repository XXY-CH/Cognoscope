/**
 * DashboardPage - 个人仪表盘主页面（精简占位版）
 * 所属页面：B · 个人仪表盘
 * 规范参考：UI_spec.md §5（产品迭代：仅两指标 + 热力图 + 专注会话六维表）
 */
import { FocusSessionList } from './FocusSessionList';
import { MetricCards } from './MetricCards';
import { ReadingHeatmap } from './ReadingHeatmap';
import styles from './DashboardPage.module.css';

/**
 * DashboardPage - 自上而下：指标卡 → 热力图 → 专注会话列表
 */
export function DashboardPage() {
  return (
    <div className={styles.root}>
      <MetricCards />
      <ReadingHeatmap />
      <FocusSessionList />
    </div>
  );
}
