/**
 * FileToolbar - 注入 PageHeader 的右侧操作区
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4.2
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Button,
  IconButton,
  SearchInput,
  Select,
  Tooltip,
  toast,
} from '../../components/common';
import { useFileStore } from '../../stores/fileStore';
import { FILE_TYPE_FILTER_OPTIONS } from '../../utils/fileType';
import styles from './FileToolbar.module.css';

/**
 * FileToolbar - 无 props；读写 fileStore，由页面挂到 header 插槽
 */
export function FileToolbar() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchQuery = useFileStore((s) => s.searchQuery);
  const typeFilter = useFileStore((s) => s.typeFilter);
  const refreshing = useFileStore((s) => s.refreshing);
  const setSearchQuery = useFileStore((s) => s.setSearchQuery);
  const setTypeFilter = useFileStore((s) => s.setTypeFilter);
  const refresh = useFileStore((s) => s.refresh);
  const createFolder = useFileStore((s) => s.createFolder);
  const openImport = useFileStore((s) => s.openImport);

  // `/` 快捷键聚焦搜索框（输入中时不抢焦点）
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

  const handleCreateFolder = async () => {
    await createFolder();
    toast.success('已创建文件夹');
  };

  return (
    <div className={styles.root}>
      <SearchInput
        ref={searchRef}
        className={styles.search}
        aria-label="搜索文件名"
        placeholder="搜索文件名…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClear={() => setSearchQuery('')}
      />

      <div className={styles.typeFilter}>
        <Select
          aria-label="按类型筛选"
          value={typeFilter}
          options={FILE_TYPE_FILTER_OPTIONS}
          onChange={(e) =>
            setTypeFilter(e.target.value as typeof typeFilter)
          }
        />
      </div>

      <Tooltip content="刷新目录" aria-label="刷新目录提示" placement="bottom">
        <IconButton
          aria-label="刷新目录"
          spinning={refreshing}
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw strokeWidth={1.5} />
        </IconButton>
      </Tooltip>

      <Tooltip content="前往回收站" aria-label="前往回收站提示" placement="bottom">
        <IconButton
          aria-label="前往回收站"
          onClick={() => navigate('/trash')}
        >
          <Trash2 strokeWidth={1.5} />
        </IconButton>
      </Tooltip>

      <Tooltip content="新建文件夹" aria-label="新建文件夹提示" placement="bottom">
        <IconButton
          aria-label="新建文件夹"
          onClick={() => {
            void handleCreateFolder();
          }}
        >
          <FolderPlus strokeWidth={1.5} />
        </IconButton>
      </Tooltip>

      <Button
        aria-label="导入文件"
        variant="primary"
        size="md"
        leftIcon={<Upload size={20} strokeWidth={1.5} />}
        onClick={openImport}
      >
        导入
      </Button>
    </div>
  );
}
