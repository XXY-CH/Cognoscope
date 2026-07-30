/**
 * KnowledgeGraphPage - 知识图谱页面占位（实现已清空，待后继接入）
 * 所属页面：C · 知识图谱
 * 规范参考：UI_spec.md §6；交接说明见根目录 HANDOFF.md
 */
import { Network } from 'lucide-react';
import { EmptyState } from '../../components/common';
import styles from './KnowledgeGraphPage.module.css';

/**
 * KnowledgeGraphPage - 仅保留路由/导航可达的空态占位
 * 力导向画布、工具栏、详情面板等实现已移除，详见 HANDOFF.md
 */
export function KnowledgeGraphPage() {
  return (
    <main className={styles.root}>
      <EmptyState
        aria-label="知识图谱尚未实现"
        icon={<Network size={64} strokeWidth={1.5} />}
        title="知识图谱（占位）"
        description="本模块内容已清空，规范与接入指引见根目录 HANDOFF.md"
      />
    </main>
  );
}
