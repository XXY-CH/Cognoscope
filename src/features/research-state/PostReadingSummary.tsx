/** PostReadingSummary - 在阅读边界之后展示可回读的整理结果。 */
import { ArrowRight, BookOpen, Check, ChevronDown, CircleAlert } from 'lucide-react';
import { Button } from '../../components/common';
import type { ResearchDigest } from '../../types';
import styles from './PostReadingSummary.module.css';

interface PostReadingSummaryProps {
  digest: ResearchDigest;
  fileName: string;
  pendingLeadCount: number;
  onReadSource: () => void;
  onOpenGraph: () => void;
}

function statusCopy(digest: ResearchDigest): string {
  if (digest.status === 'ready') return '整理已完成';
  if (digest.status === 'generating') return '整理进行中';
  if (digest.status === 'error') return '整理未完成';
  return '等待整理';
}

/**
 * 摘要正文只作为工作记忆展示；可引用材料仍然由证据矩阵的 verified 行提供。
 */
export function PostReadingSummary({
  digest,
  fileName,
  pendingLeadCount,
  onReadSource,
  onOpenGraph,
}: PostReadingSummaryProps) {
  const ready = digest.status === 'ready';
  return (
    <section className={styles.root} aria-labelledby="post-reading-summary-title">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>最近整理</p>
          <h2 id="post-reading-summary-title" className={styles.title}>
            {statusCopy(digest)}
          </h2>
          <p className={styles.fileName}>{fileName}</p>
        </div>
        <span className={[styles.status, ready ? styles.statusReady : styles.statusPending].join(' ')}>
          {ready ? <Check size={14} strokeWidth={1.8} /> : <CircleAlert size={14} strokeWidth={1.8} />}
          {ready ? '本地可回看' : '需要判断'}
        </span>
      </header>

      <div className={styles.metrics} aria-label="整理门槛结果">
        <div>
          <span>可直接保留</span>
          <strong>{digest.directSaveCount}</strong>
          <small>用户原始批注</small>
        </div>
        <div>
          <span>待审阅</span>
          <strong>{pendingLeadCount}</strong>
          <small>缺定位或需判断</small>
        </div>
        <div>
          <span>文字层</span>
          <strong>{digest.usedTranscript ? '已用' : '缺失'}</strong>
          <small>不影响已有批注</small>
        </div>
      </div>

      {digest.errorMessage ? (
        <p className={styles.notice} role="status">
          {digest.errorMessage}
        </p>
      ) : null}

      <p className={styles.provenanceNotice} role="note">
        这里是阅读工作记忆，不是引用材料；可引用内容仍需在证据矩阵的 verified 行中核对。
      </p>

      {digest.reviewReasons.length > 0 && pendingLeadCount > 0 ? (
        <div className={styles.reviewBlock}>
          <span className={styles.reviewLabel}>待审阅原因</span>
          <ul>
            {digest.reviewReasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {digest.structured?.parseStatus === 'structured' ? (
        <div className={styles.structured} aria-label="结构化整理栏目">
          {digest.structured.sections.map((section) => (
            <section key={section.id}>
              <h3>{section.title}</h3>
              {section.body ? <p>{section.body}</p> : null}
              {section.items.length > 0 ? (
                <ul>
                  {section.items.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}

      {digest.markdown ? (
        <details className={styles.details}>
          <summary>
            <span>展开整理正文</span>
            <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
          </summary>
          <pre tabIndex={0}>{digest.markdown}</pre>
        </details>
      ) : null}

      <footer className={styles.footer}>
        <Button
          aria-label={`回读 ${fileName}`}
          variant="secondary"
          size="sm"
          leftIcon={<BookOpen size={16} strokeWidth={1.5} />}
          onClick={onReadSource}
        >
          回读来源
        </Button>
        <Button
          aria-label="打开个人研究图谱"
          variant="ghost"
          size="sm"
          rightIcon={<ArrowRight size={16} strokeWidth={1.5} />}
          onClick={onOpenGraph}
        >
          研究图谱
        </Button>
      </footer>
    </section>
  );
}
