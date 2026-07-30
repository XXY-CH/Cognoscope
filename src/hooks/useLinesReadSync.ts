/**
 * useLinesReadSync - 将模块级已读行数同步到 readerStore
 * 所属：E · 阅读界面
 * 规范参考：UI_spec.md §8.5
 */
import { useEffect } from 'react';
import { useReaderStore } from '../stores/readerStore';
import {
  getLinesReadCount,
  resetLinesRead,
  subscribeLinesRead,
} from '../utils/linesReadStore';

/**
 * 打开文件时重置行统计；订阅模块集合变化写入 readerStore.linesRead
 */
export function useLinesReadSync(fileId: string | null): void {
  const setLinesRead = useReaderStore((s) => s.setLinesRead);

  useEffect(() => {
    resetLinesRead();
    setLinesRead(0);
    if (!fileId) return;
    return subscribeLinesRead((count) => {
      setLinesRead(count);
    });
  }, [fileId, setLinesRead]);

  // 挂载时对齐一次（避免订阅前丢失）
  useEffect(() => {
    setLinesRead(getLinesReadCount());
  }, [setLinesRead]);
}
