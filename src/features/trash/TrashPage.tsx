/**
 * TrashPage - 回收站（列表、还原、彻底删除、清空、30 天提示）
 * 所属页面：D · 回收站
 * 规范参考：UI_spec.md §7；多选操作并入表头；与根目录并列
 */
import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState, Skeleton, toast } from '../../components/common';
import {
  selectDeletedFiles,
  useFileStore,
} from '../../stores/fileStore';
import { usePageHeaderStore } from '../../stores/pageHeaderStore';
import type { FileNode } from '../../types';
import { MoveDialog } from '../file-directory/MoveDialog';
import {
  TrashEmptyDialog,
  TrashPurgeDialog,
  TrashRestoreDialog,
} from './TrashDialogs';
import { TrashTable } from './TrashTable';
import { TrashToolbar } from './TrashToolbar';
import styles from './TrashPage.module.css';

/**
 * TrashPage - 注入 toolbar；扁平列表不可进入子文件夹
 */
export function TrashPage() {
  const status = useFileStore((s) => s.status);
  const files = useFileStore((s) => s.files);
  const selectedIds = useFileStore((s) => s.selectedIds);
  const loadFiles = useFileStore((s) => s.loadFiles);
  const toggleSelect = useFileStore((s) => s.toggleSelect);
  const selectAllVisible = useFileStore((s) => s.selectAllVisible);
  const clearSelection = useFileStore((s) => s.clearSelection);
  const openMoveDialog = useFileStore((s) => s.openMoveDialog);
  const restoreFiles = useFileStore((s) => s.restoreFiles);
  const setActions = usePageHeaderStore((s) => s.setActions);
  const resetHeader = usePageHeaderStore((s) => s.reset);

  const [searchQuery, setSearchQuery] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<FileNode | null>(null);
  const [purgeIds, setPurgeIds] = useState<string[]>([]);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const trashRows = useFileStore(
    useShallow((s) => selectDeletedFiles(s, searchQuery)),
  );
  const trashTotal = useMemo(
    () => files.filter((f) => f.deletedAt !== null).length,
    [files],
  );

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setActions(
      <TrashToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        trashCount={trashTotal}
        onEmpty={() => setEmptyOpen(true)}
      />,
    );
    return () => resetHeader();
  }, [setActions, resetHeader, searchQuery, trashTotal]);

  // 离开页时清多选，避免污染文件目录
  useEffect(() => () => clearSelection(), [clearSelection]);

  const handleBatchRestore = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (ids.length === 1) {
      const file = trashRows.find((f) => f.id === ids[0]);
      if (file) setRestoreTarget(file);
      return;
    }
    const { restoredToRoot } = await restoreFiles(ids);
    toast.success(
      restoredToRoot
        ? `已恢复 ${ids.length} 项（部分到根目录）`
        : `已恢复 ${ids.length} 项`,
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.banner} role="note">
        自动清理说明：30 天后将自动永久删除
      </div>

      {status === 'loading' ? (
        <Skeleton aria-label="加载回收站" variant="table" />
      ) : trashTotal === 0 ? (
        <EmptyState
          aria-label="回收站为空"
          icon={<Trash2 strokeWidth={1.5} />}
          title="回收站为空"
          description="删除的文件会出现在这里，可还原或彻底删除。"
        />
      ) : trashRows.length === 0 ? (
        <EmptyState
          aria-label="无搜索结果"
          icon={<Trash2 strokeWidth={1.5} />}
          title="无匹配项"
          description="试试其他关键词。"
        />
      ) : (
        <TrashTable
          rows={trashRows}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAllVisible}
          onClearSelection={clearSelection}
          onRestore={setRestoreTarget}
          onMove={(file) => openMoveDialog([file.id])}
          onPurge={(file) => setPurgeIds([file.id])}
          onBatchMove={() => openMoveDialog([...selectedIds])}
          onBatchRestore={() => {
            void handleBatchRestore();
          }}
          onBatchPurge={() => setPurgeIds([...selectedIds])}
        />
      )}

      <TrashRestoreDialog
        file={restoreTarget}
        onClose={() => setRestoreTarget(null)}
      />
      <TrashPurgeDialog ids={purgeIds} onClose={() => setPurgeIds([])} />
      <TrashEmptyDialog open={emptyOpen} onClose={() => setEmptyOpen(false)} />
      <MoveDialog />
    </div>
  );
}
