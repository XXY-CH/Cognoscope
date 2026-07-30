/**
 * DeleteConfirmDialog - 移入回收站确认
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4.3
 */
import { Button, Dialog, toast } from '../../components/common';
import { useFileStore } from '../../stores/fileStore';

/**
 * DeleteConfirmDialog - 确认后软删除，toast 带 5s 撤销
 */
export function DeleteConfirmDialog() {
  const ids = useFileStore((s) => s.deleteConfirmIds);
  const closeDeleteConfirm = useFileStore((s) => s.closeDeleteConfirm);
  const softDeleteFiles = useFileStore((s) => s.softDeleteFiles);
  const undoSoftDelete = useFileStore((s) => s.undoSoftDelete);
  const open = ids.length > 0;

  const handleConfirm = async () => {
    const snapshot = [...ids];
    const deletedIds = await softDeleteFiles(snapshot);
    toast.withAction(
      snapshot.length > 1
        ? `已将 ${snapshot.length} 项移入回收站`
        : '已移入回收站',
      '撤销',
      () => {
        void undoSoftDelete(deletedIds);
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={closeDeleteConfirm}
      title="移入回收站"
      aria-label="确认移入回收站"
      size="confirm"
      footer={
        <>
          <Button
            aria-label="取消删除"
            variant="secondary"
            onClick={closeDeleteConfirm}
          >
            取消
          </Button>
          <Button
            aria-label="确认移入回收站"
            variant="danger"
            onClick={() => {
              void handleConfirm();
            }}
          >
            删除
          </Button>
        </>
      }
    >
      <p>
        确定将选中的 {ids.length} 项移入回收站？可在回收站中还原。
      </p>
    </Dialog>
  );
}
