/** ResearchLeadReview - 当前研究状态中的待审阅线索队列。 */
import { ArrowRight, Check, CircleX, ExternalLink } from 'lucide-react';
import { Button } from '../../components/common';
import type { ResearchLead } from '../../types';
import styles from './ResearchLeadReview.module.css';

interface ResearchLeadReviewProps {
  leads: ResearchLead[];
  onAccept: (leadId: string) => void;
  onDismiss: (leadId: string) => void;
  onReadSource: (lead: ResearchLead) => void;
}

export function ResearchLeadReview({
  leads,
  onAccept,
  onDismiss,
  onReadSource,
}: ResearchLeadReviewProps) {
  if (leads.length === 0) return null;
  return (
    <section className={styles.root} aria-labelledby="research-leads-title">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>研究判断</p>
          <h2 id="research-leads-title" className={styles.title}>
            待审阅线索
          </h2>
        </div>
        <span className={styles.count}>{leads.length}</span>
      </header>
      <div className={styles.list}>
        {leads.map((lead) => (
          <article className={styles.item} key={lead.id}>
            <div className={styles.itemCopy}>
              <h3>{lead.title}</h3>
              <p>{lead.explanation}</p>
              <ul>
                {lead.reasons.slice(0, 2).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div className={styles.actions}>
              <Button
                aria-label={`接受 ${lead.title}`}
                variant="secondary"
                size="sm"
                leftIcon={<Check size={15} strokeWidth={1.6} />}
                onClick={() => onAccept(lead.id)}
              >
                接受线索
              </Button>
              <Button
                aria-label={`忽略 ${lead.title}`}
                variant="ghost"
                size="sm"
                leftIcon={<CircleX size={15} strokeWidth={1.6} />}
                onClick={() => onDismiss(lead.id)}
              >
                忽略
              </Button>
              <Button
                aria-label={`回读 ${lead.title}`}
                variant="ghost"
                size="sm"
                rightIcon={<ExternalLink size={15} strokeWidth={1.6} />}
                onClick={() => onReadSource(lead)}
              >
                回读来源
              </Button>
            </div>
          </article>
        ))}
      </div>
      <ArrowRight className={styles.trailing} size={18} strokeWidth={1.5} aria-hidden="true" />
    </section>
  );
}
