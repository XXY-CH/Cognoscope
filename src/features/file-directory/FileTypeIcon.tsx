/**
 * FileTypeIcon - 按文件类型显示图标
 * 所属页面：A · 文件目录
 * 规范参考：UI_spec.md §4.3
 */
import { FileText, FolderOpen, BookOpen } from 'lucide-react';
import type { FileType } from '../../types';
import styles from './FileTypeIcon.module.css';

/**
 * FileTypeIconProps
 * @param type - 文件类型
 */
export interface FileTypeIconProps {
  type: FileType;
}

export function FileTypeIcon({ type }: FileTypeIconProps) {
  if (type === 'folder') {
    return (
      <FolderOpen
        className={styles.folder}
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    );
  }
  if (type === 'epub') {
    return <BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />;
  }
  return <FileText size={16} strokeWidth={1.5} aria-hidden="true" />;
}
