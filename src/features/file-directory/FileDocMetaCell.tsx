/**
 * FileDocMetaCell - 文件名下方关键词标签 + 摘要下拉
 * 所属页面：A · 文件目录 > FileTable
 * 数据来自 fileDocMetaStore（PDF 文首抽取）
 */
import { ChevronDown } from 'lucide-react';
import { Tag } from '../../components/common';
import type { FileDocMeta } from '../../types';
import styles from './FileDocMetaCell.module.css';

interface FileDocMetaCellProps {
  fileId: string;
  fileName: string;
  meta: FileDocMeta | undefined;
  extracting: boolean;
  abstractOpen: boolean;
  onToggleAbstract: () => void;
}

/**
 * FileDocMetaCell - 仅在有关键词或摘要时渲染附加区
 */
export function FileDocMetaCell({
  fileId,
  fileName,
  meta,
  extracting,
  abstractOpen,
  onToggleAbstract,
}: FileDocMetaCellProps) {
  const keywords = meta?.keywords ?? [];
  const abstract = meta?.abstract?.trim() || null;
  const showKeywords = keywords.length > 0;
  const showAbstract = Boolean(abstract);
  const abstractDomId = `file-abstract-${fileId}`;

  if (!showKeywords && !showAbstract && !extracting) {
    return null;
  }

  return (
    <div className={styles.root}>
      {extracting && !meta ? (
        <p className={styles.hint} role="status">
          正在提取摘要…
        </p>
      ) : null}

      {showKeywords ? (
        <ul className={styles.tags} aria-label={`${fileName} 关键词`}>
          {keywords.map((kw) => (
            <li key={kw} className={styles.tagItem}>
              <Tag aria-label={`关键词 ${kw}`} tone="accent">
                {kw}
              </Tag>
            </li>
          ))}
        </ul>
      ) : null}

      {showAbstract ? (
        <div className={styles.abstractBlock}>
          <button
            type="button"
            className={styles.abstractToggle}
            aria-expanded={abstractOpen}
            aria-controls={abstractDomId}
            aria-label={abstractOpen ? '收起摘要' : '展开摘要'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAbstract();
            }}
          >
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              className={abstractOpen ? styles.chevronOpen : styles.chevron}
              aria-hidden="true"
            />
            摘要
          </button>
          {abstractOpen ? (
            <p
              id={abstractDomId}
              className={styles.abstractBody}
              role="region"
              aria-label={`${fileName} 摘要`}
            >
              {abstract}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
