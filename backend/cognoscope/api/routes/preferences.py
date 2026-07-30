from __future__ import annotations

from fastapi import APIRouter, Depends

from cognoscope.api.dependencies import get_preference_service, require_csrf_session, require_session
from cognoscope.api.errors import ApiError
from cognoscope.api.schemas import (
    ResearchPreferenceListResponse,
    ResearchPreferenceResponse,
    ResearchPreferenceUpdateRequest,
)

from cognoscope.application.preference_service import PreferenceService

router = APIRouter(tags=["preferences"])


def _api_error(exc: ValueError) -> None:
    if str(exc) == "annotation not found":
        raise ApiError(404, "annotation_not_found", "The annotation was not found") from exc
    raise ApiError(422, "preference_invalid", str(exc)) from exc


def _response(preference: object) -> ResearchPreferenceResponse:
    return ResearchPreferenceResponse.model_validate(preference)


@router.get("/preferences", response_model=ResearchPreferenceListResponse)
async def list_preferences(
    authenticated: FixedUser = Depends(require_session),
    service: PreferenceService = Depends(get_preference_service),
) -> ResearchPreferenceListResponse:
    return ResearchPreferenceListResponse(preferences=[_response(item) for item in await service.list(owner_account_id=authenticated.account.id)])


@router.get("/preferences/{annotation_id}", response_model=ResearchPreferenceResponse)
async def get_preference(
    annotation_id: str,
    authenticated: FixedUser = Depends(require_session),
    service: PreferenceService = Depends(get_preference_service),
) -> ResearchPreferenceResponse:
    try:
        preference = await service.get(owner_account_id=authenticated.account.id, annotation_id=annotation_id)
    except ValueError as exc:
        _api_error(exc)
    if preference is None:
        raise ApiError(404, "preference_not_found", "The research preference was not found")
    return _response(preference)


@router.put("/preferences/{annotation_id}", response_model=ResearchPreferenceResponse)
async def update_preference(
    annotation_id: str,
    body: ResearchPreferenceUpdateRequest,
    authenticated: FixedUser = Depends(require_csrf_session),
    service: PreferenceService = Depends(get_preference_service),
) -> ResearchPreferenceResponse:
    try:
        preference = await service.update(owner_account_id=authenticated.account.id, annotation_id=annotation_id, **body.model_dump())
    except ValueError as exc:
        _api_error(exc)
    return _response(preference)
