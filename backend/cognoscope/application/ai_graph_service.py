"""AI-powered document summarization and graph edge generation."""

from __future__ import annotations

from dataclasses import dataclass

from cognoscope.infrastructure.ai import AIClient


@dataclass(frozen=True)
class DocumentSummary:
    title: str
    summary: str
    keywords: list[str]
    main_topics: list[str]


@dataclass(frozen=True)
class EdgeSuggestion:
    source_doc_id: str
    target_doc_id: str
    weight: float
    reason: str


@dataclass(frozen=True)
class ContentNode:
    """文档内容节点（概念、实体等）"""
    label: str
    node_type: str  # concept, entity, topic
    description: str
    page_number: int | None = None


@dataclass(frozen=True)
class ContentEdge:
    """内容节点之间的关系"""
    source_label: str
    target_label: str
    relation_type: str  # relates_to, part_of, prerequisite, etc.
    weight: float


class AIGraphService:
    """AI-powered services for document analysis and graph construction."""

    def __init__(self, ai_client: AIClient) -> None:
        self._ai = ai_client

    async def summarize_document(self, text: str, max_chars: int = 5000) -> DocumentSummary:
        """Generate AI summary of document content."""
        # Truncate if too long
        content = text[:max_chars] if len(text) > max_chars else text
        
        prompt = f"""分析以下文档内容，提取关键信息。

文档内容：
{content}

请以 JSON 格式返回：
{{
  "title": "文档标题（简短概括）",
  "summary": "200字以内的摘要",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "main_topics": ["主题1", "主题2"]
}}"""

        response = await self._ai.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500,
        )
        
        data = self._ai.parse_json_response(response)
        return DocumentSummary(
            title=data.get("title", "未命名文档"),
            summary=data.get("summary", ""),
            keywords=data.get("keywords", []),
            main_topics=data.get("main_topics", []),
        )

    async def suggest_edges(
        self,
        source_id: str,
        source_summary: str,
        target_summaries: dict[str, str],
    ) -> list[EdgeSuggestion]:
        """Analyze relationships between source document and candidates."""
        if not target_summaries:
            return []
        
        candidates_text = "\n".join([
            f"ID: {doc_id}\n摘要: {summary}\n"
            for doc_id, summary in target_summaries.items()
        ])
        
        prompt = f"""分析源文档与候选文档之间的关联强度。

源文档 (ID: {source_id})：
{source_summary}

候选文档：
{candidates_text}

为每个候选文档评估与源文档的关联度（0-1），只返回关联度 >= 0.5 的。
以 JSON 数组格式返回：
[
  {{
    "target_id": "候选文档ID",
    "weight": 0.85,
    "reason": "关联原因（20字以内）"
  }}
]"""

        response = await self._ai.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=800,
        )
        
        data = self._ai.parse_json_response(response)
        suggestions = []
        
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "target_id" in item and "weight" in item:
                    suggestions.append(EdgeSuggestion(
                        source_doc_id=source_id,
                        target_doc_id=item["target_id"],
                        weight=float(item["weight"]),
                        reason=item.get("reason", ""),
                    ))
        
        return suggestions

    async def extract_content_nodes(
        self,
        document_text: str,
        max_nodes: int = 20,
    ) -> tuple[list[ContentNode], list[ContentEdge]]:
        """从文档内容中提取概念节点和关系边。
        
        Args:
            document_text: 文档文本内容
            max_nodes: 最多提取的节点数量
            
        Returns:
            (节点列表, 边列表)
        """
        # 限制文本长度，避免 token 超限
        max_chars = 8000
        text = document_text[:max_chars] if len(document_text) > max_chars else document_text
        
        prompt = f"""分析以下文档内容，提取核心概念、实体和它们之间的关系。

文档内容：
{text}

请提取不超过 {max_nodes} 个重要节点，并识别它们之间的关系。
以 JSON 格式返回：
{{
  "nodes": [
    {{
      "label": "节点名称",
      "type": "concept/entity/topic",
      "description": "简短描述（20字以内）"
    }}
  ],
  "edges": [
    {{
      "source": "源节点名称",
      "target": "目标节点名称",
      "relation": "relates_to/part_of/prerequisite/causes",
      "weight": 0.8
    }}
  ]
}}

注意：
- 节点名称要简洁（2-6个字）
- type: concept(抽象概念), entity(具体实体), topic(主题)
- relation: relates_to(相关), part_of(包含), prerequisite(前置), causes(导致)
- weight: 关系强度 0-1"""

        response = await self._ai.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2000,
        )
        
        data = self._ai.parse_json_response(response)
        
        nodes: list[ContentNode] = []
        edges: list[ContentEdge] = []
        
        # 解析节点
        if isinstance(data, dict) and "nodes" in data:
            for node_data in data["nodes"][:max_nodes]:
                if isinstance(node_data, dict) and "label" in node_data:
                    nodes.append(ContentNode(
                        label=node_data["label"],
                        node_type=node_data.get("type", "concept"),
                        description=node_data.get("description", ""),
                    ))
        
        # 解析边
        if isinstance(data, dict) and "edges" in data:
            node_labels = {n.label for n in nodes}
            for edge_data in data["edges"]:
                if isinstance(edge_data, dict) and "source" in edge_data and "target" in edge_data:
                    source = edge_data["source"]
                    target = edge_data["target"]
                    # 只保留两端节点都存在的边
                    if source in node_labels and target in node_labels:
                        edges.append(ContentEdge(
                            source_label=source,
                            target_label=target,
                            relation_type=edge_data.get("relation", "relates_to"),
                            weight=float(edge_data.get("weight", 0.5)),
                        ))
        
        return nodes, edges