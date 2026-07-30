/**
 * linesReadStore.ts - 已读行键集合（模块级，避免 Zustand 存超大 Set）
 * 所属：E · 阅读界面 > BottomBar 已读行数
 * 规范参考：UI_spec.md §8.5
 */
import { remapLinesByCharProgress } from '../utils/pdfTextLines';

/** 当前文档已读过的行键 */
const readKeys = new Set<string>();
/** 当前文档已知的全部行键（用于重排映射分母） */
const knownKeys = new Set<string>();

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function emit(): void {
  const count = readKeys.size;
  for (const fn of listeners) fn(count);
}

/**
 * 打开新文件时清空行集合
 */
export function resetLinesRead(): void {
  readKeys.clear();
  knownKeys.clear();
  emit();
}

/**
 * 登记本页/本节的行键（不立刻计为已读）
 */
export function registerLineKeys(keys: string[]): void {
  for (const k of keys) knownKeys.add(k);
}

/**
 * 将可视行标记为已读；同一行不重复计数
 */
export function markLinesRead(keys: string[]): number {
  let added = 0;
  for (const k of keys) {
    knownKeys.add(k);
    if (!readKeys.has(k)) {
      readKeys.add(k);
      added += 1;
    }
  }
  if (added > 0) emit();
  return readKeys.size;
}

/**
 * 重排后用新行键集合等比映射已读数（§8.5）
 */
export function remapAfterReflow(nextKeys: string[]): number {
  const prevRead = readKeys.size;
  const prevTotal = Math.max(knownKeys.size, prevRead);
  readKeys.clear();
  knownKeys.clear();
  for (const k of nextKeys) knownKeys.add(k);
  const mapped = remapLinesByCharProgress(
    prevRead,
    prevTotal,
    nextKeys.length,
  );
  // 按映射数量从前缀行键填充，保持单调近似
  for (let i = 0; i < mapped && i < nextKeys.length; i += 1) {
    readKeys.add(nextKeys[i]!);
  }
  emit();
  return readKeys.size;
}

export function getLinesReadCount(): number {
  return readKeys.size;
}

export function subscribeLinesRead(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
