/**
 * fileType.ts - 扩展名 ↔ FileType / MIME 推断
 * 所属：文件目录导入
 */
import type { FileType } from '../types';

const EXT_MAP: Record<string, FileType> = {
  pdf: 'pdf',
  epub: 'epub',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
};

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  md: 'text/markdown',
  txt: 'text/plain',
};

/** 单次最多导入数量 */
export const IMPORT_MAX_COUNT = 20;
/** 单文件最大字节数 200MB */
export const IMPORT_MAX_BYTES = 200 * 1024 * 1024;

/**
 * 从文件名推断类型；无法识别返回 null
 */
export function inferFileType(fileName: string): FileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? null;
}

export function mimeForType(type: FileType): string {
  if (type === 'folder') return '';
  return MIME_MAP[type] ?? 'application/octet-stream';
}

/** 类型筛选下拉选项文案 */
export const FILE_TYPE_FILTER_OPTIONS: {
  value: FileType | 'all';
  label: string;
}[] = [
  { value: 'all', label: '全部类型' },
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
  { value: 'md', label: 'Markdown' },
  { value: 'txt', label: 'TXT' },
  { value: 'folder', label: '文件夹' },
];
