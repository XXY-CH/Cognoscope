/**
 * DigestDialog - 整理习得结果浮层
 * 所属页面：E · 阅读界面 > SidePanel
 * 规范参考：UI_spec.md §8.9
 */
import { Copy, Download } from 'lucide-react';
import { Button, Dialog, toast } from '../../components/common';
import { downloadDigestMarkdown } from '../../utils/runDigest';
import styles from './DigestDialog.module.css';

interface DigestDialogProps {
  open: boolean;
  fileName: string;
  markdown: string;
  onClose: () => void;
}

/**
 * DigestDialog - 展示 AI 返回的 Markdown；支持复制与导出
 */
export function DigestDialog({
  open,
  fileName,
  markdown,
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
      <pre className={styles.markdown} tabIndex={0}>
        {markdown}
      </pre>
    </Dialog>
  );
}
