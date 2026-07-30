"""Admission flow from quarantined bytes to immutable authority."""

from __future__ import annotations

from collections.abc import AsyncIterable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from cognoscope.domain.library import ArchiveLimits, AssetFormat, FormatTier, validate_declared_media_type
from cognoscope.infrastructure.models import BibliographicRevision, DocumentRevision, ProjectRevision

from cognoscope.infrastructure.postgres.authority_repository import AuthorityRepository
from cognoscope.infrastructure.storage import BlobHandle, PrivateBlobStore, ReconciliationReport


@dataclass(frozen=True)
class AdmissionRequest:
    owner_account_id: str
    project_title: str
    document_title: str
    declared_media_type: str | None = None


@dataclass(frozen=True)
class AdmissionResult:
    admitted_asset_id: str
    document_id: str
    blob: BlobHandle
    format: AssetFormat
    tier: FormatTier
    media_type: str
    generation: int


class LibraryService:
    """Enforces byte inspection before a blob is published or referenced."""

    def __init__(
        self,
        repository: AuthorityRepository,
        storage: PrivateBlobStore,
        *,
        archive_limits: ArchiveLimits = ArchiveLimits(),
        inspection: Callable[[Path], bool] | None = None,
    ) -> None:
        self._repository = repository
        self.storage = storage
        self._archive_limits = archive_limits
        self._inspection = inspection

    async def admit(self, request: AdmissionRequest, chunks: AsyncIterable[bytes] | Iterable[bytes]) -> AdmissionResult:
        upload = await self.storage.quarantine_upload(chunks)
        blob: BlobHandle | None = None
        try:
            classification = await self.storage.inspect(
                upload,
                archive_limits=self._archive_limits,
                inspection=self._inspection,
            )
            validate_declared_media_type(classification, request.declared_media_type)
            blob = await self.storage.publish(await self.storage.stage(upload))
            document_id, generation = await self._repository.admit_asset(
                owner_account_id=request.owner_account_id,
                project_title=request.project_title,
                document_title=request.document_title,
                blob=blob,
                classification=classification,
            )
            admitted_asset_id = await self._repository.admitted_asset_id_for_document(
                owner_account_id=request.owner_account_id,
                document_id=document_id,
            )
        except BaseException:
            await self.storage.discard_quarantine(upload)
            raise
        return AdmissionResult(
            admitted_asset_id,
            document_id,
            blob,
            classification.format,
            classification.tier,
            classification.media_type,
            generation,
        )

    async def owned_asset(self, *, owner_account_id: str, asset_id: str) -> tuple[str, str, AssetFormat, FormatTier, str, BlobHandle]:
        asset, blob, document_revision = await self._repository.owned_asset_blob(owner_account_id=owner_account_id, asset_id=asset_id)
        return asset.id, document_revision.title, AssetFormat(asset.detected_format), FormatTier(asset.format_tier), asset.media_type, BlobHandle(blob.digest, blob.byte_size)

    async def read_owned_asset(self, *, owner_account_id: str, asset_id: str) -> tuple[str, bytes]:
        _, _, _, _, media_type, blob = await self.owned_asset(owner_account_id=owner_account_id, asset_id=asset_id)
        return media_type, await self.storage.read_verified(blob)

    async def revise_project(self, project_id: str, title: str, *, actor: str) -> ProjectRevision:
        return await self._repository.revise_project(project_id, title, actor=actor)

    async def revise_document(self, document_id: str, title: str, *, actor: str) -> DocumentRevision:
        return await self._repository.revise_document(document_id, title, actor=actor)

    async def revise_bibliography(
        self,
        record_id: str,
        csl_json: dict[str, object],
        *,
        actor: str,
    ) -> BibliographicRevision:
        return await self._repository.revise_bibliography(record_id, csl_json, actor=actor)


    async def add_bibliography(self, *, document_id: str, csl_json: dict[str, object]):
        return await self._repository.add_bibliography(document_id, csl_json)

    async def reconcile_blobs(self) -> ReconciliationReport:
        report = await self.storage.reconcile(await self._repository.active_blob_reference_sizes())
        await self._repository.mark_blobs_unavailable((*report.missing_references, *report.invalid_content))
        return report
