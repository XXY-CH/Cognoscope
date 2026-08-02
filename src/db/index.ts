/**
 * db/index.ts - IndexedDB 数据库打开与 schema
 * 所属：本地持久化层
 * 规范参考：UI_spec.md §9 / §14 本地优先
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Annotation,
  Bookmark,
  EvidenceMatrix,
  EvidenceAnalysis,
  EvidenceRow,
  FileDocMeta,
  FileNode,
  GraphEdge,
  GraphMember,
  GraphNode,
  KeywordNode,
  ReadingSession,
  ResearchDigest,
  ResearchLead,
  ResearchSignal,
} from '../types';

/** 文件二进制内容（与 FileNode 分离，避免污染 §9 字段） */
export interface FileBlobRecord {
  id: string;
  blob: Blob;
  mimeType: string;
}

/** 图谱边持久化记录（复合 id） */
export type GraphEdgeRecord = GraphEdge & { id: string };

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
  /** 文献摘要/关键词（目录展示用，与 FileNode 分离） */
  fileDocMeta: {
    key: string;
    value: FileDocMeta;
  };
  /** 知识图谱节点 */
  graphNodes: {
    key: string;
    value: GraphNode;
  };
  /** 知识图谱边 */
  graphEdges: {
    key: string;
    value: GraphEdgeRecord;
  };
  /** 文件入图谱状态 */
  graphMembers: {
    key: string;
    value: GraphMember;
  };
  /** 关键词图谱节点（v7） */
  keywordNodes: {
    key: string;
    value: KeywordNode;
  };
  /** 关键词图谱边（v7） */
  keywordEdges: {
    key: string;
    value: GraphEdgeRecord;
  };
  /** 跨论文证据矩阵 */
  evidenceMatrices: {
    key: string;
    value: EvidenceMatrix;
    indexes: {
      'by-updated': string;
    };
  };
  /** 证据矩阵结论行 */
  evidenceRows: {
    key: string;
    value: EvidenceRow;
    indexes: {
      'by-matrix': string;
      'by-updated': string;
    };
  };
  /** 证据矩阵二次分析（v9） */
  evidenceAnalyses: {
    key: string;
    value: EvidenceAnalysis;
    indexes: {
      'by-matrix': string;
      'by-updated': string;
    };
  };
  /** 会话结束后的整理结果（v10） */
  researchDigests: {
    key: string;
    value: ResearchDigest;
    indexes: {
      'by-file': string;
      'by-session': string;
      'by-updated': string;
    };
  };
  /** 用户立场与系统观察（v10） */
  researchSignals: {
    key: string;
    value: ResearchSignal;
    indexes: {
      'by-status': string;
      'by-updated': string;
    };
  };
  /** 偏向冲突、反例与待审阅线索（v10） */
  researchLeads: {
    key: string;
    value: ResearchLead;
    indexes: {
      'by-status': string;
      'by-session': string;
      'by-updated': string;
    };
  };
}

const DB_NAME = 'xuesen';
/** v10：会话后整理、研究信号与待审阅线索 */
const DB_VERSION = 10;

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

        // —— fileDocMeta（v5）——
        if (!db.objectStoreNames.contains('fileDocMeta')) {
          db.createObjectStore('fileDocMeta', { keyPath: 'fileId' });
        }

        // —— graph（v6）——
        if (!db.objectStoreNames.contains('graphNodes')) {
          db.createObjectStore('graphNodes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('graphEdges')) {
          db.createObjectStore('graphEdges', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('graphMembers')) {
          db.createObjectStore('graphMembers', { keyPath: 'fileId' });
        }

        // —— keyword graph（v7）——
        if (!db.objectStoreNames.contains('keywordNodes')) {
          db.createObjectStore('keywordNodes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('keywordEdges')) {
          db.createObjectStore('keywordEdges', { keyPath: 'id' });
        }

        // —— evidence matrix（v8）——
        if (!db.objectStoreNames.contains('evidenceMatrices')) {
          const matrices = db.createObjectStore('evidenceMatrices', {
            keyPath: 'id',
          });
          matrices.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('evidenceRows')) {
          const rows = db.createObjectStore('evidenceRows', {
            keyPath: 'id',
          });
          rows.createIndex('by-matrix', 'matrixId');
          rows.createIndex('by-updated', 'updatedAt');
        }

        // —— evidence analysis（v9）——
        if (!db.objectStoreNames.contains('evidenceAnalyses')) {
          const analyses = db.createObjectStore('evidenceAnalyses', {
            keyPath: 'id',
          });
          analyses.createIndex('by-matrix', 'matrixId');
          analyses.createIndex('by-updated', 'updatedAt');
        }

        // —— research environment artifacts（v10）——
        if (!db.objectStoreNames.contains('researchDigests')) {
          const digests = db.createObjectStore('researchDigests', {
            keyPath: 'id',
          });
          digests.createIndex('by-file', 'fileId');
          digests.createIndex('by-session', 'sessionId');
          digests.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('researchSignals')) {
          const signals = db.createObjectStore('researchSignals', {
            keyPath: 'id',
          });
          signals.createIndex('by-status', 'status');
          signals.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('researchLeads')) {
          const leads = db.createObjectStore('researchLeads', {
            keyPath: 'id',
          });
          leads.createIndex('by-status', 'status');
          leads.createIndex('by-session', 'sessionId');
          leads.createIndex('by-updated', 'updatedAt');
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
