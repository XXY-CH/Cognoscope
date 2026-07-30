"""Normalize admitted bytes without bypassing format or parser promotion authority."""

from __future__ import annotations
import asyncio
from dataclasses import dataclass
import json

from cognoscope.domain.documents import AdapterOutput, ExtractionSnapshot
from cognoscope.domain.jobs import JobLease
from cognoscope.domain.library import FormatTier
from cognoscope.infrastructure.parsers import ParserRegistry, ParserResourceLimitError
from cognoscope.infrastructure.postgres.extraction_repository import ExtractionRepository
from cognoscope.infrastructure.storage import BlobHandle, PrivateBlobStore


@dataclass(frozen=True)
class ExtractionLimits:
    max_input_bytes: int = 64 * 1024 * 1024
    max_text_chars: int = 32 * 1024 * 1024
    max_artifact_bytes: int = 32 * 1024 * 1024
    max_parts: int = 50_000
    max_pages: int = 50_000
    max_blocks: int = 100_000
    max_spans: int = 250_000
    max_candidates: int = 50_000
    max_findings: int = 50_000
    max_summaries: int = 50_000

    def __post_init__(self) -> None:
        if any(value <= 0 for value in self.__dict__.values()):
            raise ValueError("extraction limits must be positive")


class ExtractionService:
    def __init__(
        self,
        repository: ExtractionRepository,
        storage: PrivateBlobStore,
        parsers: ParserRegistry,
        *,
        limits: ExtractionLimits = ExtractionLimits(),
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._parsers = parsers
        self._limits = limits

    async def extract(self, asset_id: str, *, actor: str, lease: JobLease | None = None) -> ExtractionSnapshot:
        asset = await self._repository.asset_context(asset_id)
        adapter = self._parsers.adapter_for(asset.format)
        if adapter is None:
            return await self._repository.record_blocked(asset, actor=actor, limitation="parser_runtime_not_promoted", lease=lease)
        if asset.tier is FormatTier.FIRST_CLASS and not adapter.identity.promotion_evidence:
            return await self._repository.record_blocked(asset, actor=actor, limitation="parser_runtime_not_promoted", lease=lease)

        adapter_limit = getattr(adapter, "max_input_bytes", self._limits.max_input_bytes)
        if type(adapter_limit) is not int or adapter_limit <= 0:
            raise ValueError("parser input limit must be a positive integer")
        input_limit = min(adapter_limit, self._limits.max_input_bytes)
        if asset.blob_size > input_limit:
            return await self._repository.record_blocked(asset, actor=actor, limitation="parser_resource_limit", lease=lease)
        payload = await self._storage.read_verified(BlobHandle(asset.blob_digest, asset.blob_size), max_bytes=input_limit)
        try:
            output = await asyncio.to_thread(adapter.extract, payload, asset)
        except ParserResourceLimitError:
            return await self._repository.record_blocked(asset, actor=actor, limitation="parser_resource_limit", lease=lease)
        if output.document.format is not asset.format or output.document.tier is not asset.tier:
            raise ValueError("adapter output conflicts with admitted format authority")
        if asset.tier is FormatTier.EXTRACTION_ONLY and (output.document.viewable or output.document.annotation_capable):
            raise ValueError("extraction-only output cannot claim reader or annotation capability")
        if not self._within_limits(output):
            return await self._repository.record_blocked(asset, actor=actor, limitation="parser_resource_limit", lease=lease)
        snapshot = await self._repository.record_output(asset, adapter.identity, output, actor=actor, lease=lease)
        return snapshot

    def _within_limits(self, output: AdapterOutput) -> bool:
        document = output.document
        counts = (
            (len(document.parts), self._limits.max_parts),
            (len(document.pages), self._limits.max_pages),
            (len(document.blocks), self._limits.max_blocks),
            (len(document.spans), self._limits.max_spans),
            (len(document.bibliographic_candidates), self._limits.max_candidates),
            (len(document.findings), self._limits.max_findings),
            (len(document.evidence_summaries), self._limits.max_summaries),
        )
        if any(actual > limit for actual, limit in counts):
            return False
        text_chars = sum(
            len(value or "")
            for values in (
                ((page.source_text, page.ocr_text, page.normalized_text) for page in document.pages),
                ((block.source_text, block.ocr_text, block.normalized_text) for block in document.blocks),
                ((span.text,) for span in document.spans),
                ((summary.summary,) for summary in document.evidence_summaries),
            )
            for group in values
            for value in group
        )
        if text_chars > self._limits.max_text_chars:
            return False
        artifact_size = len(json.dumps(output.artifact, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=dict).encode())
        return artifact_size <= self._limits.max_artifact_bytes
