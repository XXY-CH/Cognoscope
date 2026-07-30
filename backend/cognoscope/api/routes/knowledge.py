from __future__ import annotations

import json

from fastapi import APIRouter, Depends, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response

from cognoscope.api.dependencies import FixedUser, get_authority_repository, get_fixed_user
from cognoscope.api.errors import ApiError
from cognoscope.api.schemas import (
    KnowledgeCreateRequest,
    KnowledgeExportResponse,
    KnowledgeListResponse,
    KnowledgeResponse,
    KnowledgeReviewRequest,
    KnowledgeThresholdRequest,
    KnowledgeThresholdResponse,
)

from cognoscope.infrastructure.postgres.authority_repository import AuthorityRepository, KnowledgeConflictError

router = APIRouter(tags=["knowledge"])


def _api_error(exc: ValueError) -> None:
    if isinstance(exc, KnowledgeConflictError):
        raise ApiError(409, "knowledge_revision_conflict", str(exc)) from exc
    if str(exc) == "knowledge not found":
        raise ApiError(404, "knowledge_not_found", "Knowledge was not found") from exc
    raise ApiError(422, "knowledge_invalid", str(exc)) from exc


@router.put("/knowledge/thresholds/{task_type}", response_model=KnowledgeThresholdResponse)
async def set_threshold(
    task_type: str,
    body: KnowledgeThresholdRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeThresholdResponse:
    try:
        threshold = await repository.set_knowledge_threshold(owner_account_id=user.account_id, task_type=task_type, **body.model_dump())
        return KnowledgeThresholdResponse(task_type=threshold.task_type, minimum_confidence=threshold.minimum_confidence)
    except ValueError as exc:
        _api_error(exc)


@router.get("/knowledge/thresholds/{task_type}", response_model=KnowledgeThresholdResponse)
async def get_threshold(
    task_type: str,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeThresholdResponse:
    threshold = await repository.knowledge_threshold(owner_account_id=user.account_id, task_type=task_type)
    if threshold is None:
        raise ApiError(404, "knowledge_threshold_not_found", "Knowledge threshold was not found")
    return KnowledgeThresholdResponse(task_type=threshold.task_type, minimum_confidence=threshold.minimum_confidence)


@router.post("/knowledge", response_model=KnowledgeResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge(
    body: KnowledgeCreateRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeResponse:
    try:
        item = await repository.create_knowledge(owner_account_id=user.account_id, **body.model_dump())
        return KnowledgeResponse.model_validate(await repository.knowledge_view(owner_account_id=user.account_id, knowledge_id=item.id))
    except ValueError as exc:
        _api_error(exc)


@router.get("/knowledge", response_model=KnowledgeListResponse)
async def list_knowledge(
    status: str | None = None,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeListResponse:
    return KnowledgeListResponse(knowledge=[KnowledgeResponse.model_validate(item) for item in await repository.list_knowledge(owner_account_id=user.account_id, status=status)])


@router.get("/review/queue", response_model=KnowledgeListResponse)
async def review_queue(
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeListResponse:
    return KnowledgeListResponse(knowledge=[KnowledgeResponse.model_validate(item) for item in await repository.review_queue(owner_account_id=user.account_id)])


@router.get("/knowledge/{knowledge_id}", response_model=KnowledgeResponse)
async def get_knowledge(
    knowledge_id: str,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeResponse:
    try:
        return KnowledgeResponse.model_validate(await repository.knowledge_view(owner_account_id=user.account_id, knowledge_id=knowledge_id))
    except ValueError as exc:
        _api_error(exc)


@router.post("/knowledge/{knowledge_id}/review", response_model=KnowledgeResponse, status_code=status.HTTP_201_CREATED)
async def review_knowledge(
    knowledge_id: str,
    body: KnowledgeReviewRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> KnowledgeResponse:
    try:
        await repository.review_knowledge(owner_account_id=user.account_id, knowledge_id=knowledge_id, **body.model_dump())
        return KnowledgeResponse.model_validate(await repository.knowledge_view(owner_account_id=user.account_id, knowledge_id=knowledge_id))
    except ValueError as exc:
        _api_error(exc)


@router.get("/knowledge/{knowledge_id}/export.json", response_model=KnowledgeExportResponse)
async def export_knowledge(
    knowledge_id: str,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> Response:
    try:
        exported = await repository.knowledge_export(owner_account_id=user.account_id, knowledge_id=knowledge_id)
    except ValueError as exc:
        _api_error(exc)
    return Response(content=json.dumps(jsonable_encoder(exported), ensure_ascii=False, sort_keys=True, separators=(",", ":")), media_type="application/json")
