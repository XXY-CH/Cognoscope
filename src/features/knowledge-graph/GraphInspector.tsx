/**
 * GraphInspector - 选中节点的证据与回读入口
 * 将图上的一条关系还原为论文、关键词和生成依据，避免只看视觉连线。
 */
import { BookOpen, FileText, GitCompareArrows, Hash, Link2, X } from 'lucide-react';
import { Badge, Button, IconButton } from '../../components/common';
import type {
  FileDocMeta,
  GraphEdge,
  GraphNode,
  KeywordEdge,
  KeywordNode,
} from '../../types';
import styles from './GraphInspector.module.css';

interface GraphInspectorProps {
  selectedPaper: GraphNode | null;
  selectedKeyword: KeywordNode | null;
  paperNodes: GraphNode[];
  paperEdges: GraphEdge[];
  keywordNodes: KeywordNode[];
  keywordEdges: KeywordEdge[];
  selectedMeta: FileDocMeta | null;
  metaLoading: boolean;
  onSelectPaper: (node: GraphNode) => void;
  onOpenPaper: (fileId: string) => void;
  onCreateComparison: (fileIds: string[]) => void;
  onClose: () => void;
}

function originLabel(origin: GraphEdge['origin']): string {
  if (origin === 'ai') return 'AI 语义';
  if (origin === 'cooccurrence') return '关键词共现';
  if (origin === 'mixed') return '共现 + AI';
  if (origin === 'manual') return '人工确认';
  return '来源未记录';
}

function originTone(
  origin: GraphEdge['origin'],
): 'accent' | 'success' | 'warning' | 'neutral' {
  if (origin === 'ai') return 'accent';
  if (origin === 'cooccurrence') return 'success';
  if (origin === 'mixed') return 'accent';
  if (origin === 'manual') return 'warning';
  return 'neutral';
}

function relationReason(
  origin: GraphEdge['origin'],
  reason: string | undefined,
): string {
  return (
    reason ||
    (origin === 'cooccurrence'
      ? '两篇论文的关键词在图谱中共同出现'
      : origin === 'ai'
        ? 'AI 根据当前图谱语料判断主题相关'
        : origin === 'mixed'
          ? '关键词共现与 AI 语义判断共同支持该关系'
        : origin === 'manual'
          ? '由用户确认的关系'
          : '该关系在早期版本中生成，来源尚未记录')
  );
}

function edgeOtherId(edge: GraphEdge | KeywordEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}

function EvidenceBadge({
  origin,
}: {
  origin: GraphEdge['origin'];
}) {
  const label = originLabel(origin);
  return (
    <Badge aria-label={`关系来源：${label}`} tone={originTone(origin)} soft>
      {label}
    </Badge>
  );
}

export function GraphInspector({
  selectedPaper,
  selectedKeyword,
  paperNodes,
  paperEdges,
  keywordNodes,
  keywordEdges,
  selectedMeta,
  metaLoading,
  onSelectPaper,
  onOpenPaper,
  onCreateComparison,
  onClose,
}: GraphInspectorProps) {
  const selectedId = selectedPaper?.id ?? selectedKeyword?.id ?? null;

  if (!selectedId) {
    return (
      <section className={styles.inspector} aria-label="节点详情">
        <div className={styles.empty}>
          <Link2 size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>选择论文或关键词，查看关联证据</span>
        </div>
      </section>
    );
  }

  if (selectedPaper) {
    const relatedPapers = paperEdges
      .filter((edge) => edge.source === selectedId || edge.target === selectedId)
      .map((edge) => ({
        edge,
        node: paperNodes.find((node) => node.id === edgeOtherId(edge, selectedId)),
      }))
      .filter((item): item is { edge: GraphEdge; node: GraphNode } => Boolean(item.node));
    const relatedKeywords = keywordNodes.filter((node) =>
      node.paperNodeIds.includes(selectedId),
    );
    const fileId = selectedPaper.fileId;
    const comparisonFileIds = [
      fileId,
      ...relatedPapers
        .sort((left, right) => right.edge.weight - left.edge.weight)
        .map(({ node }) => node.fileId),
    ].filter((id, index, ids): id is string => Boolean(id) && ids.indexOf(id) === index).slice(0, 5);

    return (
      <section className={styles.inspector} data-active="true" aria-label="论文节点详情">
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <FileText size={18} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <h3 className={styles.title}>{selectedPaper.label}</h3>
              <p className={styles.subtitle}>
                <Badge aria-label="节点类型：论文" tone="neutral" soft>
                  论文
                </Badge>
                <span>{relatedPapers.length} 条论文关系</span>
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            {fileId ? (
              <Button
                aria-label={`打开 ${selectedPaper.label}`}
                variant="secondary"
                size="sm"
                leftIcon={<BookOpen size={15} strokeWidth={1.5} />}
                onClick={() => onOpenPaper(fileId)}
              >
                打开阅读
              </Button>
            ) : null}
            <Button
              aria-label="用当前论文簇创建证据矩阵"
              title={comparisonFileIds.length < 3 ? '当前论文簇不足 3 篇论文' : undefined}
              variant="ghost"
              size="sm"
              leftIcon={<GitCompareArrows size={15} strokeWidth={1.5} />}
              disabled={comparisonFileIds.length < 3}
              onClick={() => onCreateComparison(comparisonFileIds)}
            >
              比较论文簇
            </Button>
            <IconButton
              className={styles.mobileClose}
              aria-label="关闭节点详情"
              onClick={onClose}
            >
              <X size={18} strokeWidth={1.5} />
            </IconButton>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.sectionHeading}>文献线索</div>
            {metaLoading ? (
              <p className={styles.muted}>正在读取摘要…</p>
            ) : selectedMeta?.abstract ? (
              <p className={styles.abstract}>{selectedMeta.abstract}</p>
            ) : (
              <p className={styles.muted}>暂无摘要；可回到文件目录补充文首元数据。</p>
            )}
            {relatedKeywords.length > 0 ? (
              <div className={styles.keywordRow} aria-label="关联关键词">
                {relatedKeywords.map((keyword) => (
                  <span className={styles.keyword} key={keyword.id}>
                    {keyword.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.evidence}>
            <div className={styles.sectionHeading}>论文关系依据</div>
            {relatedPapers.length === 0 ? (
              <p className={styles.muted}>暂无跨论文关系。</p>
            ) : (
              <ul className={styles.list}>
                {relatedPapers.map(({ edge, node }) => (
                  <li key={`${edge.source}-${edge.target}`} className={styles.listItem}>
                    <button
                      type="button"
                      className={styles.relationButton}
                      aria-label={`查看关联论文 ${node.label}`}
                      onClick={() => onSelectPaper(node)}
                    >
                      <span className={styles.relationTitle}>{node.label}</span>
                      <span className={styles.relationMeta}>
                        <EvidenceBadge origin={edge.origin} />
                        <span>{Math.round(edge.weight * 100)}%</span>
                      </span>
                    </button>
                    <p className={styles.reason}>
                      {relationReason(edge.origin, edge.reason)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }

  // 状态 id 与节点列表异步更新时可能短暂不一致。
  if (!selectedKeyword) return null;

  const relatedPapers = selectedKeyword.paperNodeIds
    .map((id) => paperNodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => Boolean(node));
  const relatedKeywords = keywordEdges
    .filter(
      (edge) => edge.source === selectedKeyword.id || edge.target === selectedKeyword.id,
    )
    .map((edge) => ({
      edge,
      node: keywordNodes.find(
        (node) => node.id === edgeOtherId(edge, selectedKeyword.id),
      ),
    }))
    .filter((item): item is { edge: KeywordEdge; node: KeywordNode } => Boolean(item.node));
  const comparisonFileIds = relatedPapers
    .map((paper) => paper.fileId)
    .filter((id, index, ids): id is string => Boolean(id) && ids.indexOf(id) === index)
    .slice(0, 5);

  return (
    <section className={styles.inspector} data-active="true" aria-label="关键词节点详情">
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <Hash size={18} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h3 className={styles.title}>{selectedKeyword.label}</h3>
            <p className={styles.subtitle}>
              <Badge aria-label="节点类型：关键词" tone="success" soft>
                关键词
              </Badge>
              <span>{relatedPapers.length} 篇关联论文</span>
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            aria-label="用当前关键词关联论文创建证据矩阵"
            title={comparisonFileIds.length < 3 ? '当前关键词关联论文不足 3 篇' : undefined}
            variant="ghost"
            size="sm"
            leftIcon={<GitCompareArrows size={15} strokeWidth={1.5} />}
            disabled={comparisonFileIds.length < 3}
            onClick={() => onCreateComparison(comparisonFileIds)}
          >
            比较论文簇
          </Button>
          <IconButton
            className={styles.mobileClose}
            aria-label="关闭节点详情"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.evidence}>
          <div className={styles.sectionHeading}>关联论文</div>
          {relatedPapers.length === 0 ? (
            <p className={styles.muted}>暂无可回读的论文。</p>
          ) : (
            <ul className={styles.list}>
              {relatedPapers.map((paper) => (
                <li key={paper.id} className={styles.listItem}>
                  <div className={styles.paperRow}>
                    <button
                      type="button"
                      className={styles.relationButton}
                      aria-label={`查看论文 ${paper.label}`}
                      onClick={() => onSelectPaper(paper)}
                    >
                      <span className={styles.relationTitle}>{paper.label}</span>
                    </button>
                    {paper.fileId ? (
                      <Button
                        aria-label={`打开 ${paper.label}`}
                        variant="ghost"
                        size="sm"
                        leftIcon={<BookOpen size={14} strokeWidth={1.5} />}
                        onClick={() => onOpenPaper(paper.fileId!)}
                      >
                        阅读
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.evidence}>
          <div className={styles.sectionHeading}>邻近关键词</div>
          {relatedKeywords.length === 0 ? (
            <p className={styles.muted}>暂无关键词关系。</p>
          ) : (
            <ul className={styles.list}>
              {relatedKeywords.map(({ edge, node }) => (
                <li key={`${edge.source}-${edge.target}`} className={styles.listItem}>
                  <div className={styles.relationMeta}>
                    <span className={styles.relationTitle}>{node.label}</span>
                    <EvidenceBadge origin={edge.origin} />
                    <span>{Math.round(edge.weight * 100)}%</span>
                  </div>
                  <p className={styles.reason}>
                    {relationReason(edge.origin, edge.reason)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
