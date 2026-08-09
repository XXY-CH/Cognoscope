/**
 * DigestDialog - 整理习得结果浮层
 * 所属页面：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.9
 */
import { Copy, Download } from 'lucide-react';
import { Button, Dialog, FormattedMessage, toast } from '../../components/common';
import type { ResearchDigestStructure } from '../../types';
import { downloadDigestMarkdown } from '../../utils/runDigest';
import styles from './DigestDialog.module.css';

interface DigestDialogProps {
  open: boolean;
  fileName: string;
  markdown: string;
  structured?: ResearchDigestStructure | null;
  onClose: () => void;
}

/**
 * DigestDialog - 展示 AI 返回的 Markdown；支持复制与导出
 */
export function DigestDialog({
  open,
  fileName,
  markdown,
  structured = null,
  onClose,
}: DigestDialogProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="整理习得"
      aria-label="整理习得结果"
      size="digest"
      footer={
        <>
          <Button
            aria-label="复制全文"
            variant="secondary"
            leftIcon={<Copy size={16} strokeWidth={1.5} />}
            onClick={() => void handleCopy()}
          >
            复制
          </Button>
          <Button
            aria-label="导出 Markdown"
            variant="primary"
            leftIcon={<Download size={16} strokeWidth={1.5} />}
            onClick={() => downloadDigestMarkdown(fileName, markdown)}
          >
            导出 .md
          </Button>
        </>
      }
    >
      <p className={styles.provenanceNotice} role="note">
        这是阅读工作记忆，不是引用材料；可引用内容仍需在证据矩阵的 verified 行中核对。
      </p>
      {structured?.parseStatus === 'structured' ? (
        <div className={styles.sections} aria-label="结构化整理栏目">
          {structured.sections.map((section) => (
            <section key={section.id} className={styles.section}>
              <h3>{section.title}</h3>
              {section.body ? <p>{section.body}</p> : null}
              {section.items.length > 0 ? (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
          <details className={styles.exportSource}>
            <summary>查看 Markdown 导出正文</summary>
            <pre className={styles.markdown} tabIndex={0}>
              {markdown}
            </pre>
          </details>
        </div>
      ) : (
        <FormattedMessage
          className={styles.formatted}
          content={markdown}
        />
      )}
    </Dialog>
  );
}
