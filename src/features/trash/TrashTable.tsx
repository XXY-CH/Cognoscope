/**
 * TrashTable - 回收站列表
 * 所属页面：D · 回收站
 * 规范参考：UI_spec.md §7；多选表头与文件目录同格式
 *
 * 列：文件名 / 原始路径 / 更新时间 / 最后阅读 / 大小
 * 悬停时原路径保持可见，操作按钮覆盖两列时间
 */
import { useEffect, useState } from 'react';
import { Button } from '../../components/common';
import type { FileNode } from '../../types';
import { formatFileSize, formatFriendlyTime } from '../../utils/format';
import fileStyles from '../file-directory/FileTable.module.css';
import { FileTypeIcon } from '../file-directory/FileTypeIcon';
import { TrashRowActions } from './TrashRowActions';
import styles from './TrashTable.module.css';

/**
 * TrashTableProps
 * @param rows - 回收站可见行
 * @param selectedIds - 多选 id
 * @param onToggleSelect - 切换单行选中
 * @param onSelectAll - 全选
 * @param onClearSelection - 清空选择
 * @param onRestore - 还原一项（原路径）
 * @param onMove - 移动到新路径
 * @param onPurge - 彻底删除一项
 * @param onBatchMove - 批量移动到
 * @param onBatchRestore - 批量恢复（原路径）
 * @param onBatchPurge - 批量彻底删除
 */
export interface TrashTableProps {
  rows: FileNode[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onRestore: (file: FileNode) => void;
  onMove: (file: FileNode) => void;
  onPurge: (file: FileNode) => void;
  onBatchMove: () => void;
  onBatchRestore: () => void;
  onBatchPurge: () => void;
}

export function TrashTable({
  rows,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onRestore,
  onMove,
  onPurge,
  onBatchMove,
  onBatchRestore,
  onBatchPurge,
}: TrashTableProps) {
  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  const someSelected =
    rows.some((r) => selectedIds.includes(r.id)) && !allSelected;
  /** 取消多选后需重新移入才显示操作 */
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    setHoveredId(null);
  }, [selectedIds.length]);

  const headerCheckboxRef = (node: HTMLInputElement | null) => {
    if (node) node.indeterminate = someSelected;
  };

  return (
    <div
      className={[
        fileStyles.wrap,
        selectedIds.length > 0 ? fileStyles.hasSelection : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <table className={fileStyles.table} aria-label="回收站列表">
        <thead className={fileStyles.head}>
          <tr>
            <th scope="col" className={fileStyles.checkCol}>
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                className={fileStyles.checkbox}
                aria-label="全选回收站列表"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) onClearSelection();
                  else onSelectAll(rows.map((r) => r.id));
                }}
              />
            </th>
            {selectedIds.length > 0 ? (
              <>
                <th scope="col" className={fileStyles.nameCol}>
                  <span className={fileStyles.selectedLabel}>
                    已选 {selectedIds.length} 项
                  </span>
                </th>
                <th scope="col" className={styles.pathCol}>
                  原始路径
                </th>
                <th
                  scope="col"
                  colSpan={2}
                  className={fileStyles.batchActionsCol}
                >
                  <div
                    className={fileStyles.batchActions}
                    role="group"
                    aria-label="批量操作"
                  >
                    <Button
                      aria-label="取消多选"
                      variant="ghost"
                      size="sm"
                      onClick={onClearSelection}
                    >
                      取消
                    </Button>
                    <Button
                      aria-label="恢复选中项"
                      variant="ghost"
                      size="sm"
                      onClick={onBatchRestore}
                    >
                      恢复
                    </Button>
                    <Button
                      aria-label="移动到"
                      variant="ghost"
                      size="sm"
                      onClick={onBatchMove}
                    >
                      移动到
                    </Button>
                    <Button
                      aria-label="彻底删除选中项"
                      variant="ghost"
                      size="sm"
                      className={fileStyles.batchDanger}
                      onClick={onBatchPurge}
                    >
                      彻底删除
                    </Button>
                  </div>
                </th>
              </>
            ) : (
              <>
                <th scope="col" className={fileStyles.nameCol}>
                  文件名
                </th>
                <th scope="col" className={styles.pathCol}>
                  原始路径
                </th>
                <th scope="col" className={fileStyles.timeCol}>
                  更新时间
                </th>
                <th scope="col" className={fileStyles.timeCol}>
                  最后阅读
                </th>
              </>
            )}
            <th scope="col" className={fileStyles.sizeCol}>
              大小
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((file) => {
            const selected = selectedIds.includes(file.id);
            const showActions =
              selectedIds.length === 0 && hoveredId === file.id;
            return (
              <tr
                key={file.id}
                className={[
                  fileStyles.row,
                  selected ? fileStyles.rowSelected : '',
                  showActions ? fileStyles.rowActionsVisible : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => {
                  if (selectedIds.length === 0) setHoveredId(file.id);
                }}
                onMouseLeave={() => {
                  setHoveredId((id) => (id === file.id ? null : id));
                }}
              >
                <td className={fileStyles.checkCol}>
                  <input
                    type="checkbox"
                    className={fileStyles.checkbox}
                    aria-label={`选择 ${file.name}`}
                    checked={selected}
                    onChange={() => onToggleSelect(file.id)}
                  />
                </td>
                <td className={fileStyles.nameCol}>
                  <div className={fileStyles.nameBtn}>
                    <FileTypeIcon type={file.type} />
                    <span className={fileStyles.nameText}>{file.name}</span>
                  </div>
                </td>
                <td className={styles.pathCol}>
                  {/* 原路径用独立类，悬停时不隐藏 */}
                  <span className={styles.pathText}>
                    {file.originalPath ?? '—'}
                  </span>
                </td>
                <td className={fileStyles.timeCol}>
                  <span className={fileStyles.timeText}>
                    {formatFriendlyTime(file.updatedAt)}
                  </span>
                </td>
                <td className={fileStyles.timeCol}>
                  <span className={fileStyles.timeText}>
                    {formatFriendlyTime(file.lastReadAt)}
                  </span>
                  <div className={fileStyles.actionsOverlay}>
                    <TrashRowActions
                      file={file}
                      onRestore={onRestore}
                      onMove={onMove}
                      onPurge={onPurge}
                    />
                  </div>
                </td>
                <td className={fileStyles.sizeCol}>
                  <span className={fileStyles.sizeText}>
                    {file.type === 'folder'
                      ? '—'
                      : formatFileSize(file.sizeBytes)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
