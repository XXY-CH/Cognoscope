/**
 * MoveDialog - 选择目标（根目录 / 回收站并列，其下为文件夹树）
 * 所属页面：A · 文件目录 / D · 回收站
 * 规范参考：UI_spec.md §4.3 移动到
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { Button, Dialog, toast } from '../../components/common';
import { useFileStore } from '../../stores/fileStore';
import type { FileNode } from '../../types';
import styles from './MoveDialog.module.css';

interface FolderRow {
  id: string;
  name: string;
  depth: number;
}

/** 目标：根目录、回收站，或具体文件夹 */
type MoveDest =
  | { kind: 'root' }
  | { kind: 'trash' }
  | { kind: 'folder'; id: string };

/**
 * 将未删除文件夹展平为深度优先列表，便于缩进展示层级
 */
function buildFolderRows(
  files: FileNode[],
  blockedIds: string[],
): FolderRow[] {
  const blocked = new Set(blockedIds);
  const isUnderBlocked = (folderId: string): boolean => {
    let cursor: string | null = folderId;
    while (cursor) {
      if (blocked.has(cursor)) return true;
      cursor = files.find((f) => f.id === cursor)?.parentId ?? null;
    }
    return false;
  };

  const folders = files.filter(
    (f) =>
      f.type === 'folder' &&
      f.deletedAt === null &&
      !blocked.has(f.id) &&
      !isUnderBlocked(f.id),
  );

  const byParent = new Map<string | null, FileNode[]>();
  for (const f of folders) {
    const key = f.parentId;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  const rows: FolderRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of byParent.get(parentId) ?? []) {
      rows.push({ id: folder.id, name: folder.name, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1); // 根下一级从 depth=1 起，比根目录多缩进一格
  return rows;
}

/**
 * MoveDialog - 根目录与回收站为同级大入口；其下文件夹缩进；移入回收站即软删除
 */
export function MoveDialog() {
  const open = useFileStore((s) => s.moveDialogOpen);
  const moveTargetIds = useFileStore((s) => s.moveTargetIds);
  const files = useFileStore((s) => s.files);
  const closeMoveDialog = useFileStore((s) => s.closeMoveDialog);
  const moveFiles = useFileStore((s) => s.moveFiles);
  const softDeleteFiles = useFileStore((s) => s.softDeleteFiles);
  const [dest, setDest] = useState<MoveDest>({ kind: 'root' });

  const folderRows = useMemo(
    () => buildFolderRows(files, moveTargetIds),
    [files, moveTargetIds],
  );

  const fromTrash = useMemo(
    () =>
      moveTargetIds.some((id) =>
        files.some((f) => f.id === id && f.deletedAt !== null),
      ),
    [files, moveTargetIds],
  );

  const handleConfirm = async () => {
    try {
      if (dest.kind === 'trash') {
        if (fromTrash) {
          toast.warning('所选项目已在回收站');
          return;
        }
        await softDeleteFiles(moveTargetIds);
        useFileStore.getState().closeMoveDialog();
        toast.success('已移入回收站');
        setDest({ kind: 'root' });
        return;
      }
      const parentId = dest.kind === 'root' ? null : dest.id;
      await moveFiles(moveTargetIds, parentId);
      toast.success(fromTrash ? '已还原到所选位置' : '已移动');
      setDest({ kind: 'root' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移动失败');
    }
  };

  const isRoot = dest.kind === 'root';
  const isTrash = dest.kind === 'trash';

  return (
    <Dialog
      open={open}
      onClose={() => {
        setDest({ kind: 'root' });
        closeMoveDialog();
      }}
      title="移动到"
      aria-label="移动到文件夹"
      size="confirm"
      footer={
        <>
          <Button
            aria-label="取消移动"
            variant="secondary"
            onClick={() => {
              setDest({ kind: 'root' });
              closeMoveDialog();
            }}
          >
            取消
          </Button>
          <Button
            aria-label="确认移动"
            variant="primary"
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isTrash ? '移入回收站' : fromTrash ? '还原到此处' : '移动'}
          </Button>
        </>
      }
    >
      <ul className={styles.list} role="listbox" aria-label="目标位置">
        {/* 根目录不缩进；其下文件夹逐级缩进；回收站置底且不缩进 */}
        <li>
          <button
            type="button"
            className={[
              styles.item,
              styles.itemTop,
              isRoot ? styles.itemActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="根目录"
            aria-selected={isRoot}
            onClick={() => setDest({ kind: 'root' })}
          >
            <FolderOpen size={18} strokeWidth={1.5} aria-hidden="true" />
            根目录
          </button>
        </li>

        {folderRows.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              className={[
                styles.item,
                dest.kind === 'folder' && dest.id === folder.id
                  ? styles.itemActive
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  '--folder-depth': String(folder.depth),
                } as CSSProperties
              }
              aria-label={folder.name}
              aria-selected={dest.kind === 'folder' && dest.id === folder.id}
              onClick={() => setDest({ kind: 'folder', id: folder.id })}
            >
              <FolderOpen size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.folderName}>{folder.name}</span>
            </button>
          </li>
        ))}

        <li>
          <button
            type="button"
            className={[
              styles.item,
              styles.itemTop,
              isTrash ? styles.itemActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="回收站"
            aria-selected={isTrash}
            onClick={() => setDest({ kind: 'trash' })}
          >
            <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
            回收站
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
