/**
 * fileStore - 文件目录状态（浏览、搜索、筛选、多选、导入）
 * 所属：A · 文件目录
 * 规范参考：UI_spec.md §4 / §9 FileNode
 */
import { create } from 'zustand';
import * as filesDb from '../db/files';
import type { FileNode, FileType } from '../types';
import { createId } from '../utils/id';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_COUNT,
  inferFileType,
  mimeForType,
} from '../utils/fileType';
import { useFileDocMetaStore } from './fileDocMetaStore';

export type FileSortKey = 'name' | 'updatedAt' | 'sizeBytes';
export type SortDirection = 'asc' | 'desc';
export type FileTypeFilter = FileType | 'all';
export type LoadStatus = 'idle' | 'loading' | 'error';

export interface FileSortState {
  key: FileSortKey;
  direction: SortDirection;
}

export interface ImportProgressItem {
  localKey: string;
  fileName: string;
  progress: number; // 0–100
  status: 'pending' | 'importing' | 'done' | 'error' | 'cancelled';
  error?: string;
}

interface FileState {
  files: FileNode[];
  status: LoadStatus;
  errorMessage: string | null;
  currentFolderId: string | null;
  searchQuery: string;
  typeFilter: FileTypeFilter;
  sort: FileSortState | null;
  selectedIds: string[];
  renamingId: string | null;
  importOpen: boolean;
  importItems: ImportProgressItem[];
  moveDialogOpen: boolean;
  moveTargetIds: string[];
  deleteConfirmIds: string[];
  refreshing: boolean;

  loadFiles: () => Promise<void>;
  refresh: () => Promise<void>;
  setCurrentFolder: (folderId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (filter: FileTypeFilter) => void;
  cycleSort: (key: FileSortKey) => void;
  toggleSelect: (id: string) => void;
  selectAllVisible: (ids: string[]) => void;
  clearSelection: () => void;
  setRenamingId: (id: string | null) => void;
  createFolder: () => Promise<FileNode>;
  renameFile: (id: string, name: string) => Promise<void>;
  /** 同目录新建副本（文件复制 blob；文件夹为空副本） */
  duplicateFile: (id: string) => Promise<FileNode | null>;
  moveFiles: (ids: string[], targetParentId: string | null) => Promise<void>;
  softDeleteFiles: (ids: string[]) => Promise<string[]>;
  undoSoftDelete: (ids: string[]) => Promise<void>;
  /** 从回收站还原；原父级不可用时落到根目录 */
  restoreFiles: (ids: string[]) => Promise<{ restoredToRoot: boolean }>;
  /** 彻底删除（含 blob / 批注），不可撤销 */
  purgeFiles: (ids: string[]) => Promise<void>;
  /** 清空回收站 */
  emptyTrash: () => Promise<number>;
  /** 打开文件阅读时写入 lastReadAt */
  recordLastRead: (id: string) => Promise<void>;
  openImport: () => void;
  closeImport: () => void;
  importFiles: (fileList: File[]) => Promise<number>;
  cancelImportItem: (localKey: string) => void;
  openMoveDialog: (ids: string[]) => void;
  closeMoveDialog: () => void;
  openDeleteConfirm: (ids: string[]) => void;
  closeDeleteConfirm: () => void;
}

/** 构建到根的文件夹路径（用于 originalPath） */
function buildPath(
  files: FileNode[],
  parentId: string | null,
  name: string,
): string {
  const parts: string[] = [name];
  let cursor = parentId;
  while (cursor) {
    const folder = files.find((f) => f.id === cursor);
    if (!folder) break;
    parts.unshift(folder.name);
    cursor = folder.parentId;
  }
  return `/${parts.join('/')}`;
}

/**
 * 生成不冲突的副本名：「名 副本.ext」→「名 副本 2.ext」…
 */
function makeCopyName(name: string, siblingNames: string[]): string {
  const taken = new Set(siblingNames);
  const dot = name.lastIndexOf('.');
  const hasExt = dot > 0 && dot < name.length - 1;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  let candidate = `${base} 副本${ext}`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base} 副本 ${n}${ext}`;
    n += 1;
  }
  return candidate;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  status: 'idle',
  errorMessage: null,
  currentFolderId: null,
  searchQuery: '',
  typeFilter: 'all',
  sort: { key: 'name', direction: 'asc' },
  selectedIds: [],
  renamingId: null,
  importOpen: false,
  importItems: [],
  moveDialogOpen: false,
  moveTargetIds: [],
  deleteConfirmIds: [],
  refreshing: false,

  loadFiles: async () => {
    set({ status: 'loading', errorMessage: null });
    try {
      let files = await filesDb.listAllFiles();
      // §7：回收站超过 30 天自动彻底删除
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const expired = files.filter((f) => {
        if (!f.deletedAt) return false;
        const t = Date.parse(f.deletedAt);
        return Number.isFinite(t) && t < cutoff;
      });
      if (expired.length > 0) {
        await filesDb.deleteFiles(expired.map((f) => f.id));
        files = files.filter((f) => !expired.some((e) => e.id === f.id));
      }
      set({ files, status: 'idle' });
    } catch (err) {
      set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : '加载失败',
      });
    }
  },

  refresh: async () => {
    set({ refreshing: true });
    try {
      await get().loadFiles();
    } finally {
      // 保证旋转动画至少可见一帧
      window.setTimeout(() => set({ refreshing: false }), 600);
    }
  },

  setCurrentFolder: (folderId) => {
    set({ currentFolderId: folderId, selectedIds: [], searchQuery: '' });
  },

  setSearchQuery: (searchQuery) => set({ searchQuery, selectedIds: [] }),

  setTypeFilter: (typeFilter) => set({ typeFilter, selectedIds: [] }),

  cycleSort: (key) => {
    const current = get().sort;
    // 三态：升序 → 降序 → 取消
    if (!current || current.key !== key) {
      set({ sort: { key, direction: 'asc' } });
      return;
    }
    if (current.direction === 'asc') {
      set({ sort: { key, direction: 'desc' } });
      return;
    }
    set({ sort: null });
  },

  toggleSelect: (id) => {
    const selected = get().selectedIds;
    set({
      selectedIds: selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    });
  },

  selectAllVisible: (ids) => set({ selectedIds: [...ids] }),

  clearSelection: () => set({ selectedIds: [] }),

  setRenamingId: (renamingId) => set({ renamingId }),

  createFolder: async () => {
    const now = new Date().toISOString();
    const { currentFolderId, files } = get();
    const node: FileNode = {
      id: createId('folder'),
      name: '新建文件夹',
      type: 'folder',
      parentId: currentFolderId,
      sizeBytes: 0,
      updatedAt: now,
      lastReadAt: null,
      deletedAt: null,
      originalPath: buildPath(files, currentFolderId, '新建文件夹'),
    };
    await filesDb.putFile(node);
    set({
      files: [...get().files, node],
      renamingId: node.id,
    });
    return node;
  },

  renameFile: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const files = get().files;
    const target = files.find((f) => f.id === id);
    if (!target) return;
    const updated: FileNode = {
      ...target,
      name: trimmed,
      updatedAt: new Date().toISOString(),
      originalPath: buildPath(files, target.parentId, trimmed),
    };
    await filesDb.putFile(updated);
    set({
      files: files.map((f) => (f.id === id ? updated : f)),
      renamingId: null,
    });
  },

  duplicateFile: async (id) => {
    const files = get().files;
    const src = files.find((f) => f.id === id && f.deletedAt === null);
    if (!src) return null;

    const siblings = files
      .filter(
        (f) =>
          f.deletedAt === null &&
          f.parentId === src.parentId &&
          f.id !== src.id,
      )
      .map((f) => f.name);
    const now = new Date().toISOString();
    const copy: FileNode = {
      id: createId(src.type === 'folder' ? 'folder' : 'file'),
      name: makeCopyName(src.name, siblings),
      type: src.type,
      parentId: src.parentId,
      sizeBytes: src.sizeBytes,
      updatedAt: now,
      lastReadAt: null,
      deletedAt: null,
    };

    await filesDb.putFile(copy);
    // 文件需复制二进制；文件夹仅复制空节点
    if (src.type !== 'folder') {
      const blob = await filesDb.getFileBlob(src.id);
      if (blob) {
        await filesDb.putFileBlob({
          id: copy.id,
          blob: blob.blob,
          mimeType: blob.mimeType,
        });
      }
    }

    set({ files: [...get().files, copy] });
    return copy;
  },

  moveFiles: async (ids, targetParentId) => {
    // 禁止移入自身或其子孙文件夹
    const files = get().files;
    const blocked = new Set(ids);
    const isDescendant = (folderId: string | null): boolean => {
      let cursor = folderId;
      while (cursor) {
        if (blocked.has(cursor)) return true;
        cursor = files.find((f) => f.id === cursor)?.parentId ?? null;
      }
      return false;
    };
    if (targetParentId && isDescendant(targetParentId)) {
      throw new Error('不能将文件夹移动到其自身或子文件夹中');
    }

    const now = new Date().toISOString();
    const next = files.map((f) => {
      if (!ids.includes(f.id)) return f;
      return {
        ...f,
        parentId: targetParentId,
        updatedAt: now,
        // 回收站内「移动到」= 还原到新路径
        deletedAt: null,
        originalPath: undefined,
      };
    });
    await filesDb.putFiles(next.filter((f) => ids.includes(f.id)));
    set({
      files: next,
      selectedIds: [],
      moveDialogOpen: false,
      moveTargetIds: [],
    });
  },

  softDeleteFiles: async (ids) => {
    const now = new Date().toISOString();
    const files = get().files;
    // 若删除文件夹，一并软删除其子孙，避免子项成为不可见孤儿
    const toDelete = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of files) {
        if (
          f.deletedAt === null &&
          f.parentId &&
          toDelete.has(f.parentId) &&
          !toDelete.has(f.id)
        ) {
          toDelete.add(f.id);
          grew = true;
        }
      }
    }
    const idList = [...toDelete];
    const next = files.map((f) =>
      toDelete.has(f.id)
        ? {
            ...f,
            deletedAt: now,
            originalPath: buildPath(files, f.parentId, f.name),
          }
        : f,
    );
    await filesDb.putFiles(next.filter((f) => toDelete.has(f.id)));
    set({
      files: next,
      selectedIds: [],
      deleteConfirmIds: [],
    });
    return idList;
  },

  undoSoftDelete: async (ids) => {
    const files = get().files;
    const toRestore = new Set(ids);
    const next = files.map((f) =>
      toRestore.has(f.id) ? { ...f, deletedAt: null } : f,
    );
    await filesDb.putFiles(next.filter((f) => toRestore.has(f.id)));
    set({ files: next });
  },

  restoreFiles: async (ids) => {
    const files = get().files;
    const idSet = new Set(ids);
    let restoredToRoot = false;
    const next = files.map((f) => {
      if (!idSet.has(f.id) || f.deletedAt === null) return f;
      let parentId = f.parentId;
      // 原父级不存在或仍在回收站 → 还原到根（§7）
      if (parentId) {
        const parent = files.find((p) => p.id === parentId);
        if (!parent || parent.deletedAt !== null) {
          parentId = null;
          restoredToRoot = true;
        }
      }
      return {
        ...f,
        deletedAt: null,
        parentId,
        originalPath: undefined,
      };
    });
    await filesDb.putFiles(next.filter((f) => idSet.has(f.id)));
    set({ files: next, selectedIds: [] });
    return { restoredToRoot };
  },

  purgeFiles: async (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await filesDb.deleteFiles(ids);
    set({
      files: get().files.filter((f) => !idSet.has(f.id)),
      selectedIds: get().selectedIds.filter((id) => !idSet.has(id)),
    });
  },

  emptyTrash: async () => {
    const trashIds = get()
      .files.filter((f) => f.deletedAt !== null)
      .map((f) => f.id);
    await get().purgeFiles(trashIds);
    return trashIds.length;
  },

  recordLastRead: async (id) => {
    const now = new Date().toISOString();
    const files = get().files;
    const target = files.find((f) => f.id === id);
    if (!target || target.deletedAt !== null) return;
    const next: FileNode = { ...target, lastReadAt: now };
    await filesDb.putFile(next);
    set({
      files: files.map((f) => (f.id === id ? next : f)),
    });
  },

  openImport: () => set({ importOpen: true, importItems: [] }),
  closeImport: () => set({ importOpen: false, importItems: [] }),

  importFiles: async (fileList) => {
    const slice = fileList.slice(0, IMPORT_MAX_COUNT);
    const { currentFolderId, files } = get();
    const items: ImportProgressItem[] = slice.map((file, index) => ({
      localKey: `imp_${Date.now()}_${index}`,
      fileName: file.name,
      progress: 0,
      status: 'pending',
    }));
    set({ importItems: items });

    let successCount = 0;
    const created: FileNode[] = [];

    for (let i = 0; i < slice.length; i += 1) {
      const file = slice[i];
      const localKey = items[i].localKey;

      // 若用户已取消该项则跳过
      if (get().importItems.find((it) => it.localKey === localKey)?.status === 'cancelled') {
        continue;
      }

      const type = inferFileType(file.name);
      if (!type || type === 'folder') {
        set({
          importItems: get().importItems.map((it) =>
            it.localKey === localKey
              ? {
                  ...it,
                  status: 'error',
                  error: '不支持的文件类型',
                  progress: 100,
                }
              : it,
          ),
        });
        continue;
      }
      if (file.size > IMPORT_MAX_BYTES) {
        set({
          importItems: get().importItems.map((it) =>
            it.localKey === localKey
              ? {
                  ...it,
                  status: 'error',
                  error: '超过 200MB 限制',
                  progress: 100,
                }
              : it,
          ),
        });
        continue;
      }

      set({
        importItems: get().importItems.map((it) =>
          it.localKey === localKey
            ? { ...it, status: 'importing', progress: 20 }
            : it,
        ),
      });

      try {
        const now = new Date().toISOString();
        const node: FileNode = {
          id: createId('file'),
          name: file.name,
          type,
          parentId: currentFolderId,
          sizeBytes: file.size,
          updatedAt: now,
          lastReadAt: null,
          deletedAt: null,
          originalPath: buildPath(files, currentFolderId, file.name),
        };

        // 模拟分段进度，实际写入 IndexedDB
        set({
          importItems: get().importItems.map((it) =>
            it.localKey === localKey ? { ...it, progress: 60 } : it,
          ),
        });

        if (
          get().importItems.find((it) => it.localKey === localKey)?.status ===
          'cancelled'
        ) {
          continue;
        }

        await filesDb.putFile(node);
        await filesDb.putFileBlob({
          id: node.id,
          blob: file,
          mimeType: file.type || mimeForType(type),
        });

        created.push(node);
        successCount += 1;
        set({
          importItems: get().importItems.map((it) =>
            it.localKey === localKey
              ? { ...it, status: 'done', progress: 100 }
              : it,
          ),
        });
      } catch (err) {
        set({
          importItems: get().importItems.map((it) =>
            it.localKey === localKey
              ? {
                  ...it,
                  status: 'error',
                  error: err instanceof Error ? err.message : '导入失败',
                  progress: 100,
                }
              : it,
          ),
        });
      }
    }

    if (created.length) {
      set({ files: [...get().files, ...created] });
      // 导入完成后立即抽取 PDF 文首摘要/关键词（不阻塞导入返回）
      const pdfCreated = created.filter((f) => f.type === 'pdf');
      if (pdfCreated.length > 0) {
        void useFileDocMetaStore.getState().ensureForFiles(pdfCreated);
      }
    }
    return successCount;
  },

  cancelImportItem: (localKey) => {
    set({
      importItems: get().importItems.map((it) =>
        it.localKey === localKey &&
        (it.status === 'pending' || it.status === 'importing')
          ? { ...it, status: 'cancelled', progress: 100 }
          : it,
      ),
    });
  },

  openMoveDialog: (ids) =>
    set({ moveDialogOpen: true, moveTargetIds: ids }),
  closeMoveDialog: () =>
    set({ moveDialogOpen: false, moveTargetIds: [] }),
  openDeleteConfirm: (ids) => set({ deleteConfirmIds: ids }),
  closeDeleteConfirm: () => set({ deleteConfirmIds: [] }),
}));

/**
 * 从 store 派生：当前目录可见列表（未删除 + 搜索 + 类型 + 排序）
 */
export function selectVisibleFiles(state: FileState): FileNode[] {
  const q = state.searchQuery.trim().toLowerCase();
  let list = state.files.filter(
    (f) => f.deletedAt === null && f.parentId === state.currentFolderId,
  );

  if (state.typeFilter !== 'all') {
    list = list.filter((f) => f.type === state.typeFilter);
  }
  if (q) {
    list = list.filter((f) => f.name.toLowerCase().includes(q));
  }

  if (state.sort) {
    const { key, direction } = state.sort;
    const dir = direction === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      // 文件夹始终排在文件前，便于浏览
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      if (key === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN') * dir;
      }
      if (key === 'updatedAt') {
        return (a.updatedAt.localeCompare(b.updatedAt) || 0) * dir;
      }
      return (a.sizeBytes - b.sizeBytes) * dir;
    });
  } else {
    list = [...list].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  return list;
}

/**
 * 回收站列表：已删除项，按删除时间新→旧；可选外部搜索串
 */
export function selectDeletedFiles(
  state: FileState,
  searchQuery = '',
): FileNode[] {
  const q = searchQuery.trim().toLowerCase();
  let list = state.files.filter((f) => f.deletedAt !== null);
  if (q) {
    list = list.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.originalPath ?? '').toLowerCase().includes(q),
    );
  }
  return [...list].sort((a, b) =>
    (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''),
  );
}

/** 面包屑路径：从根到当前文件夹 */
/**
 * 面包屑：文件目录（根）→ 各级文件夹
 */
export function selectBreadcrumbTrail(
  state: FileState,
): { id: string | null; name: string }[] {
  const trail: { id: string | null; name: string }[] = [
    { id: null, name: '文件目录' },
  ];
  if (!state.currentFolderId) return trail;

  const chain: FileNode[] = [];
  let cursor: string | null = state.currentFolderId;
  while (cursor) {
    const folder = state.files.find((f) => f.id === cursor);
    if (!folder) break;
    chain.unshift(folder);
    cursor = folder.parentId;
  }
  for (const folder of chain) {
    trail.push({ id: folder.id, name: folder.name });
  }
  return trail;
}
