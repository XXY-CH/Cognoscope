/**
 * FileRowActions - 行 hover 操作按钮组
 * 所属页面：A · 文件目录 > 表格行
 * 规范参考：UI_spec.md §4.3；另增「新建副本」
 */
import { Copy, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { IconButton, Tooltip } from '../../components/common';
import type { FileNode } from '../../types';
import styles from './FileRowActions.module.css';

/**
 * FileRowActionsProps
 * @param file - 当前行文件
 * @param onRename - 进入重命名
 * @param onDuplicate - 新建副本
 * @param onMove - 打开移动对话框
 * @param onDelete - 打开删除确认
 */
export interface FileRowActionsProps {
  file: FileNode;
  onRename: (file: FileNode) => void;
  onDuplicate: (file: FileNode) => void;
  onMove: (file: FileNode) => void;
  onDelete: (file: FileNode) => void;
}

export function FileRowActions({
  file,
  onRename,
  onDuplicate,
  onMove,
  onDelete,
}: FileRowActionsProps) {
  return (
    <div className={styles.root}>
      <Tooltip content="重命名" aria-label="重命名提示" placement="bottom">
        <IconButton
          aria-label={`重命名 ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRename(file);
          }}
        >
          <Pencil strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
      <Tooltip content="新建副本" aria-label="新建副本提示" placement="bottom">
        <IconButton
          aria-label={`新建副本 ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(file);
          }}
        >
          <Copy strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
      <Tooltip content="移动到" aria-label="移动到提示" placement="bottom">
        <IconButton
          aria-label={`移动 ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onMove(file);
          }}
        >
          <FolderInput strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
      <Tooltip content="删除" aria-label="删除提示" placement="bottom">
        <IconButton
          aria-label={`删除 ${file.name}`}
          className={styles.danger}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file);
          }}
        >
          <Trash2 strokeWidth={1.5} />
        </IconButton>
      </Tooltip>
    </div>
  );
}
