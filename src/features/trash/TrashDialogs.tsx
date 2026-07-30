/**
 * TrashDialogs - 还原 / 彻底删除 / 清空回收站确认
 * 所属页面：D · 回收站
 * 规范参考：UI_spec.md §7
 */
import { Button, Dialog, toast } from '../../components/common';
import { useFileStore } from '../../stores/fileStore';
import type { FileNode } from '../../types';

/**
 * 判断是否可还原到原父级（父级存在且未删除）
 */
export function canRestoreToOriginal(
  file: FileNode,
  files: FileNode[],
): boolean {
  if (file.parentId === null) return true;
  const parent = files.find((p) => p.id === file.parentId);
  return Boolean(parent && parent.deletedAt === null);
}

/**
 * TrashRestoreDialogProps
 */
export interface TrashRestoreDialogProps {
  file: FileNode | null;
  onClose: () => void;
}

export function TrashRestoreDialog({
  file,
  onClose,
}: TrashRestoreDialogProps) {
  const files = useFileStore((s) => s.files);
  const restoreFiles = useFileStore((s) => s.restoreFiles);
  const open = file != null;
  const toOriginal = file ? canRestoreToOriginal(file, files) : true;

  const handleConfirm = async () => {
    if (!file) return;
    const { restoredToRoot } = await restoreFiles([file.id]);
    onClose();
    toast.success(
      restoredToRoot || !toOriginal
        ? `已还原「${file.name}」到根目录`
        : `已还原「${file.name}」`,
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="还原文件"
      aria-label="确认还原"
      size="confirm"
      footer={
        <>
          <Button aria-label="取消还原" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            aria-label="确认还原"
            variant="primary"
            onClick={() => {
              void handleConfirm();
            }}
          >
            还原
          </Button>
        </>
      }
    >
      {file ? (
        <p>
          {toOriginal
            ? `确定将「${file.name}」还原到原位置${
                file.originalPath ? `（${file.originalPath}）` : ''
              }？`
            : `「${file.name}」的原路径已不存在或仍在回收站中，将还原到根目录。是否继续？`}
        </p>
      ) : null}
    </Dialog>
  );
}

/**
 * TrashPurgeDialogProps - 单条或批量彻底删除
 */
export interface TrashPurgeDialogProps {
  ids: string[];
  onClose: () => void;
}

export function TrashPurgeDialog({ ids, onClose }: TrashPurgeDialogProps) {
  const purgeFiles = useFileStore((s) => s.purgeFiles);
  const files = useFileStore((s) => s.files);
  const open = ids.length > 0;
  const names = files
    .filter((f) => ids.includes(f.id))
    .map((f) => f.name)
    .slice(0, 3);

  const handleConfirm = async () => {
    const snapshot = [...ids];
    await purgeFiles(snapshot);
    onClose();
    toast.success(
      snapshot.length > 1
        ? `已彻底删除 ${snapshot.length} 项`
        : `已彻底删除「${names[0] ?? '项目'}」`,
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="彻底删除"
      aria-label="确认彻底删除"
      size="confirm"
      footer={
        <>
          <Button aria-label="取消彻底删除" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            aria-label="确认彻底删除"
            variant="danger"
            onClick={() => {
              void handleConfirm();
            }}
          >
            彻底删除
          </Button>
        </>
      }
    >
      <p>
        确定彻底删除选中的 {ids.length} 项？此操作不可恢复。
      </p>
    </Dialog>
  );
}

/**
 * TrashEmptyDialogProps
 */
export interface TrashEmptyDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TrashEmptyDialog({ open, onClose }: TrashEmptyDialogProps) {
  const emptyTrash = useFileStore((s) => s.emptyTrash);

  const handleConfirm = async () => {
    const count = await emptyTrash();
    onClose();
    toast.success(count > 0 ? `已清空回收站（${count} 项）` : '回收站已为空');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="清空回收站"
      aria-label="确认清空回收站"
      size="confirm"
      footer={
        <>
          <Button aria-label="取消清空" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            aria-label="确认清空回收站"
            variant="danger"
            onClick={() => {
              void handleConfirm();
            }}
          >
            清空
          </Button>
        </>
      }
    >
      <p>确定清空回收站中的全部项目？此操作不可恢复。</p>
    </Dialog>
  );
}
