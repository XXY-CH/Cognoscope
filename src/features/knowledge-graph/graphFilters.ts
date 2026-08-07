/** graphFilters - 图谱搜索、类型筛选与边裁剪的纯函数 */
import type {
  GraphEdge,
  GraphNode,
  KeywordEdge,
  KeywordNode,
  ResearchRelationOrigin,
  ResearchRelationProjection,
  ResearchRelationStatus,
  ResearchRelationType,
} from '../../types';

export type GraphKindFilter = 'all' | 'paper' | 'keyword';

export interface ResearchRelationFilter {
  relationTypes?: readonly ResearchRelationType[];
  statuses?: readonly ResearchRelationStatus[];
  origins?: readonly ResearchRelationOrigin[];
}

export interface FilteredGraphData {
  paperNodes: GraphNode[];
  paperEdges: GraphEdge[];
  keywordNodes: KeywordNode[];
  keywordEdges: KeywordEdge[];
}

/** Pure selector for relation projections; absent filters keep every relation. */
export function filterResearchRelations(
  relations: readonly ResearchRelationProjection[],
  filter: ResearchRelationFilter = {},
): ResearchRelationProjection[] {
  const relationTypes = filter.relationTypes ? new Set(filter.relationTypes) : null;
  const statuses = filter.statuses ? new Set(filter.statuses) : null;
  const origins = filter.origins ? new Set(filter.origins) : null;

  return relations.filter(
    (relation) =>
      (!relationTypes || relationTypes.has(relation.type)) &&
      (!statuses || statuses.has(relation.status)) &&
      (!origins || origins.has(relation.origin)),
  );
}

export function filterGraphData(input: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  keywordNodes: KeywordNode[];
  keywordEdges: KeywordEdge[];
  query: string;
  kind: GraphKindFilter;
}): FilteredGraphData {
  const { nodes, edges, keywordNodes, keywordEdges, kind } = input;
  const normalizedQuery = input.query.trim().toLocaleLowerCase();

  const keywordLabelsByPaper = new Map<string, string[]>();
  for (const keyword of keywordNodes) {
    for (const paperId of keyword.paperNodeIds) {
      const labels = keywordLabelsByPaper.get(paperId) ?? [];
      labels.push(keyword.label, ...keyword.aliases);
      keywordLabelsByPaper.set(paperId, labels);
    }
  }

  const paperNodes =
    kind === 'keyword'
      ? []
      : nodes.filter((node) => {
          if (!normalizedQuery) return true;
          return [node.label, ...(keywordLabelsByPaper.get(node.id) ?? [])]
            .join(' ')
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        });

  const paperLabels = new Map(nodes.map((node) => [node.id, node.label]));
  const filteredKeywordNodes =
    kind === 'paper'
      ? []
      : keywordNodes.filter((node) => {
          if (!normalizedQuery) return true;
          const paperTitles = node.paperNodeIds
            .map((id) => paperLabels.get(id) ?? '')
            .join(' ');
          return [node.label, ...node.aliases, paperTitles]
            .join(' ')
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        });

  const paperIds = new Set(paperNodes.map((node) => node.id));
  const keywordIds = new Set(filteredKeywordNodes.map((node) => node.id));

  return {
    paperNodes,
    paperEdges: edges.filter(
      (edge) => paperIds.has(edge.source) && paperIds.has(edge.target),
    ),
    keywordNodes: filteredKeywordNodes,
    keywordEdges: keywordEdges.filter(
      (edge) => keywordIds.has(edge.source) && keywordIds.has(edge.target),
    ),
  };
}
