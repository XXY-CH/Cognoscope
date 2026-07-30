/**
 * bookmarkStore - 当前文件书签列表
 * 所属：E · 阅读界面 > TocPanel
 * 规范参考：UI_spec.md §8.4
 */
import { create } from 'zustand';
import * as bookmarksDb from '../db/bookmarks';
import type { AnnotationColor, Bookmark } from '../types';
import { createId } from '../utils/id';

const COLORS: AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];

/** 兼容旧书签：补齐 color / quotedText */
function normalize(
  raw: Bookmark & { color?: AnnotationColor; quotedText?: string | null },
): Bookmark {
  const color = raw.color && COLORS.includes(raw.color) ? raw.color : 'blue';
  return {
    ...raw,
    color,
    quotedText: raw.quotedText ?? null,
  };
}

interface BookmarkState {
  fileId: string | null;
  items: Bookmark[];
  loadForFile: (fileId: string) => Promise<void>;
  clear: () => void;
  add: (input: {
    fileId: string;
    page: number;
    label: string;
    color?: AnnotationColor;
    quotedText?: string | null;
  }) => Promise<Bookmark>;
  rename: (id: string, label: string) => Promise<void>;
  setColor: (id: string, color: AnnotationColor) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  fileId: null,
  items: [],

  loadForFile: async (fileId) => {
    set({ fileId });
    try {
      const items = (await bookmarksDb.listBookmarksByFile(fileId)).map(
        normalize,
      );
      if (get().fileId !== fileId) return;
      set({ items });
    } catch {
      if (get().fileId !== fileId) return;
      set({ items: [] });
    }
  },

  clear: () => set({ fileId: null, items: [] }),

  add: async ({ fileId, page, label, color = 'blue', quotedText = null }) => {
    const bookmark: Bookmark = {
      id: createId('bm'),
      fileId,
      page,
      label,
      color,
      quotedText,
      createdAt: new Date().toISOString(),
    };
    await bookmarksDb.putBookmark(bookmark);
    if (get().fileId === fileId) {
      set({
        items: [...get().items, bookmark].sort(
          (a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt),
        ),
      });
    }
    return bookmark;
  },

  rename: async (id, label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const prev = get().items.find((b) => b.id === id);
    if (!prev || prev.label === trimmed) return;
    const next: Bookmark = { ...prev, label: trimmed };
    await bookmarksDb.putBookmark(next);
    set({
      items: get().items.map((b) => (b.id === id ? next : b)),
    });
  },

  setColor: async (id, color) => {
    const prev = get().items.find((b) => b.id === id);
    if (!prev || prev.color === color) return;
    const next: Bookmark = { ...prev, color };
    await bookmarksDb.putBookmark(next);
    set({
      items: get().items.map((b) => (b.id === id ? next : b)),
    });
  },

  remove: async (id) => {
    await bookmarksDb.deleteBookmark(id);
    set({ items: get().items.filter((b) => b.id !== id) });
  },
}));
