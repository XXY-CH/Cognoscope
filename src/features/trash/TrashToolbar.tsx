/**
 * TrashToolbar - 回收站操作栏（搜索 + 清空）
 * 所属页面：D · 回收站
 * 规范参考：UI_spec.md §7
 */
import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, SearchInput } from '../../components/common';
import styles from './TrashToolbar.module.css';

/**
 * TrashToolbarProps
 * @param searchQuery - 当前搜索关键字
 * @param onSearchChange - 搜索变更
 * @param trashCount - 回收站条目数（为 0 时禁用清空）
 * @param onEmpty - 点击「清空回收站」
 */
export interface TrashToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  trashCount: number;
  onEmpty: () => void;
}

export function TrashToolbar({
  searchQuery,
  onSearchChange,
  trashCount,
  onEmpty,
}: TrashToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={styles.root}>
      <SearchInput
        ref={searchRef}
        aria-label="搜索回收站"
        placeholder="搜索文件名或路径…"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange('')}
      />
      <Button
        aria-label="清空回收站"
        variant="danger"
        size="md"
        disabled={trashCount === 0}
        leftIcon={<Trash2 size={18} strokeWidth={1.5} />}
        onClick={onEmpty}
      >
        清空回收站
      </Button>
    </div>
  );
}
