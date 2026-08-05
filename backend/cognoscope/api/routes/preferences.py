from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from cognoscope.api.dependencies import FixedUser, get_fixed_user, get_preference_service
from cognoscope.api.errors import ApiError
from cognoscope.api.schemas import (
    ResearchPreferenceListResponse,
    ResearchPreferenceResponse,
    ResearchPreferenceUpdateRequest,
)
from pydantic import BaseModel, Field

from cognoscope.application.preference_service import PreferenceService

router = APIRouter(tags=["preferences"])


class AiConfigUpdate(BaseModel):
    """AI 配置更新请求"""
    base_url: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)
    model: str = Field(default="gpt-4o-mini")


class AiConfigResponse(BaseModel):
    """AI 配置响应"""
    base_url: str
    model: str
    configured: bool


def _api_error(exc: ValueError) -> None:
    if str(exc) == "annotation not found":
        raise ApiError(404, "annotation_not_found", "The annotation was not found") from exc
    raise ApiError(422, "preference_invalid", str(exc)) from exc


def _response(preference: object) -> ResearchPreferenceResponse:
    return ResearchPreferenceResponse.model_validate(preference)


@router.get("/preferences/ai-config", response_model=AiConfigResponse)
async def get_ai_config(
    request: Request,
    user: FixedUser = Depends(get_fixed_user),
) -> AiConfigResponse:
    """获取当前 AI 配置（不返回 API Key）"""
    settings = request.app.state.settings
    
    return AiConfigResponse(
        base_url=settings.llm_base_url or "",
        model=settings.llm_model or "gpt-4o-mini",
        configured=bool(settings.llm_api_key),
    )


@router.put("/preferences/ai-config")
async def update_ai_config(
    request: Request,
    body: AiConfigUpdate,
    user: FixedUser = Depends(get_fixed_user),
) -> AiConfigResponse:
    """更新 AI 配置（动态生效）"""
    from cognoscope.api.dependencies import _ai_client_cache
    settings = request.app.state.settings
    
    # 动态更新配置
    settings.llm_base_url = body.base_url
    settings.llm_api_key = body.api_key
    settings.llm_model = body.model
    
    # 清空缓存，下次请求时会使用新配置重新创建客户端
    _ai_client_cache.clear()
    
    return AiConfigResponse(
        base_url=body.base_url,
        model=body.model,
        configured=True,
    )


@router.get("/preferences", response_model=ResearchPreferenceListResponse)
async def list_preferences(
    user: FixedUser = Depends(get_fixed_user),
    service: PreferenceService = Depends(get_preference_service),
) -> ResearchPreferenceListResponse:
    return ResearchPreferenceListResponse(preferences=[_response(item) for item in await service.list(owner_account_id=user.account_id)])


@router.get("/preferences/{annotation_id}", response_model=ResearchPreferenceResponse)
async def get_preference(
    annotation_id: str,
    user: FixedUser = Depends(get_fixed_user),
    service: PreferenceService = Depends(get_preference_service),
) -> ResearchPreferenceResponse:
    try:
        preference = await service.get(owner_account_id=user.account_id, annotation_id=annotation_id)
    except ValueError as exc:
        _api_error(exc)
    if preference is None:
        raise ApiError(404, "preference_not_found", "The research preference was not found")
    return _response(preference)


@router.put("/preferences/{annotation_id}", response_model=ResearchPreferenceResponse)
async def update_preference(
    annotation_id: str,
    body: ResearchPreferenceUpdateRequest,
    user: FixedUser = Depends(get_fixed_user),
    service: PreferenceService = Depends(get_preference_service),
) -> ResearchPreferenceResponse:
    try:
        preference = await service.update(owner_account_id=user.account_id, annotation_id=annotation_id, **body.model_dump())
    except ValueError as exc:
        _api_error(exc)
    return _response(preference)
