/**
 * db/index.ts - IndexedDB 数据库打开与 schema
 * 所属：本地持久化层
 * 规范参考：UI_spec.md §9 / §14 本地优先
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Annotation, Bookmark, FileNode, ReadingSession } from '../types';

/** 文件二进制内容（与 FileNode 分离，避免污染 §9 字段） */
export interface FileBlobRecord {
  id: string;
  blob: Blob;
  mimeType: string;
}

interface XuesenDB extends DBSchema {
  files: {
    key: string;
    value: FileNode;
    indexes: {
      'by-parent': string;
      'by-deleted': string;
    };
  };
  fileBlobs: {
    key: string;
    value: FileBlobRecord;
  };
  sessions: {
    key: string;
    value: ReadingSession;
    indexes: {
      'by-started': string;
      'by-file': string;
    };
  };
  annotations: {
    key: string;
    value: Annotation;
    indexes: {
      'by-file': string;
      'by-created': string;
    };
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: {
      'by-file': string;
    };
  };
}

const DB_NAME = 'xuesen';
/** v4：新增 bookmarks */
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<XuesenDB>> | null = null;

/**
 * 获取（或初始化）数据库实例；单例避免重复 upgrade
 */
export function getDb(): Promise<IDBPDatabase<XuesenDB>> {
  if (!dbPromise) {
    dbPromise = openDB<XuesenDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // —— files ——
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'id' });
          store.createIndex('by-parent', 'parentId');
          store.createIndex('by-deleted', 'deletedAt');
        }

        // —— fileBlobs ——
        if (!db.objectStoreNames.contains('fileBlobs')) {
          db.createObjectStore('fileBlobs', { keyPath: 'id' });
        }

        // —— sessions ——
        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('by-started', 'startedAt');
          sessions.createIndex('by-file', 'fileId');
        } else if (oldVersion < 3) {
          const sessions = transaction.objectStore('sessions');
          if (!sessions.indexNames.contains('by-file')) {
            sessions.createIndex('by-file', 'fileId');
          }
        }

        // —— annotations（v3）——
        if (!db.objectStoreNames.contains('annotations')) {
          const ann = db.createObjectStore('annotations', { keyPath: 'id' });
          ann.createIndex('by-file', 'fileId');
          ann.createIndex('by-created', 'createdAt');
        }

        // —— bookmarks（v4）——
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bm = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bm.createIndex('by-file', 'fileId');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * 测试/热更新时可重置单例（正常业务勿调用）
 */
export function resetDbPromise(): void {
  dbPromise = null;
}
