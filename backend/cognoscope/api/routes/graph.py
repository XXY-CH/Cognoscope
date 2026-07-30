from __future__ import annotations

from fastapi import APIRouter, Depends, status

from cognoscope.api.dependencies import FixedUser, get_fixed_user, get_graph_service
from cognoscope.api.schemas import GraphNodeListResponse, GraphEdgeListResponse, GraphSyncResponse, GraphBuildResponse
from cognoscope.application.graph_service import GraphService

router = APIRouter(tags=["graph"])


@router.post("/graph/sync", response_model=GraphSyncResponse, status_code=status.HTTP_200_OK)
async def sync_nodes(
    user: FixedUser = Depends(get_fixed_user),
    service: GraphService = Depends(get_graph_service),
) -> GraphSyncResponse:
    """Sync graph nodes from library documents."""
    synced = await service.sync_nodes_from_documents(owner_account_id=user.account_id)
    return GraphSyncResponse(synced_count=synced)


@router.get("/graph/nodes", response_model=GraphNodeListResponse)
async def list_nodes(
    user: FixedUser = Depends(get_fixed_user),
    service: GraphService = Depends(get_graph_service),
) -> GraphNodeListResponse:
    """List all graph nodes."""
    nodes = await service.list_nodes(owner_account_id=user.account_id)
    return GraphNodeListResponse(
        nodes=[
            {
                "id": n.node_id,
                "fileId": n.file_id,
                "label": n.label,
                "kind": n.kind,
                "fileType": n.file_type,
                "x": n.x,
                "y": n.y,
            }
            for n in nodes
        ]
    )


@router.get("/graph/edges", response_model=GraphEdgeListResponse)
async def list_edges(
    user: FixedUser = Depends(get_fixed_user),
    service: GraphService = Depends(get_graph_service),
) -> GraphEdgeListResponse:
    """List all graph edges."""
    edges = await service.list_edges(owner_account_id=user.account_id)
    return GraphEdgeListResponse(
        edges=[{"source": e.source, "target": e.target, "weight": e.weight} for e in edges]
    )


@router.post("/graph/build", response_model=GraphBuildResponse, status_code=status.HTTP_202_ACCEPTED)
async def build_edges(
    use_ai: bool = False,
    user: FixedUser = Depends(get_fixed_user),
    service: GraphService = Depends(get_graph_service),
) -> GraphBuildResponse:
    """Trigger edge generation (demo mode or AI-powered)."""
    if use_ai:
        try:
            result = await service.build_graph_with_ai(owner_account_id=user.account_id)
            return GraphBuildResponse(
                task_id=None,
                created_count=result["created"],
                status="completed",
            )
        except ValueError as exc:
            return GraphBuildResponse(
                task_id=None,
                created_count=0,
                status="failed",
            )
    else:
        created = await service.generate_demo_edges(owner_account_id=user.account_id)
        return GraphBuildResponse(task_id=None, created_count=created, status="completed")