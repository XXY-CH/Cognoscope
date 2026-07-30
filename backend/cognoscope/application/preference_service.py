from __future__ import annotations

from cognoscope.infrastructure.models import ResearchPreference
from cognoscope.infrastructure.postgres.authority_repository import AuthorityRepository


class PreferenceService:
    """Owner-scoped, annotation-backed research preference operations."""

    def __init__(self, repository: AuthorityRepository) -> None:
        self._repository = repository

    async def list(self, *, owner_account_id: str) -> list[ResearchPreference]:
        return await self._repository.list_research_preferences(owner_account_id=owner_account_id)

    async def get(self, *, owner_account_id: str, annotation_id: str) -> ResearchPreference | None:
        return await self._repository.research_preference(owner_account_id=owner_account_id, annotation_id=annotation_id)

    async def update(self, *, owner_account_id: str, annotation_id: str, annotation_weight: float, highlight: bool) -> ResearchPreference:
        return await self._repository.set_research_preference(
            owner_account_id=owner_account_id,
            annotation_id=annotation_id,
            annotation_weight=annotation_weight,
            highlight=highlight,
        )
