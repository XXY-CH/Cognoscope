/**
 * BatchActionBar - 多选批量操作条
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4.3（高 48，吸附 PageHeader 下方）
 */
import { Download, FolderInput, Trash2 } from 'lucide-react';
import { Button } from '../../components/common';
import styles from './BatchActionBar.module.css';

/**
 * BatchActionBarProps
 * @param count - 已选数量
 * @param onMove - 批量移动
 * @param onDownload - 批量下载
 * @param onDelete - 批量删除
 * @param onClear - 清除选择
 */
export interface BatchActionBarProps {
  count: number;
  onMove: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BatchActionBar({
  count,
  onMove,
  onDownload,
  onDelete,
  onClear,
}: BatchActionBarProps) {
  if (count <= 0) return null;

  return (
    <div className={styles.root} role="region" aria-label="批量操作">
      <span className={styles.count}>已选中 {count} 项</span>
      <div className={styles.actions}>
        <Button
          aria-label="批量移动到"
          variant="ghost"
          size="sm"
          leftIcon={<FolderInput size={16} strokeWidth={1.5} />}
          onClick={onMove}
        >
          移动到
        </Button>
        <Button
          aria-label="批量下载"
          variant="ghost"
          size="sm"
          leftIcon={<Download size={16} strokeWidth={1.5} />}
          onClick={onDownload}
        >
          下载
        </Button>
        <Button
          aria-label="批量删除"
          variant="ghost"
          size="sm"
          className={styles.danger}
          leftIcon={<Trash2 size={16} strokeWidth={1.5} />}
          onClick={onDelete}
        >
          删除
        </Button>
        <Button
          aria-label="取消多选"
          variant="ghost"
          size="sm"
          onClick={onClear}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
