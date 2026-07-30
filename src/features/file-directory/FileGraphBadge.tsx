/**
 * FileGraphBadge - 文件是否已加入知识图谱的显式标签
 * 所属页面：A · 文件目录 > FileTable
 * 失败时可手动重试入图
 */
import { Tag, Button, toast } from '../../components/common';
import type { GraphMember } from '../../types';
import { useGraphStore } from '../../stores/graphStore';
import styles from './FileGraphBadge.module.css';

interface FileGraphBadgeProps {
  fileId: string;
  /** 仅 PDF 等文献显示；文件夹不渲染 */
  visible: boolean;
  member: GraphMember | undefined;
  joining: boolean;
}

/**
 * FileGraphBadge - 已入图 / 入图中 / 失败 / 未入图 + 手动加入
 */
export function FileGraphBadge({
  fileId,
  visible,
  member,
  joining,
}: FileGraphBadgeProps) {
  const addFileToGraph = useGraphStore((s) => s.addFileToGraph);

  if (!visible) return null;

  const status = joining ? 'pending' : (member?.status ?? 'out');

  const handleJoin = async () => {
    const result = await addFileToGraph(fileId);
    if (result === 'in') toast.success('已加入知识图谱');
    else if (result === 'failed') {
      const msg =
        useGraphStore.getState().membersByFileId[fileId]?.errorMessage ??
        '加入图谱失败';
      toast.error(msg);
    }
  };

  if (status === 'in') {
    return (
      <Tag aria-label="已加入知识图谱" tone="success">
        已入图谱
      </Tag>
    );
  }

  if (status === 'pending') {
    return (
      <Tag aria-label="正在加入知识图谱" tone="neutral">
        入图中…
      </Tag>
    );
  }

  if (status === 'failed') {
    return (
      <div className={styles.row}>
        <Tag
          aria-label={
            member?.errorMessage
              ? `入图失败：${member.errorMessage}`
              : '入图失败'
          }
          tone="danger"
        >
          入图失败
        </Tag>
        <Button
          aria-label="手动加入知识图谱"
          variant="secondary"
          size="sm"
          disabled={joining}
          onClick={(e) => {
            e.stopPropagation();
            void handleJoin();
          }}
        >
          加入图谱
        </Button>
      </div>
    );
  }

  // out：尚未尝试或清除后
  return (
    <div className={styles.row}>
      <Tag aria-label="未加入知识图谱" tone="neutral">
        未入图谱
      </Tag>
      <Button
        aria-label="手动加入知识图谱"
        variant="secondary"
        size="sm"
        disabled={joining}
        onClick={(e) => {
          e.stopPropagation();
          void handleJoin();
        }}
      >
        加入图谱
      </Button>
    </div>
  );
}
