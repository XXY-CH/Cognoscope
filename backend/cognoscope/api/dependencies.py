from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from cognoscope.application.job_service import JobService
from cognoscope.application.library_service import LibraryService
from cognoscope.application.preference_service import PreferenceService
from cognoscope.application.graph_service import GraphService
from cognoscope.infrastructure.postgres.authority_repository import AuthorityRepository
from cognoscope.infrastructure.postgres.extraction_repository import ExtractionRepository
from cognoscope.infrastructure.storage import PrivateBlobStore
from cognoscope.infrastructure.ai import AIClient

# AI 客户端缓存（支持动态重新创建）
_ai_client_cache: dict[str, AIClient | None] = {}


@dataclass(frozen=True)
class FixedUser:
    account_id: str = "default-user"


def get_job_service(request: Request) -> JobService:
    return request.app.state.job_service


def get_extraction_repository(request: Request) -> ExtractionRepository:
    return request.app.state.extraction_repository


def get_authority_repository(request: Request) -> AuthorityRepository:
    return request.app.state.authority_repository


def get_library_service(request: Request) -> LibraryService:
    return LibraryService(
        request.app.state.authority_repository,
        PrivateBlobStore(request.app.state.settings.storage_root),
    )


def get_preference_service(request: Request) -> PreferenceService:
    return request.app.state.preference_service


def get_graph_service(request: Request) -> GraphService:
    return request.app.state.graph_service


def get_ai_client(request: Request) -> AIClient | None:
    """获取 AI 客户端（支持动态配置更新）"""
    settings = request.app.state.settings
    
    # 生成缓存键
    cache_key = f"{settings.llm_base_url}:{settings.llm_api_key}:{settings.llm_model}"
    
    # 检查缓存
    if cache_key in _ai_client_cache:
        return _ai_client_cache[cache_key]
    
    # 创建新客户端
    if settings.llm_api_key:
        client = AIClient(
            settings.llm_base_url,
            settings.llm_api_key,
            settings.llm_model,
            settings.llm_timeout_seconds
        )
        _ai_client_cache[cache_key] = client
        return client
    
    _ai_client_cache[cache_key] = None
    return None


def get_fixed_user() -> FixedUser:
    return FixedUser()