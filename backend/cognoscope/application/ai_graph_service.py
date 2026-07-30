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