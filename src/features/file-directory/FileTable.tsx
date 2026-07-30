/**
 * FileTable - 文件列表表格（排序、多选、行 hover 操作、重命名）
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4.3 / §4.4
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button, Input, toast } from '../../components/common';
import type { FileNode } from '../../types';
import {
  useFileStore,
  type FileSortKey,
} from '../../stores/fileStore';
import { useFileDocMetaStore } from '../../stores/fileDocMetaStore';
import { formatFileSize, formatFriendlyTime } from '../../utils/format';
import { FRONT_MATTER_EXTRACTOR_VERSION } from '../../utils/pdfFrontMatter';
import { FileDocMetaCell } from './FileDocMetaCell';
import { FileGraphBadge } from './FileGraphBadge';
import { FileRowActions } from './FileRowActions';
import { FileTypeIcon } from './FileTypeIcon';
import styles from './FileTable.module.css';
import { useGraphStore } from '../../stores/graphStore';

/**
 * FileTableProps
 * @param rows - 当前可见文件行
 * @param onOpen - 打开文件或进入文件夹
 */
export interface FileTableProps {
  rows: FileNode[];
  onOpen: (file: FileNode) => void;
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction?: 'asc' | 'desc';
}) {
  if (!active) {
    return (
      <ArrowUpDown
        className={styles.sortIdle}
        size={14}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    );
  }
  return direction === 'desc' ? (
    <ArrowDown
      className={styles.sortActive}
      size={14}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  ) : (
    <ArrowUp
      className={styles.sortActive}
      size={14}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

export function FileTable({ rows, onOpen }: FileTableProps) {
  const sort = useFileStore((s) => s.sort);
  const selectedIds = useFileStore((s) => s.selectedIds);
  const renamingId = useFileStore((s) => s.renamingId);
  const cycleSort = useFileStore((s) => s.cycleSort);
  const toggleSelect = useFileStore((s) => s.toggleSelect);
  const selectAllVisible = useFileStore((s) => s.selectAllVisible);
  const clearSelection = useFileStore((s) => s.clearSelection);
  const setRenamingId = useFileStore((s) => s.setRenamingId);
  const renameFile = useFileStore((s) => s.renameFile);
  const duplicateFile = useFileStore((s) => s.duplicateFile);
  const openMoveDialog = useFileStore((s) => s.openMoveDialog);
  const openDeleteConfirm = useFileStore((s) => s.openDeleteConfirm);
  const renameInputRef = useRef<HTMLInputElement>(null);
  /** 用 JS 跟踪悬停行：取消多选后需重新移入才显示操作，避免 :hover 粘滞 */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** 展开摘要的文件 id */
  const [openAbstractId, setOpenAbstractId] = useState<string | null>(null);

  const metaById = useFileDocMetaStore(useShallow((s) => s.byId));
  const extractingIds = useFileDocMetaStore(useShallow((s) => s.extractingIds));
  const ensureForFiles = useFileDocMetaStore((s) => s.ensureForFiles);
  const membersByFileId = useGraphStore(useShallow((s) => s.membersByFileId));
  const joiningIds = useGraphStore(useShallow((s) => s.joiningIds));
  const loadGraph = useGraphStore((s) => s.loadGraph);

  useEffect(() => {
    // 可见 PDF 按需抽取；版本号变化时强制全量重抽
    void ensureForFiles(rows);
  }, [rows, ensureForFiles, FRONT_MATTER_EXTRACTOR_VERSION]);

  useEffect(() => {
    // 目录页同步入图状态标签
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    // 选中变化时清空悬停，取消多选后按钮不会立刻因残留 :hover 出现
    setHoveredId(null);
  }, [selectedIds.length]);

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  const someSelected =
    rows.some((r) => selectedIds.includes(r.id)) && !allSelected;

  const headerCheckboxRef = (node: HTMLInputElement | null) => {
    if (node) node.indeterminate = someSelected;
  };

  const onSort = (key: FileSortKey) => cycleSort(key);

  const commitRename = async (id: string) => {
    const value = renameInputRef.current?.value ?? '';
    await renameFile(id, value);
    toast.success('已重命名');
  };

  const handleRenameKey = (
    event: KeyboardEvent<HTMLInputElement>,
    id: string,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setRenamingId(null);
    }
  };

  const handleDuplicate = async (file: FileNode) => {
    const copy = await duplicateFile(file.id);
    if (copy) toast.success(`已创建副本「${copy.name}」`);
    else toast.error('创建副本失败');
  };

  return (
    <div
      className={[
        styles.wrap,
        selectedIds.length > 0 ? styles.hasSelection : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <table className={styles.table} aria-label="文件列表">
        <thead className={styles.head}>
          <tr>
            <th scope="col" className={styles.checkCol}>
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                className={styles.checkbox}
                aria-label="全选当前列表"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) clearSelection();
                  else selectAllVisible(rows.map((r) => r.id));
                }}
              />
            </th>
            {selectedIds.length > 0 ? (
              <>
                <th scope="col" className={styles.nameCol}>
                  <span className={styles.selectedLabel}>
                    已选 {selectedIds.length} 项
                  </span>
                </th>
                <th
                  scope="col"
                  colSpan={2}
                  className={styles.batchActionsCol}
                >
                  <div
                    className={styles.batchActions}
                    role="group"
                    aria-label="批量操作"
                  >
                    <Button
                      aria-label="取消多选"
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                    >
                      取消
                    </Button>
                    <Button
                      aria-label="移动到"
                      variant="ghost"
                      size="sm"
                      onClick={() => openMoveDialog(selectedIds)}
                    >
                      移动到
                    </Button>
                    <Button
                      aria-label="删除选中项"
                      variant="ghost"
                      size="sm"
                      className={styles.batchDanger}
                      onClick={() => openDeleteConfirm(selectedIds)}
                    >
                      删除
                    </Button>
                  </div>
                </th>
              </>
            ) : (
              <>
                <th scope="col" className={styles.nameCol}>
                  <button
                    type="button"
                    className={styles.sortBtn}
                    aria-label="按文件名排序"
                    onClick={() => onSort('name')}
                  >
                    文件名
                    <SortIcon
                      active={sort?.key === 'name'}
                      direction={sort?.direction}
                    />
                  </button>
                </th>
                <th scope="col" className={styles.timeCol}>
                  <button
                    type="button"
                    className={styles.sortBtn}
                    aria-label="按更新时间排序"
                    onClick={() => onSort('updatedAt')}
                  >
                    更新时间
                    <SortIcon
                      active={sort?.key === 'updatedAt'}
                      direction={sort?.direction}
                    />
                  </button>
                </th>
                <th scope="col" className={styles.timeCol}>
                  最后阅读
                </th>
              </>
            )}
            <th scope="col" className={styles.sizeCol}>
              <button
                type="button"
                className={styles.sortBtn}
                aria-label="按文件大小排序"
                onClick={() => onSort('sizeBytes')}
              >
                大小
                <SortIcon
                  active={sort?.key === 'sizeBytes'}
                  direction={sort?.direction}
                />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((file) => {
            const selected = selectedIds.includes(file.id);
            const renaming = renamingId === file.id;
            const showActions =
              selectedIds.length === 0 && hoveredId === file.id;
            return (
              <tr
                key={file.id}
                className={[
                  styles.row,
                  selected ? styles.rowSelected : '',
                  showActions ? styles.rowActionsVisible : '',
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
                <td className={styles.checkCol}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    aria-label={`选择 ${file.name}`}
                    checked={selected}
                    onChange={() => toggleSelect(file.id)}
                  />
                </td>
                <td className={styles.nameCol}>
                  {renaming ? (
                    <Input
                      ref={renameInputRef}
                      aria-label="重命名"
                      defaultValue={file.name}
                      autoFocus
                      onKeyDown={(e) => handleRenameKey(e, file.id)}
                      onBlur={() => {
                        void commitRename(file.id);
                      }}
                    />
                  ) : (
                    <div className={styles.nameStack}>
                      <button
                        type="button"
                        className={styles.nameBtn}
                        aria-label={
                          file.type === 'folder'
                            ? `打开文件夹 ${file.name}`
                            : `打开文件 ${file.name}`
                        }
                        onClick={() => onOpen(file)}
                      >
                        <FileTypeIcon type={file.type} />
                        <span className={styles.nameText}>{file.name}</span>
                      </button>
                      {file.type === 'pdf' ? (
                        <>
                          <div className={styles.graphBadgeRow}>
                            <FileGraphBadge
                              fileId={file.id}
                              visible
                              member={membersByFileId[file.id]}
                              joining={joiningIds.includes(file.id)}
                            />
                          </div>
                          <FileDocMetaCell
                            fileId={file.id}
                            fileName={file.name}
                            meta={metaById[file.id]}
                            extracting={extractingIds.includes(file.id)}
                            abstractOpen={openAbstractId === file.id}
                            onToggleAbstract={() =>
                              setOpenAbstractId((id) =>
                                id === file.id ? null : file.id,
                              )
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  )}
                </td>
                <td className={styles.timeCol}>
                  <span className={styles.timeText}>
                    {formatFriendlyTime(file.updatedAt)}
                  </span>
                </td>
                <td className={styles.timeCol}>
                  <span className={styles.timeText}>
                    {formatFriendlyTime(file.lastReadAt)}
                  </span>
                  {/* 悬停时覆盖两列时间，仅一组按钮 */}
                  <div className={styles.actionsOverlay}>
                    <FileRowActions
                      file={file}
                      onRename={(f) => setRenamingId(f.id)}
                      onDuplicate={(f) => {
                        void handleDuplicate(f);
                      }}
                      onMove={(f) => openMoveDialog([f.id])}
                      onDelete={(f) => openDeleteConfirm([f.id])}
                    />
                  </div>
                </td>
                <td className={styles.sizeCol}>
                  <span className={styles.sizeText}>
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
