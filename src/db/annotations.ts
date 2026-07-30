/**
 * db/annotations.ts - 划词批注 CRUD
 * 所属：E · 阅读界面 > AnnotationPanel
 * 规范参考：UI_spec.md §9 Annotation / §8.6 / §14
 */
import type { Annotation } from '../types';
import { getDb } from './index';

/**
 * 按文档位置排序（页码 → 锚点字符串 → 创建时间）
 */
function sortByDocumentOrder(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const anchorCmp = a.anchor.localeCompare(b.anchor);
    if (anchorCmp !== 0) return anchorCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * 列出某文件的全部批注（默认按文档位置）
 */
export async function listAnnotationsByFile(
  fileId: string,
): Promise<Annotation[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('annotations', 'by-file', fileId);
  return sortByDocumentOrder(list);
}

/**
 * 列出全部批注（管理/导出用）
 */
export async function listAllAnnotations(): Promise<Annotation[]> {
  const db = await getDb();
  return db.getAll('annotations');
}

/**
 * 读取单条
 */
export async function getAnnotation(
  id: string,
): Promise<Annotation | undefined> {
  const db = await getDb();
  return db.get('annotations', id);
}

/**
 * 写入或更新
 */
export async function putAnnotation(annotation: Annotation): Promise<void> {
  const db = await getDb();
  await db.put('annotations', annotation);
}

/**
 * 批量写入
 */
export async function putAnnotations(
  annotations: Annotation[],
): Promise<void> {
  if (annotations.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('annotations', 'readwrite');
  await Promise.all(annotations.map((a) => tx.store.put(a)));
  await tx.done;
}

/**
 * 删除单条
 */
export async function deleteAnnotation(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('annotations', id);
}

/**
 * 删除某文件下全部批注（文件彻底删除时调用）
 */
export async function deleteAnnotationsByFile(fileId: string): Promise<void> {
  const db = await getDb();
  const list = await db.getAllFromIndex('annotations', 'by-file', fileId);
  if (list.length === 0) return;
  const tx = db.transaction('annotations', 'readwrite');
  await Promise.all(list.map((a) => tx.store.delete(a.id)));
  await tx.done;
}

/**
 * 统计某文件批注数
 */
export async function countAnnotationsByFile(fileId: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('annotations', 'by-file', fileId);
}
