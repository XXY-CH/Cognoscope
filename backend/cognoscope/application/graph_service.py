"""Graph construction service: node sync and AI-driven edge generation."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cognoscope.infrastructure.ai import AIClient
from cognoscope.infrastructure.models import GraphEdge, GraphNode, LibraryDocument, DocumentRevision, new_id


@dataclass(frozen=True)
class NodeView:
    node_id: str
    label: str
    kind: str
    file_id: str | None
    file_type: str | None
    x: float | None
    y: float | None


@dataclass(frozen=True)
class EdgeView:
    source: str
    target: str
    weight: float


class GraphService:
    """Synchronize nodes from documents and generate edges via AI."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        ai_client: AIClient | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._ai = ai_client

    async def sync_nodes_from_documents(self, *, owner_account_id: str) -> int:
        """Create/update graph nodes from library documents; returns sync count."""
        async with self._session_factory() as session, session.begin():
            # Get latest document revisions
            latest_docs = (
                await session.execute(
                    select(LibraryDocument.id, DocumentRevision.title)
                    .join(DocumentRevision, LibraryDocument.id == DocumentRevision.document_id)
                    .order_by(LibraryDocument.id, DocumentRevision.revision.desc())
                    .distinct(LibraryDocument.id)
                )
            ).all()

            synced = 0
            for doc_id, title in latest_docs:
                node_id = f"doc:{doc_id}"
                existing = await session.scalar(
                    select(GraphNode).where(
                        GraphNode.owner_account_id == owner_account_id,
                        GraphNode.node_id == node_id,
                    )
                )
                if existing is None:
                    session.add(
                        GraphNode(
                            id=new_id(),
                            owner_account_id=owner_account_id,
                            node_id=node_id,
                            label=title,
                            kind="file",
                            file_id=doc_id,
                            file_type="pdf",
                        )
                    )
                    synced += 1
                elif existing.label != title:
                    existing.label = title
                    synced += 1
            return synced

    async def list_nodes(self, *, owner_account_id: str) -> list[NodeView]:
        """List all graph nodes for owner."""
        async with self._session_factory() as session:
            rows = (
                await session.scalars(
                    select(GraphNode)
                    .where(GraphNode.owner_account_id == owner_account_id)
                    .order_by(GraphNode.created_at)
                )
            ).all()
            return [
                NodeView(
                    node_id=row.node_id,
                    label=row.label,
                    kind=row.kind,
                    file_id=row.file_id,
                    file_type=row.file_type,
                    x=row.x,
                    y=row.y,
                )
                for row in rows
            ]

    async def list_edges(self, *, owner_account_id: str) -> list[EdgeView]:
        """List all graph edges for owner."""
        async with self._session_factory() as session:
            rows = (
                await session.scalars(
                    select(GraphEdge)
                    .where(GraphEdge.owner_account_id == owner_account_id)
                    .order_by(GraphEdge.created_at)
                )
            ).all()
            return [
                EdgeView(source=row.source_node_id, target=row.target_node_id, weight=row.weight)
                for row in rows
            ]

    async def generate_demo_edges(self, *, owner_account_id: str) -> int:
        """Generate demo edges between first N nodes (placeholder for AI logic)."""
        nodes = await self.list_nodes(owner_account_id=owner_account_id)
        if len(nodes) < 2:
            return 0

        async with self._session_factory() as session, session.begin():
            created = 0
            for i in range(min(3, len(nodes) - 1)):
                source, target = nodes[i].node_id, nodes[i + 1].node_id
                existing = await session.scalar(
                    select(GraphEdge).where(
                        GraphEdge.owner_account_id == owner_account_id,
                        GraphEdge.source_node_id == source,
                        GraphEdge.target_node_id == target,
                    )
                )
                if existing is None:
                    session.add(
                        GraphEdge(
                            id=new_id(),
                            owner_account_id=owner_account_id,
                            source_node_id=source,
                            target_node_id=target,
                            weight=0.6,
                            producer_kind="agent",
                        )
                    )
                    created += 1
            return created

    async def build_graph_with_ai(self, *, owner_account_id: str) -> dict[str, int]:
        """Use AI to analyze documents and generate knowledge edges."""
        if self._ai is None:
            raise ValueError("AI client not configured (missing LLM_API_KEY)")
        
        from cognoscope.application.ai_graph_service import AIGraphService
        
        ai_service = AIGraphService(self._ai)
        nodes = await self.list_nodes(owner_account_id=owner_account_id)
        
        # Only process file nodes with actual content
        doc_nodes = [n for n in nodes if n.kind == "file"]
        if len(doc_nodes) < 2:
            return {"created": 0, "analyzed": len(doc_nodes)}
        
        # For demo: use node labels as summaries (in production, fetch from ExtractionRun)
        summaries = {n.node_id: n.label for n in doc_nodes}
        
        created_total = 0
        async with self._session_factory() as session, session.begin():
            for source_node in doc_nodes:
                # Build candidate dict excluding source
                candidates = {
                    nid: summary
                    for nid, summary in summaries.items()
                    if nid != source_node.node_id
                }
                
                suggestions = await ai_service.suggest_edges(
                    source_id=source_node.node_id,
                    source_summary=summaries[source_node.node_id],
                    target_summaries=candidates,
                )
                
                for suggestion in suggestions:
                    # Check if edge already exists
                    existing = await session.scalar(
                        select(GraphEdge).where(
                            GraphEdge.owner_account_id == owner_account_id,
                            GraphEdge.source_node_id == suggestion.source_doc_id,
                            GraphEdge.target_node_id == suggestion.target_doc_id,
                        )
                    )
                    if existing is None:
                        session.add(
                            GraphEdge(
                                id=new_id(),
                                owner_account_id=owner_account_id,
                                source_node_id=suggestion.source_doc_id,
                                target_node_id=suggestion.target_doc_id,
                                weight=suggestion.weight,
                                producer_kind="agent",
                            )
                        )
                        created_total += 1
        
        return {"created": created_total, "analyzed": len(doc_nodes)}