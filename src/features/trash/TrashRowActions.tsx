/**
 * TrashRowActions - 回收站行 hover：还原 / 移动到 / 彻底删除
 * 所属页面：D · 回收站
 * 规范参考：UI_spec.md §7；移动到 = 恢复至新路径
 */
import { FolderInput, RotateCcw, Trash2 } from 'lucide-react';
import { IconButton, Tooltip } from '../../components/common';
import type { FileNode } from '../../types';
import styles from './TrashRowActions.module.css';

/**
 * TrashRowActionsProps
 * @param file - 当前行
 * @param onRestore - 还原到原路径
 * @param onMove - 移动到（还原至新路径）
 * @param onPurge - 彻底删除
 */
export interface TrashRowActionsProps {
  file: FileNode;
  onRestore: (file: FileNode) => void;
  onMove: (file: FileNode) => void;
  onPurge: (file: FileNode) => void;
}

export function TrashRowActions({
  file,
  onRestore,
  onMove,
  onPurge,
}: TrashRowActionsProps) {
  return (
    <div className={styles.root}>
      <Tooltip content="还原" aria-label="还原提示">
        <IconButton
          aria-label={`还原 ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRestore(file);
          }}
        >
          <RotateCcw strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
      <Tooltip content="移动到" aria-label="移动到提示">
        <IconButton
          aria-label={`移动 ${file.name} 到新路径`}
          onClick={(e) => {
            e.stopPropagation();
            onMove(file);
          }}
        >
          <FolderInput strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
      <Tooltip content="彻底删除" aria-label="彻底删除提示">
        <IconButton
          aria-label={`彻底删除 ${file.name}`}
          className={styles.danger}
          onClick={(e) => {
            e.stopPropagation();
            onPurge(file);
          }}
        >
          <Trash2 strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
    </div>
  );
}
