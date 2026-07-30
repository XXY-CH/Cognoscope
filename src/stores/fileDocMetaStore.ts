/**
 * fileDocMetaStore - 目录页文献摘要/关键词缓存与按需抽取
 * 所属：A · 文件目录
 * 规范参考：产品需求（文首 Keywords/摘要）；数据与 FileNode 分离
 */
import { create } from 'zustand';
import * as metaDb from '../db/fileDocMeta';
import type { FileDocMeta, FileNode } from '../types';
import {
  extractPdfFrontMatter,
  FRONT_MATTER_EXTRACTOR_VERSION,
} from '../utils/pdfFrontMatter';

interface FileDocMetaState {
  /** fileId → meta */
  byId: Record<string, FileDocMeta>;
  /** 正在抽取的 fileId */
  extractingIds: string[];
  /** 拉取已有元数据并补抽缺失 PDF */
  ensureForFiles: (files: FileNode[]) => Promise<void>;
  /** 强制重抽单个 PDF */
  extractOne: (fileId: string) => Promise<void>;
  clear: () => void;
}

/** 并发抽取上限 */
const EXTRACT_CONCURRENCY = 3;

function needsExtract(meta: FileDocMeta | undefined): boolean {
  if (!meta) return true;
  if (meta.status === 'pending' || meta.status === 'error') return true;
  // 版本落后一律重抽（含 ready / empty，避免只更新到一篇）
  if ((meta.extractorVersion ?? 0) < FRONT_MATTER_EXTRACTOR_VERSION) {
    return true;
  }
  return false;
}

export const useFileDocMetaStore = create<FileDocMetaState>((set, get) => ({
  byId: {},
  extractingIds: [],

  ensureForFiles: async (files) => {
    const pdfs = files.filter((f) => f.type === 'pdf' && f.deletedAt === null);
    if (pdfs.length === 0) return;

    const ids = pdfs.map((f) => f.id);
    const existing = await metaDb.getFileDocMetas(ids);
    const map: Record<string, FileDocMeta> = { ...get().byId };
    for (const m of existing) {
      map[m.fileId] = m;
    }
    set({ byId: map });

    const missing = ids.filter((id) => needsExtract(map[id]));
    if (missing.length === 0) return;

    const queue = [...missing];
    const workers = Array.from(
      { length: Math.min(EXTRACT_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) return;
          await get().extractOne(id);
        }
      },
    );
    await Promise.all(workers);
  },

  extractOne: async (fileId) => {
    // 已在抽取中则等待其结束，避免 StrictMode 双调用直接跳过导致漏抽
    if (get().extractingIds.includes(fileId)) {
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const tick = () => {
          if (!get().extractingIds.includes(fileId) || Date.now() - start > 60000) {
            resolve();
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      });
      // 若等待后已是最新版本，则不再重复抽
      const existing = get().byId[fileId];
      if (
        existing &&
        (existing.extractorVersion ?? 0) >= FRONT_MATTER_EXTRACTOR_VERSION &&
        existing.status !== 'pending'
      ) {
        return;
      }
    }
    set({ extractingIds: [...get().extractingIds, fileId] });
    try {
      const parsed = await extractPdfFrontMatter(fileId);
      const hasKw = parsed.keywords.length > 0;
      const hasAbs = Boolean(parsed.abstract?.trim());
      const meta: FileDocMeta = {
        fileId,
        keywords: hasKw ? parsed.keywords : [],
        abstract: hasAbs ? parsed.abstract : null,
        status: hasKw || hasAbs ? 'ready' : 'empty',
        extractedAt: new Date().toISOString(),
        extractorVersion: FRONT_MATTER_EXTRACTOR_VERSION,
      };
      await metaDb.putFileDocMeta(meta);
      set({ byId: { ...get().byId, [fileId]: meta } });
    } catch {
      const meta: FileDocMeta = {
        fileId,
        keywords: [],
        abstract: null,
        status: 'error',
        extractedAt: new Date().toISOString(),
        extractorVersion: FRONT_MATTER_EXTRACTOR_VERSION,
      };
      try {
        await metaDb.putFileDocMeta(meta);
      } catch {
        // DB 未升级等情况：仍写入内存，保证 UI 至少能感知失败态
      }
      set({ byId: { ...get().byId, [fileId]: meta } });
    } finally {
      set({
        extractingIds: get().extractingIds.filter((id) => id !== fileId),
      });
    }
  },

  clear: () => set({ byId: {}, extractingIds: [] }),
}));
