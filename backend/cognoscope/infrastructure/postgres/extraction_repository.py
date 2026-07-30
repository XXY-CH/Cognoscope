"""SQLAlchemy persistence for immutable normalized extraction runs."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from datetime import UTC
import hashlib
import json
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cognoscope.api.errors import ApiError
from cognoscope.domain.documents import (
    AdapterIdentity, AdapterOutput, BibliographicCandidate, BlockKind, BoundingBox, DocumentPart,
    EvidenceSummary, ExtractionAsset, ExtractionDiff, ExtractionFinding, ExtractionRunRecord,
    ExtractionSnapshot, ExtractionStatus, FindingSeverity, NormalizedBlock, NormalizedDocument,
    NormalizedPage, NormalizedSpan, PageMode, RepairCandidate,
)
from cognoscope.domain.jobs import JobLease, JobState
from cognoscope.domain.library import AssetFormat, FormatTier
from cognoscope.infrastructure.models import (
    AdmittedAsset, AuthorityGeneration, BlobRecord, DurableJob, ExtractionBibliographicCandidate, ExtractionBlock,
    ExtractionEvidenceSummary, ExtractionFinding as ExtractionFindingRow, ExtractionPage, ExtractionPart,
    ExtractionRepairCandidate, ExtractionRun, ExtractionRunDiff, ExtractionSpan, ProvenanceEvent, new_id, utcnow,
)


class ExtractionRepository:
    """Appends immutable normalized extraction snapshots."""

    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def asset_context(self, asset_id: str) -> ExtractionAsset:
        async with self._session_factory() as session:
            result = await session.execute(
                select(AdmittedAsset, BlobRecord).join(BlobRecord, BlobRecord.digest == AdmittedAsset.blob_digest).where(AdmittedAsset.id == asset_id)
            )
            row = result.one_or_none()
            if row is None:
                raise ValueError("admitted asset does not exist")
            asset, blob = row
            return ExtractionAsset(asset.id, asset.blob_digest, blob.byte_size, AssetFormat(asset.detected_format), FormatTier(asset.format_tier))

    async def record_blocked(self, asset: ExtractionAsset, *, actor: str, limitation: str, lease: JobLease | None = None) -> ExtractionSnapshot:
        if not limitation:
            raise ValueError("extraction limitation must not be blank")
        async with self._session_factory() as session, session.begin():
            await self._assert_active_lease(session, asset.id, lease)
            existing = await self._existing_job_snapshot(session, lease)
            if existing is not None:
                return existing
            generation = await self._lock_generation(session)
            run = ExtractionRun(
                id=new_id(), asset_id=asset.id, sequence=await self._next_sequence(session, asset.id),
                job_id=None if lease is None else lease.job_id,
                status=ExtractionStatus.BLOCKED.value, source_blob_digest=asset.blob_digest,
                detected_format=asset.format.value, format_tier=asset.tier.value,
                limitations_json=self._canonical_json((limitation,)),
            )
            session.add_all((run, self._provenance(run, actor, "extraction_blocked", {"limitation": limitation, "sequence": run.sequence})))
            await session.flush()
            await self._assert_active_lease(session, asset.id, lease)
            generation.generation += 1
            return ExtractionSnapshot(self._run_record(run), None)

    async def record_output(self, asset: ExtractionAsset, identity: AdapterIdentity, output: AdapterOutput, *, actor: str, lease: JobLease | None = None) -> ExtractionSnapshot:
        document = output.document
        if document.format is not asset.format or document.tier is not asset.tier:
            raise ValueError("adapter output conflicts with admitted format authority")
        artifact_json = self._canonical_json(output.artifact)
        artifact_digest = hashlib.sha256(artifact_json.encode()).hexdigest()
        async with self._session_factory() as session, session.begin():
            await self._assert_active_lease(session, asset.id, lease)
            existing = await self._existing_job_snapshot(session, lease)
            if existing is not None:
                return existing
            generation = await self._lock_generation(session)
            previous = await self._latest_run(session, asset.id)
            run = ExtractionRun(
                id=new_id(), asset_id=asset.id, sequence=1 if previous is None else previous.sequence + 1,
                job_id=None if lease is None else lease.job_id,
                status=ExtractionStatus.COMPLETED.value, adapter_id=identity.adapter_id,
                adapter_version=identity.version, adapter_revision=identity.revision,
                artifact_digest=artifact_digest, artifact_json=artifact_json, source_blob_digest=asset.blob_digest,
                detected_format=asset.format.value, format_tier=asset.tier.value, viewable=document.viewable,
                annotation_capable=document.annotation_capable, limitations_json=self._canonical_json(document.limitations),
                supersedes_run_id=None if previous is None else previous.id,
            )
            session.add(run)
            await session.flush()
            await self._persist_document(session, run.id, document)
            diff: ExtractionDiff | None = None
            candidates: tuple[RepairCandidate, ...] = ()
            if previous is not None and previous.status == ExtractionStatus.COMPLETED.value:
                diff, candidates = self._compare_documents(await self._document(session, previous), document)
                session.add(ExtractionRunDiff(id=new_id(), run_id=run.id, previous_run_id=previous.id, added_span_count=diff.added_span_count, removed_span_count=diff.removed_span_count, changed_block_count=diff.changed_block_count))
                await session.flush()
                session.add_all(ExtractionRepairCandidate(id=new_id(), run_id=run.id, previous_run_id=previous.id, old_span_key=item.old_span_key, new_span_key=item.new_span_key, score=item.score) for item in candidates)
            session.add(self._provenance(run, actor, "extraction_recorded", {"adapter_id": identity.adapter_id, "adapter_revision": identity.revision, "sequence": run.sequence}))
            await session.flush()
            await self._assert_active_lease(session, asset.id, lease)
            generation.generation += 1
            return ExtractionSnapshot(self._run_record(run), document, diff, candidates)
    async def _existing_job_snapshot(self, session: AsyncSession, lease: JobLease | None) -> ExtractionSnapshot | None:
        if lease is None:
            return None
        run = await session.scalar(select(ExtractionRun).where(ExtractionRun.job_id == lease.job_id))
        return None if run is None else await self._snapshot(session, run)


    async def get_run(self, run_id: str) -> ExtractionSnapshot:
        async with self._session_factory() as session:
            run = await session.get(ExtractionRun, run_id)
            if run is None:
                raise ValueError("extraction run does not exist")
            return await self._snapshot(session, run)

    async def latest(self, asset_id: str) -> ExtractionSnapshot | None:
        async with self._session_factory() as session:
            run = await self._latest_run(session, asset_id)
            return None if run is None else await self._snapshot(session, run)

    async def for_job(self, job_id: str, asset_id: str) -> ExtractionSnapshot | None:
        async with self._session_factory() as session:
            run = await session.scalar(select(ExtractionRun).where(ExtractionRun.job_id == job_id, ExtractionRun.asset_id == asset_id))
            return None if run is None else await self._snapshot(session, run)


    async def review_findings(self, run_id: str) -> tuple[ExtractionFinding, ...]:
        async with self._session_factory() as session:
            rows = (await session.scalars(select(ExtractionFindingRow).where(ExtractionFindingRow.run_id == run_id, ExtractionFindingRow.requires_review.is_(True)).order_by(ExtractionFindingRow.created_at, ExtractionFindingRow.code))).all()
            return tuple(self._finding(row) for row in rows)

    @staticmethod
    async def _assert_active_lease(session: AsyncSession, asset_id: str, lease: JobLease | None) -> None:
        if lease is None:
            return
        job = await session.get(DurableJob, lease.job_id, with_for_update=True)
        now = utcnow()
        expires_at = None if job is None else job.lease_expires_at
        if (
            job is None
            or job.admitted_asset_id != asset_id
            or job.state != JobState.RUNNING.value
            or job.cancel_requested
            or job.lease_token != lease.token
            or job.lease_fence != lease.fence
            or expires_at is None
            or (expires_at.replace(tzinfo=UTC) if expires_at.tzinfo is None else expires_at.astimezone(UTC)) <= now
        ):
            raise ApiError(409, "stale_lease", "The worker lease is stale")

    async def _snapshot(self, session: AsyncSession, run: ExtractionRun) -> ExtractionSnapshot:
        document = await self._document(session, run) if run.status == ExtractionStatus.COMPLETED.value else None
        diff_row = await session.scalar(select(ExtractionRunDiff).where(ExtractionRunDiff.run_id == run.id))
        diff = None if diff_row is None else ExtractionDiff(diff_row.added_span_count, diff_row.removed_span_count, diff_row.changed_block_count)
        rows = (await session.scalars(select(ExtractionRepairCandidate).where(ExtractionRepairCandidate.run_id == run.id).order_by(ExtractionRepairCandidate.old_span_key, ExtractionRepairCandidate.new_span_key))).all()
        return ExtractionSnapshot(self._run_record(run), document, diff, tuple(RepairCandidate(row.old_span_key, row.new_span_key, row.score) for row in rows))

    async def _document(self, session: AsyncSession, run: ExtractionRun) -> NormalizedDocument:
        parts = (await session.scalars(select(ExtractionPart).where(ExtractionPart.run_id == run.id).order_by(ExtractionPart.ordinal))).all()
        pages = (await session.scalars(select(ExtractionPage).where(ExtractionPage.run_id == run.id).order_by(ExtractionPage.number))).all()
        blocks = (await session.scalars(select(ExtractionBlock).where(ExtractionBlock.run_id == run.id).order_by(ExtractionBlock.ordinal))).all()
        spans = (await session.scalars(select(ExtractionSpan).where(ExtractionSpan.run_id == run.id).order_by(ExtractionSpan.ordinal))).all()
        candidates = (await session.scalars(select(ExtractionBibliographicCandidate).where(ExtractionBibliographicCandidate.run_id == run.id).order_by(ExtractionBibliographicCandidate.key))).all()
        summaries = (await session.scalars(select(ExtractionEvidenceSummary).where(ExtractionEvidenceSummary.run_id == run.id).order_by(ExtractionEvidenceSummary.key))).all()
        findings = (await session.scalars(select(ExtractionFindingRow).where(ExtractionFindingRow.run_id == run.id).order_by(ExtractionFindingRow.created_at, ExtractionFindingRow.code))).all()
        return NormalizedDocument(
            format=AssetFormat(run.detected_format), tier=FormatTier(run.format_tier), viewable=run.viewable, annotation_capable=run.annotation_capable,
            parts=tuple(DocumentPart(row.key, row.kind, row.title, row.ordinal, row.parent_key, row.confidence) for row in parts),
            pages=tuple(NormalizedPage(row.number, PageMode(row.mode), row.source_text, row.ocr_text, row.normalized_text, row.confidence, row.width, row.height) for row in pages),
            blocks=tuple(NormalizedBlock(row.key, BlockKind(row.kind), row.ordinal, row.page_number, row.part_key, row.source_text, row.ocr_text, row.normalized_text, row.confidence, self._box_from_json(row.bounding_box_json)) for row in blocks),
            spans=tuple(NormalizedSpan(row.key, row.block_key, row.ordinal, row.start_offset, row.end_offset, row.text, row.confidence, tuple(BoundingBox(**item) for item in json.loads(row.bounding_boxes_json))) for row in spans),
            bibliographic_candidates=tuple(BibliographicCandidate(row.key, json.loads(row.csl_json), row.confidence, json.loads(row.provenance_json)) for row in candidates),
            evidence_summaries=tuple(EvidenceSummary(row.key, row.summary, tuple(json.loads(row.evidence_span_keys_json)), row.confidence) for row in summaries),
            findings=tuple(self._finding(row) for row in findings), limitations=tuple(json.loads(run.limitations_json)),
        )

    @staticmethod
    def _parent_first_parts(parts: tuple[DocumentPart, ...]) -> tuple[DocumentPart, ...]:
        by_key = {part.key: part for part in parts}
        ordered: list[DocumentPart] = []
        visited: set[str] = set()
        for part in parts:
            chain: list[DocumentPart] = []
            current = part
            while current.key not in visited:
                chain.append(current)
                if current.parent_key is None or current.parent_key in visited:
                    break
                current = by_key[current.parent_key]
            for item in reversed(chain):
                if item.key not in visited:
                    visited.add(item.key)
                    ordered.append(item)
        return tuple(ordered)

    async def _persist_document(self, session: AsyncSession, run_id: str, document: NormalizedDocument) -> None:
        parts = self._parent_first_parts(document.parts)
        session.add_all(ExtractionPart(id=new_id(), run_id=run_id, key=x.key, kind=x.kind, title=x.title, ordinal=x.ordinal, parent_key=x.parent_key, confidence=x.confidence) for x in parts)
        session.add_all(ExtractionPage(id=new_id(), run_id=run_id, number=x.number, mode=x.mode.value, source_text=x.source_text, ocr_text=x.ocr_text, normalized_text=x.normalized_text, confidence=x.confidence, width=x.width, height=x.height) for x in document.pages)
        await session.flush()
        session.add_all(ExtractionBlock(id=new_id(), run_id=run_id, key=x.key, kind=x.kind.value, ordinal=x.ordinal, page_number=x.page_number, part_key=x.part_key, source_text=x.source_text, ocr_text=x.ocr_text, normalized_text=x.normalized_text, confidence=x.confidence, bounding_box_json=None if x.bounding_box is None else self._canonical_json(self._box_value(x.bounding_box))) for x in document.blocks)
        await session.flush()
        session.add_all(ExtractionSpan(id=new_id(), run_id=run_id, key=x.key, block_key=x.block_key, ordinal=x.ordinal, start_offset=x.start_offset, end_offset=x.end_offset, text=x.text, confidence=x.confidence, bounding_boxes_json=self._canonical_json(tuple(self._box_value(box) for box in x.bounding_boxes))) for x in document.spans)
        await session.flush()
        session.add_all(ExtractionBibliographicCandidate(id=new_id(), run_id=run_id, key=x.key, csl_json=self._canonical_json(x.csl), confidence=x.confidence, provenance_json=self._canonical_json(x.provenance)) for x in document.bibliographic_candidates)
        session.add_all(ExtractionEvidenceSummary(id=new_id(), run_id=run_id, key=x.key, summary=x.summary, evidence_span_keys_json=self._canonical_json(x.evidence_span_keys), confidence=x.confidence) for x in document.evidence_summaries)
        session.add_all(self._finding_row(run_id, finding) for finding in document.findings)
        session.add_all(self._low_confidence_findings(run_id, document))

    @staticmethod
    def _compare_documents(old: NormalizedDocument, new: NormalizedDocument) -> tuple[ExtractionDiff, tuple[RepairCandidate, ...]]:
        old_spans, new_spans = {x.key: x for x in old.spans}, {x.key: x for x in new.spans}
        removed = tuple(old_spans[key] for key in old_spans.keys() - new_spans.keys())
        added = tuple(new_spans[key] for key in new_spans.keys() - old_spans.keys())
        old_by_text: defaultdict[str, list[NormalizedSpan]] = defaultdict(list)
        new_by_text: defaultdict[str, list[NormalizedSpan]] = defaultdict(list)
        for span in removed:
            if span.text:
                old_by_text[span.text].append(span)
        for span in added:
            if span.text:
                new_by_text[span.text].append(span)
        candidates = tuple(sorted((RepairCandidate(old_items[0].key, new_items[0].key, 1.0) for text, old_items in old_by_text.items() if len(old_items) == 1 and len(new_items := new_by_text.get(text, ())) == 1), key=lambda x: (x.old_span_key, x.new_span_key)))
        old_blocks, new_blocks = {x.key: x.normalized_text for x in old.blocks}, {x.key: x.normalized_text for x in new.blocks}
        return ExtractionDiff(len(added), len(removed), sum(old_blocks[key] != new_blocks[key] for key in old_blocks.keys() & new_blocks.keys())), candidates

    @staticmethod
    def _low_confidence_findings(run_id: str, document: NormalizedDocument) -> tuple[ExtractionFindingRow, ...]:
        rows: list[ExtractionFindingRow] = []
        for page in document.pages:
            if page.confidence < 0.5:
                rows.append(ExtractionFindingRow(id=new_id(), run_id=run_id, code=f"low_confidence_page_{page.number}", severity=FindingSeverity.WARNING.value, message=f"Page {page.number} confidence is below review threshold", page_number=page.number, requires_review=True, confidence=page.confidence))
        for block in document.blocks:
            if block.confidence < 0.5:
                rows.append(ExtractionFindingRow(id=new_id(), run_id=run_id, code=f"low_confidence_block_{block.key}", severity=FindingSeverity.WARNING.value, message=f"Block {block.key} confidence is below review threshold", page_number=block.page_number, block_key=block.key, requires_review=True, confidence=block.confidence))
        for span in document.spans:
            if span.confidence < 0.5:
                rows.append(ExtractionFindingRow(id=new_id(), run_id=run_id, code=f"low_confidence_span_{span.key}", severity=FindingSeverity.WARNING.value, message=f"Span {span.key} confidence is below review threshold", span_key=span.key, requires_review=True, confidence=span.confidence))
        return tuple(rows)

    @staticmethod
    def _finding_row(run_id: str, finding: ExtractionFinding) -> ExtractionFindingRow:
        return ExtractionFindingRow(id=new_id(), run_id=run_id, code=finding.code, severity=finding.severity.value, message=finding.message, page_number=finding.page_number, block_key=finding.block_key, span_key=finding.span_key, requires_review=finding.requires_review or finding.severity is FindingSeverity.WARNING)

    @staticmethod
    def _finding(row: ExtractionFindingRow) -> ExtractionFinding:
        return ExtractionFinding(row.code, FindingSeverity(row.severity), row.message, row.page_number, row.block_key, row.span_key, row.requires_review)

    @staticmethod
    def _run_record(row: ExtractionRun) -> ExtractionRunRecord:
        return ExtractionRunRecord(row.id, row.asset_id, row.sequence, ExtractionStatus(row.status), row.adapter_id, row.adapter_version, row.adapter_revision, row.artifact_digest, tuple(json.loads(row.limitations_json)), row.supersedes_run_id)

    @staticmethod
    async def _latest_run(session: AsyncSession, asset_id: str) -> ExtractionRun | None:
        return await session.scalar(select(ExtractionRun).where(ExtractionRun.asset_id == asset_id).order_by(ExtractionRun.sequence.desc()).limit(1))

    async def _next_sequence(self, session: AsyncSession, asset_id: str) -> int:
        previous = await self._latest_run(session, asset_id)
        return 1 if previous is None else previous.sequence + 1

    @staticmethod
    async def _lock_generation(session: AsyncSession) -> AuthorityGeneration:
        if session.bind is not None and session.bind.dialect.name == "sqlite":
            await session.execute(update(AuthorityGeneration).where(AuthorityGeneration.id == 1).values(generation=AuthorityGeneration.generation))
        row = await session.scalar(select(AuthorityGeneration).where(AuthorityGeneration.id == 1).with_for_update())
        if row is None:
            raise RuntimeError("authority generation is not initialized")
        return row

    @staticmethod
    def _provenance(run: ExtractionRun, actor: str, activity: str, details: Mapping[str, Any]) -> ProvenanceEvent:
        return ProvenanceEvent(id=new_id(), subject_type="extraction_run", subject_id=run.id, activity=activity, input_digest=run.source_blob_digest, output_digest=run.artifact_digest, actor=actor, details_json=ExtractionRepository._canonical_json(details))

    @staticmethod
    def _canonical_json(value: Any) -> str:
        return json.dumps(ExtractionRepository._json_value(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

    @staticmethod
    def _json_value(value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, Mapping):
            return {str(key): ExtractionRepository._json_value(item) for key, item in value.items()}
        if isinstance(value, tuple | list):
            return [ExtractionRepository._json_value(item) for item in value]
        raise ValueError("artifact must contain only JSON-like values")

    @staticmethod
    def _box_value(box: BoundingBox) -> dict[str, float]:
        return {"x": box.x, "y": box.y, "width": box.width, "height": box.height}

    @staticmethod
    def _box_from_json(value: str | None) -> BoundingBox | None:
        return None if value is None else BoundingBox(**json.loads(value))
