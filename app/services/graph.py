from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from app.models import KnowledgeEdge, KnowledgeNode, Paper, db


def _items(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _node_key(kind: str, label: str) -> tuple[str, str]:
    return kind, label.strip().casefold()


def persist_analysis_graph(paper: Paper, analysis: dict[str, Any]) -> None:
    """Persist LLM proposals as reviewable, evidence-bearing graph projections."""
    nodes: dict[tuple[str, str], KnowledgeNode] = {}
    for kind, items in (
        ("theme", _items(analysis.get("themes"))),
        ("claim", _items(analysis.get("claims"))),
    ):
        for item in items:
            label = str(item.get("name") or item.get("label") or "").strip()
            if not label:
                continue
            key = _node_key(kind, label)
            node = KnowledgeNode(
                paper_id=paper.id,
                kind=kind,
                label=label,
                summary=str(item.get("summary") or ""),
                evidence_json=json.dumps(
                    {"quote": str(item.get("quote") or ""), "source": "llm"},
                    ensure_ascii=False,
                ),
                confidence=max(0.0, min(1.0, float(item.get("confidence") or 0.0))),
                review_status="pending",
            )
            db.session.add(node)
            nodes[key] = node

    db.session.flush()
    for relation in _items(analysis.get("relations")):
        source = str(relation.get("source") or "").strip()
        target = str(relation.get("target") or "").strip()
        source_node = next((n for (kind, label), n in nodes.items() if label == source.casefold()), None)
        target_node = next((n for (kind, label), n in nodes.items() if label == target.casefold()), None)
        if not source_node or not target_node:
            continue
        db.session.add(
            KnowledgeEdge(
                source_id=source_node.id,
                target_id=target_node.id,
                relation=str(relation.get("relation") or "related"),
                weight=max(0.0, min(1.0, float(relation.get("confidence") or 0.0))),
                evidence_json=json.dumps(
                    {"quote": str(relation.get("evidence") or ""), "source": "llm"},
                    ensure_ascii=False,
                ),
                review_status="pending",
            )
        )
    db.session.commit()


def graph_for_paper(paper_id: int) -> dict[str, list[dict]]:
    nodes = KnowledgeNode.query.filter_by(paper_id=paper_id).all()
    node_ids = {node.id for node in nodes}
    edges = KnowledgeEdge.query.filter(
        KnowledgeEdge.source_id.in_(node_ids or {-1}),
        KnowledgeEdge.target_id.in_(node_ids or {-1}),
    ).all()
    return {"nodes": [node.to_dict() for node in nodes], "edges": [edge.to_dict() for edge in edges]
