/**
 * epubToc - 将 epub.js navigation 树转换为 Reader 可展示的平面目录。
 * 目录只保存导航标题和原始 href，不把章节地址伪装成 PDF 页码。
 */
import type { NavItem } from 'epubjs';
import type { EpubTocItem } from '../types';

/**
 * 展平 EPUB navigation，同时保留层级和可由 rendition.display 消费的 href。
 * 空 href 的容器节点不输出为可见条目，但它们的 id 仍保留在 parentIds
 * 中，让 TocPanel 能区分隐藏容器下的兄弟分支。
 */
export function flattenEpubToc(
  items: readonly NavItem[],
  level = 0,
  parentPath = 'root',
  parentIds: readonly string[] = [],
): EpubTocItem[] {
  const result: EpubTocItem[] = [];

  items.forEach((item, index) => {
    const href = typeof item.href === 'string' ? item.href.trim() : '';
    const path = `${parentPath}-${index}`;
    const id = `epub-toc-${path}`;
    const title =
      (typeof item.label === 'string' ? item.label.trim() : '') || '未命名章节';
    if (href) {
      result.push({
        id,
        title,
        href,
        level,
        parentIds: [...parentIds],
      });
    }

    if (item.subitems?.length) {
      result.push(
        ...flattenEpubToc(item.subitems, level + 1, path, [
          ...parentIds,
          id,
        ]),
      );
    }
  });

  return result;
}
