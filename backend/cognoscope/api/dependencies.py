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


def get_fixed_user() -> FixedUser:
    return FixedUser()