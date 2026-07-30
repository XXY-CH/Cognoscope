/**
 * FileDirectoryPage - 文件目录主页面
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, SearchX } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState, Skeleton } from '../../components/common';
import {
  selectBreadcrumbTrail,
  selectVisibleFiles,
  useFileStore,
} from '../../stores/fileStore';
import { usePageHeaderStore } from '../../stores/pageHeaderStore';
import type { FileNode } from '../../types';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { FileTable } from './FileTable';
import { FileToolbar } from './FileToolbar';
import { ImportDialog } from './ImportDialog';
import { MoveDialog } from './MoveDialog';
import styles from './FileDirectoryPage.module.css';

export function FileDirectoryPage() {
  const navigate = useNavigate();
  const status = useFileStore((s) => s.status);
  const searchQuery = useFileStore((s) => s.searchQuery);
  const typeFilter = useFileStore((s) => s.typeFilter);
  const files = useFileStore((s) => s.files);
  const currentFolderId = useFileStore((s) => s.currentFolderId);
  // selectVisibleFiles 每次返回新数组；useShallow 避免 getSnapshot 未缓存导致无限更新
  const visible = useFileStore(useShallow(selectVisibleFiles));
  const loadFiles = useFileStore((s) => s.loadFiles);
  const setCurrentFolder = useFileStore((s) => s.setCurrentFolder);
  const openImport = useFileStore((s) => s.openImport);
  const setBreadcrumb = usePageHeaderStore((s) => s.setBreadcrumb);
  const setActions = usePageHeaderStore((s) => s.setActions);
  const resetHeader = usePageHeaderStore((s) => s.reset);

  // 首次进入加载 IndexedDB
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // 注入 PageHeader 操作区与动态面包屑
  useEffect(() => {
    setActions(<FileToolbar />);
    return () => resetHeader();
  }, [setActions, resetHeader]);

  useEffect(() => {
    const trail = selectBreadcrumbTrail(useFileStore.getState());
    setBreadcrumb(
      <ol className="page-header__breadcrumb">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li
              key={`${item.id ?? 'root'}-${item.name}`}
              className="page-header__breadcrumb-item"
            >
              {index > 0 && (
                <span
                  className="page-header__breadcrumb-sep"
                  aria-hidden="true"
                >
                  /
                </span>
              )}
              {isLast ? (
                <span className="page-header__breadcrumb-current">
                  {item.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="page-header__breadcrumb-link"
                  aria-label={`进入 ${item.name}`}
                  onClick={() => setCurrentFolder(item.id)}
                >
                  {item.name}
                </button>
              )}
            </li>
          );
        })}
      </ol>,
    );
  }, [files, currentFolderId, setBreadcrumb, setCurrentFolder]);

  const handleOpen = (file: FileNode) => {
    if (file.type === 'folder') {
      setCurrentFolder(file.id);
      return;
    }
    // 进入独立全屏阅读路由（§8.1）
    navigate(`/read/${file.id}`);
  };

  const isSearching = searchQuery.trim().length > 0 || typeFilter !== 'all';
  // 空目录：不考虑筛选时当前文件夹是否原本为空
  const folderEmpty =
    files.filter(
      (f) => f.deletedAt === null && f.parentId === currentFolderId,
    ).length === 0;

  return (
    <div className={styles.root}>
      {status === 'loading' ? (
        <Skeleton aria-label="正在加载文件列表" variant="table" />
      ) : status === 'error' ? (
        <EmptyState
          aria-label="加载失败"
          title="加载失败"
          description="无法读取本地文件库，请刷新重试。"
          actionLabel="重试"
          actionAriaLabel="重新加载文件列表"
          onAction={() => {
            void loadFiles();
          }}
        />
      ) : visible.length === 0 && isSearching ? (
        <EmptyState
          aria-label="无匹配结果"
          icon={<SearchX strokeWidth={1.5} />}
          title="无匹配结果"
          description="尝试修改关键词或检查是否在正确目录"
        />
      ) : visible.length === 0 && folderEmpty ? (
        <EmptyState
          aria-label="暂无文件"
          icon={<FolderOpen strokeWidth={1.5} />}
          title="暂无文件"
          description="拖拽文件到此处，或点击导入"
          actionLabel="导入文件"
          actionAriaLabel="打开导入对话框"
          onAction={openImport}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          aria-label="无匹配结果"
          icon={<SearchX strokeWidth={1.5} />}
          title="无匹配结果"
          description="尝试修改关键词或检查是否在正确目录"
        />
      ) : (
        <FileTable rows={visible} onOpen={handleOpen} />
      )}

      <ImportDialog />
      <MoveDialog />
      <DeleteConfirmDialog />
    </div>
  );
}
