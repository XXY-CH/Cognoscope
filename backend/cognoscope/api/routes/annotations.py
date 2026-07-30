from __future__ import annotations

import json

from fastapi import APIRouter, Depends, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import PlainTextResponse, Response

from cognoscope.api.dependencies import FixedUser, get_authority_repository, get_fixed_user
from cognoscope.api.errors import ApiError
from cognoscope.api.schemas import (
    AnnotationCreateRequest,
    AnnotationExportResponse,
    AnnotationListResponse,
    AnnotationRepairDecisionRequest,
    AnnotationRepairQueueResponse,
    AnnotationResponse,
    AnnotationRestoreRequest,
    AnnotationRevisionRequest,
)
from cognoscope.infrastructure.postgres.authority_repository import AnnotationConflictError, AuthorityRepository

router = APIRouter(tags=["annotations"])


def _api_error(exc: ValueError) -> None:
    if isinstance(exc, AnnotationConflictError):
        raise ApiError(409, "annotation_revision_conflict", str(exc)) from exc
    if str(exc) == "annotation not found":
        raise ApiError(404, "annotation_not_found", "Annotation was not found") from exc
    raise ApiError(422, "annotation_invalid", str(exc)) from exc


@router.post("/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: AnnotationCreateRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationResponse:
    try:
        annotation = await repository.create_annotation(owner_account_id=user.account_id, **body.model_dump())
        return AnnotationResponse.model_validate(await repository.annotation_view(owner_account_id=user.account_id, annotation_id=annotation.id))
    except ValueError as exc:
        _api_error(exc)


@router.get("/annotations", response_model=AnnotationListResponse)
async def list_annotations(
    include_tombstoned: bool = False,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationListResponse:
    return AnnotationListResponse(annotations=[AnnotationResponse.model_validate(item) for item in await repository.list_annotations(owner_account_id=user.account_id, include_tombstoned=include_tombstoned)])


@router.get("/annotations/repair-queue", response_model=AnnotationRepairQueueResponse)
async def repair_queue(
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationRepairQueueResponse:
    return AnnotationRepairQueueResponse(repairs=await repository.repair_queue(owner_account_id=user.account_id))


@router.get("/annotations/{annotation_id}", response_model=AnnotationResponse)
async def get_annotation(
    annotation_id: str,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationResponse:
    try:
        return AnnotationResponse.model_validate(await repository.annotation_view(owner_account_id=user.account_id, annotation_id=annotation_id))
    except ValueError as exc:
        _api_error(exc)


@router.post("/annotations/{annotation_id}/revisions", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def revise_annotation(
    annotation_id: str,
    body: AnnotationRevisionRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationResponse:
    try:
        await repository.append_annotation_revision(owner_account_id=user.account_id, annotation_id=annotation_id, **body.model_dump())
        return AnnotationResponse.model_validate(await repository.annotation_view(owner_account_id=user.account_id, annotation_id=annotation_id))
    except ValueError as exc:
        _api_error(exc)


@router.post("/annotations/{annotation_id}/restore", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def restore_annotation(
    annotation_id: str,
    body: AnnotationRestoreRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationResponse:
    try:
        await repository.append_annotation_revision(owner_account_id=user.account_id, annotation_id=annotation_id, expected_revision=body.expected_revision, restore=True)
        return AnnotationResponse.model_validate(await repository.annotation_view(owner_account_id=user.account_id, annotation_id=annotation_id))
    except ValueError as exc:
        _api_error(exc)


@router.post("/annotations/{annotation_id}/repair-decisions", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def decide_repair(
    annotation_id: str,
    body: AnnotationRepairDecisionRequest,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> AnnotationResponse:
    try:
        await repository.decide_annotation_repair(owner_account_id=user.account_id, annotation_id=annotation_id, **body.model_dump())
        return AnnotationResponse.model_validate(await repository.annotation_view(owner_account_id=user.account_id, annotation_id=annotation_id))
    except ValueError as exc:
        _api_error(exc)


@router.get("/annotations/{annotation_id}/export.json", response_model=AnnotationExportResponse)
async def export_annotation_json(
    annotation_id: str,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> Response:
    try:
        exported = await repository.annotation_export(owner_account_id=user.account_id, annotation_id=annotation_id)
    except ValueError as exc:
        _api_error(exc)
    return Response(content=json.dumps(jsonable_encoder(exported), ensure_ascii=False, sort_keys=True, separators=(",", ":")), media_type="application/json")


@router.get("/annotations/{annotation_id}/export.md", response_class=PlainTextResponse)
async def export_annotation_markdown(
    annotation_id: str,
    user: FixedUser = Depends(get_fixed_user),
    repository: AuthorityRepository = Depends(get_authority_repository),
) -> PlainTextResponse:
    try:
        exported = await repository.annotation_export(owner_account_id=user.account_id, annotation_id=annotation_id)
    except ValueError as exc:
        _api_error(exc)
    revisions = exported["revisions"]
    sections = [f"# Annotation {exported['annotation']['id']}\n\nAsset ID: `{exported['annotation']['asset_id']}`\n"]
    for revision in revisions:
        sections.append(
            f"\n## Revision {revision['revision']} · {revision['state']}\n\n"
            f"- Revision ID: `{revision['revision_id']}`\n"
            f"- Kind: `{revision['kind']}`\n"
            f"- Source run ID: `{revision['source_run_id']}`\n"
            f"- Created at: `{revision['created_at']}`\n\n"
            f"### Body\n\n{revision['body']}\n\n"
            f"### Canonical selector JSON\n\n```canonical-selector-json\n"
            f"{json.dumps(revision['selectors'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))}\n```\n"
        )
    return PlainTextResponse("".join(sections))
