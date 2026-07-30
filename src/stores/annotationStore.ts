/**
 * annotationStore - 当前文件批注列表（IndexedDB 持久化）
 * 所属：E · 阅读界面 > AnnotationPanel
 * 规范参考：UI_spec.md §8.6 / §9 / §14
 */
import { create } from 'zustand';
import * as annotationsDb from '../db/annotations';
import type { Annotation, AnnotationColor } from '../types';
import { createId } from '../utils/id';

type LoadStatus = 'idle' | 'loading' | 'error';

interface AnnotationState {
  fileId: string | null;
  items: Annotation[];
  status: LoadStatus;
  loadForFile: (fileId: string) => Promise<void>;
  clear: () => void;
  /** 添加无引用的全文批注 */
  addBlank: (fileId: string, page?: number) => Promise<Annotation>;
  /** 划词高亮 / 批注：带引用文字 */
  addFromSelection: (input: {
    fileId: string;
    page: number;
    quotedText: string;
    color: AnnotationColor;
    body?: string;
    anchor?: string;
  }) => Promise<Annotation>;
  updateBody: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  fileId: null,
  items: [],
  status: 'idle',

  loadForFile: async (fileId) => {
    set({ status: 'loading', fileId });
    try {
      const items = await annotationsDb.listAnnotationsByFile(fileId);
      // 若期间已切换文件，丢弃过期结果
      if (get().fileId !== fileId) return;
      set({ items, status: 'idle' });
    } catch {
      if (get().fileId !== fileId) return;
      set({ items: [], status: 'error' });
    }
  },

  clear: () => set({ fileId: null, items: [], status: 'idle' }),

  addBlank: async (fileId, page = 1) => {
    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: createId('ann'),
      fileId,
      page,
      anchor: '',
      quotedText: null,
      body: '',
      color: 'yellow' satisfies AnnotationColor,
      createdAt: now,
      updatedAt: now,
    };
    await annotationsDb.putAnnotation(annotation);
    // 仅当仍在该文件上下文时追加到列表
    if (get().fileId === fileId) {
      set({ items: [...get().items, annotation] });
    }
    return annotation;
  },

  addFromSelection: async ({
    fileId,
    page,
    quotedText,
    color,
    body = '',
    anchor = '',
  }) => {
    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: createId('ann'),
      fileId,
      page,
      anchor,
      quotedText,
      body,
      color,
      createdAt: now,
      updatedAt: now,
    };
    await annotationsDb.putAnnotation(annotation);
    if (get().fileId === fileId) {
      set({ items: [...get().items, annotation] });
    }
    return annotation;
  },

  updateBody: async (id, body) => {
    const prev = get().items.find((a) => a.id === id);
    if (!prev) return;
    const next: Annotation = {
      ...prev,
      body,
      updatedAt: new Date().toISOString(),
    };
    await annotationsDb.putAnnotation(next);
    set({
      items: get().items.map((a) => (a.id === id ? next : a)),
    });
  },

  remove: async (id) => {
    await annotationsDb.deleteAnnotation(id);
    set({ items: get().items.filter((a) => a.id !== id) });
  },
}));
