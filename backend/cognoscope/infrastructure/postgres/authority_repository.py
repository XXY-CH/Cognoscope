"""SQLAlchemy persistence for immutable library authority."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
import json
import re
from typing import Any

from sqlalchemy import Select, select, text, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from cognoscope.domain.events import OutboxStatus
from cognoscope.domain.jobs import JobState
from cognoscope.domain.library import FormatClassification
from cognoscope.infrastructure.models import (
    Annotation,
    AnnotationRepairDecision,
    AnnotationRevision,
    AnnotationSelectorBundle,
    AdmittedAsset,
    AuthorityGeneration,
    BibliographicRecord,
    BibliographicRevision,
    BlobRecord,
    BlobState,
    DocumentRevision,
    DurableJob,
    EventConsumerReceipt,
    ExtractionBibliographicCandidate,
    ExtractionBlock,
    ExtractionEvidenceSummary,
    ExtractionFinding,
    ExtractionPage,
    ExtractionPart,
    ExtractionRepairCandidate,
    ExtractionRun,
    ExtractionRunDiff,
    KnowledgeEvidenceLink,
    KnowledgeItem,
    KnowledgeReviewDecision,
    KnowledgeRevision,
    KnowledgeThreshold,
    ResearchPreference,
    ExtractionSpan,
    LibraryDocument,
    LibraryProject,
    OutboxEvent,
    ProjectRevision,
    ProvenanceEvent,
    new_id,
    utcnow,
)
from cognoscope.infrastructure.storage import BlobHandle


_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_AUTHORITY_MODELS = (
    AuthorityGeneration,
    LibraryProject,
    ProjectRevision,
    LibraryDocument,
    DocumentRevision,
    BlobRecord,
    AdmittedAsset,
    DurableJob,
    BibliographicRecord,
    BibliographicRevision,
    ExtractionRun,
    ExtractionPart,
    ExtractionPage,
    ExtractionBlock,
    ExtractionSpan,
    ExtractionBibliographicCandidate,
    ExtractionFinding,
    ExtractionEvidenceSummary,
    ExtractionRunDiff,
    ExtractionRepairCandidate,
    Annotation,
    AnnotationRevision,
    AnnotationSelectorBundle,
    AnnotationRepairDecision,
    KnowledgeItem,
    KnowledgeRevision,
    KnowledgeEvidenceLink,
    KnowledgeReviewDecision,
    KnowledgeThreshold,
    ResearchPreference,
    OutboxEvent,
    EventConsumerReceipt,
    ProvenanceEvent,
)
_DELETE_ORDER = tuple(reversed(_AUTHORITY_MODELS[1:]))


@dataclass(frozen=True)
class AuthoritySnapshot:
    generation: int
    dump: dict[str, Any]
    blobs: tuple[BlobHandle, ...]


class KnowledgeConflictError(ValueError):
    pass



class AnnotationConflictError(ValueError):
    pass

class AuthorityRepository:
    """Makes authority writes transactional; callers never persist upload paths."""

    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._session_factory = session_factory

    async def admit_asset(
        self,
        *,
        owner_account_id: str,
        project_title: str,
        document_title: str,
        blob: BlobHandle,
        classification: FormatClassification,
    ) -> tuple[str, int]:
        async with self._session_factory() as session, session.begin():
            generation_state = await self._lock_generation(session)
            project = await self._project_for_title(session, owner_account_id, project_title)
            if project is None:
                project = LibraryProject(id=new_id(), owner_account_id=owner_account_id)
                session.add(project)
                await session.flush()
                session.add(ProjectRevision(id=new_id(), project_id=project.id, revision=1, title=project_title))
                await session.flush()

            document = LibraryDocument(id=new_id(), project_id=project.id)
            document_revision = DocumentRevision(id=new_id(), document_id=document.id, revision=1, title=document_title)
            session.add(document)
            await session.flush()
            session.add(document_revision)
            await session.flush()
            record = await session.get(BlobRecord, blob.digest)
            if record is None:
                session.add(BlobRecord(digest=blob.digest, byte_size=blob.byte_size, state=BlobState.COMMITTED.value))
                await session.flush()
            elif record.byte_size != blob.byte_size:
                raise ValueError("content-addressed blob size does not match authority record")
            elif record.state != BlobState.COMMITTED.value:
                record.state = BlobState.COMMITTED.value

            session.add(
                AdmittedAsset(
                    id=new_id(),
                    document_revision_id=document_revision.id,
                    blob_digest=blob.digest,
                    detected_format=classification.format.value,
                    format_tier=classification.tier.value,
                    media_type=classification.media_type,
                )
            )
            session.add(
                ProvenanceEvent(
                    id=new_id(),
                    subject_type="document_revision",
                    subject_id=document_revision.id,
                    activity="asset_admitted",
                    input_digest=blob.digest,
                    output_digest=blob.digest,
                    actor=owner_account_id,
                    details_json=self._canonical_json(
                        {
                            "format": classification.format.value,
                            "format_tier": classification.tier.value,
                            "media_type": classification.media_type,
                        }
                    ),
                )
            )
            await session.flush()
            generation_state.generation += 1
            return document.id, generation_state.generation

    async def admitted_asset_id_for_document(self, *, owner_account_id: str, document_id: str) -> str:
        async with self._session_factory() as session:
            asset = await session.scalar(
                select(AdmittedAsset)
                .join(DocumentRevision, DocumentRevision.id == AdmittedAsset.document_revision_id)
                .join(LibraryDocument, LibraryDocument.id == DocumentRevision.document_id)
                .join(LibraryProject, LibraryProject.id == LibraryDocument.project_id)
                .where(
                    DocumentRevision.document_id == document_id,
                    LibraryProject.owner_account_id == owner_account_id,
                )
            )
            if asset is None:
                raise ValueError("admitted asset does not exist")
            return asset.id

    async def owned_asset_blob(self, *, owner_account_id: str, asset_id: str) -> tuple[AdmittedAsset, BlobRecord, DocumentRevision]:
        async with self._session_factory() as session:
            row = await session.execute(
                select(AdmittedAsset, BlobRecord, DocumentRevision)
                .join(BlobRecord, BlobRecord.digest == AdmittedAsset.blob_digest)
                .join(DocumentRevision, DocumentRevision.id == AdmittedAsset.document_revision_id)
                .join(LibraryDocument, LibraryDocument.id == DocumentRevision.document_id)
                .join(LibraryProject, LibraryProject.id == LibraryDocument.project_id)
                .where(AdmittedAsset.id == asset_id, LibraryProject.owner_account_id == owner_account_id)
            )
            owned = row.one_or_none()
            if owned is None:
                raise ValueError("asset not found")
            return owned

    async def revise_project(self, project_id: str, title: str, *, actor: str) -> ProjectRevision:
        self._require_title(title)
        async with self._session_factory() as session, session.begin():
            generation_state = await self._lock_generation(session)
            previous = await self._latest_revision(session, ProjectRevision, ProjectRevision.project_id, project_id)
            if previous is None:
                raise ValueError("project does not exist")
            revision = ProjectRevision(
                id=new_id(),
                project_id=project_id,
                revision=previous.revision + 1,
                title=title,
                supersedes_revision_id=previous.id,
            )
            session.add(revision)
            session.add(self._provenance(revision.id, "project_revision", "project_revised", actor, {"supersedes": previous.id}))
            generation_state.generation += 1
            return revision

    async def revise_document(self, document_id: str, title: str, *, actor: str) -> DocumentRevision:
        self._require_title(title)
        async with self._session_factory() as session, session.begin():
            generation_state = await self._lock_generation(session)
            previous = await self._latest_revision(session, DocumentRevision, DocumentRevision.document_id, document_id)
            if previous is None:
                raise ValueError("document does not exist")
            revision = DocumentRevision(
                id=new_id(),
                document_id=document_id,
                revision=previous.revision + 1,
                title=title,
                supersedes_revision_id=previous.id,
            )
            session.add(revision)
            session.add(self._provenance(revision.id, "document_revision", "document_revised", actor, {"supersedes": previous.id}))
            generation_state.generation += 1
            return revision

    async def add_bibliography(self, document_id: str, csl_json: dict[str, Any]) -> BibliographicRecord:
        normalized = self._canonical_json(csl_json)
        async with self._session_factory() as session, session.begin():
            generation_state = await self._lock_generation(session)
            if await session.get(LibraryDocument, document_id) is None:
                raise ValueError("document does not exist")
            record = BibliographicRecord(id=new_id(), document_id=document_id)
            revision = BibliographicRevision(
                id=new_id(),
                bibliographic_record_id=record.id,
                revision=1,
                csl_json=normalized,
            )
            session.add_all((record, revision))
            session.add(
                self._provenance(
                    revision.id,
                    "bibliographic_revision",
                    "bibliography_recorded",
                    "library",
                    {"document_id": document_id},
                )
            )
            generation_state.generation += 1
            return record

    async def revise_bibliography(self, record_id: str, csl_json: dict[str, Any], *, actor: str) -> BibliographicRevision:
        normalized = self._canonical_json(csl_json)
        async with self._session_factory() as session, session.begin():
            generation_state = await self._lock_generation(session)
            previous = await self._latest_revision(
                session,
                BibliographicRevision,
                BibliographicRevision.bibliographic_record_id,
                record_id,
            )
            if previous is None:
                raise ValueError("bibliographic record does not exist")
            revision = BibliographicRevision(
                id=new_id(),
                bibliographic_record_id=record_id,
                revision=previous.revision + 1,
                csl_json=normalized,
                supersedes_revision_id=previous.id,
            )
            session.add(
                self._provenance(
                    revision.id,
                    "bibliographic_revision",
                    "bibliography_revised",
                    actor,
                    {"supersedes": previous.id},
                )
            )
            generation_state.generation += 1
            return revision
    async def create_annotation(self, *, owner_account_id: str, asset_id: str, source_run_id: str, kind: str, body: str, tags: list[str], signals: dict[str, Any], selectors: dict[str, Any]) -> Annotation:
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            asset = await self._owned_asset(session, owner_account_id, asset_id)
            self._validate_annotation_content(kind, body, tags, signals)
            bundle = await self._selector_values(session, asset, source_run_id, kind, selectors)
            annotation = Annotation(id=new_id(), owner_account_id=owner_account_id, asset_id=asset_id)
            revision = AnnotationRevision(id=new_id(), annotation_id=annotation.id, revision=1, state="active", kind=kind, body=body, tags_json=self._canonical_json(tags), signals_json=self._canonical_json(signals), source_run_id=source_run_id)
            session.add_all((annotation, revision, AnnotationSelectorBundle(id=new_id(), annotation_revision_id=revision.id, **bundle)))
            session.add(self._provenance(revision.id, "annotation_revision", "annotation_created", owner_account_id, {"annotation_id": annotation.id}))
            generation.generation += 1
            return annotation

    async def append_annotation_revision(self, *, owner_account_id: str, annotation_id: str, expected_revision: int, body: str | None = None, tags: list[str] | None = None, signals: dict[str, Any] | None = None, selectors: dict[str, Any] | None = None, tombstone: bool = False, restore: bool = False) -> AnnotationRevision:
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            annotation, previous = await self._owned_annotation(session, owner_account_id, annotation_id)
            if previous.revision != expected_revision:
                raise AnnotationConflictError("annotation revision conflict")
            if restore and previous.state != "tombstoned":
                raise ValueError("only a tombstoned annotation can be restored")
            if tombstone and previous.state == "tombstoned":
                raise ValueError("annotation is already tombstoned")
            values = await self._revision_values(session, annotation, previous, body, tags, signals, selectors)
            bundle = values.pop("bundle")
            revision = AnnotationRevision(id=new_id(), annotation_id=annotation.id, revision=previous.revision + 1, state="tombstoned" if tombstone else "active", supersedes_revision_id=previous.id, **values)
            session.add_all((revision, AnnotationSelectorBundle(id=new_id(), annotation_revision_id=revision.id, **bundle)))
            activity = "annotation_tombstoned" if tombstone else "annotation_restored" if restore else "annotation_revised"
            session.add(self._provenance(revision.id, "annotation_revision", activity, owner_account_id, {"supersedes": previous.id}))
            generation.generation += 1
            return revision

    async def decide_annotation_repair(self, *, owner_account_id: str, annotation_id: str, expected_revision: int, candidate_id: str, decision: str) -> AnnotationRepairDecision:
        if decision not in {"accepted", "rejected"}:
            raise ValueError("repair decision is invalid")
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            annotation, previous = await self._owned_annotation(session, owner_account_id, annotation_id)
            if previous.revision != expected_revision:
                raise AnnotationConflictError("annotation revision conflict")
            candidate = await session.get(ExtractionRepairCandidate, candidate_id)
            if candidate is None or candidate.previous_run_id != previous.source_run_id:
                raise ValueError("repair candidate is not valid for the annotation revision")
            selector = await self._selector_for_revision(session, previous.id)
            if selector.span_key is None or selector.span_key != candidate.old_span_key:
                raise ValueError("repair candidate does not match the annotation span anchor")
            target_run = await session.get(ExtractionRun, candidate.run_id)
            if target_run is None or target_run.asset_id != annotation.asset_id:
                raise ValueError("repair candidate target does not belong to annotation asset")
            if await session.scalar(select(AnnotationRepairDecision.id).where(AnnotationRepairDecision.annotation_id == annotation.id, AnnotationRepairDecision.candidate_id == candidate.id)):
                raise ValueError("repair candidate was already decided")
            accepted_revision_id: str | None = None
            if decision == "accepted":
                raw = json.loads(selector.selectors_json)
                target_span = await session.scalar(select(ExtractionSpan).where(ExtractionSpan.run_id == candidate.run_id, ExtractionSpan.key == candidate.new_span_key))
                if target_span is None:
                    raise ValueError("repair candidate target span is missing")
                raw.update({"span_key": target_span.key, "block_key": target_span.block_key})
                values = await self._revision_values(session, annotation, previous, None, None, None, raw, source_run_id=candidate.run_id)
                bundle = values.pop("bundle")
                accepted = AnnotationRevision(id=new_id(), annotation_id=annotation.id, revision=previous.revision + 1, state="active", supersedes_revision_id=previous.id, **values)
                session.add_all((accepted, AnnotationSelectorBundle(id=new_id(), annotation_revision_id=accepted.id, **bundle)))
                await session.flush()
                accepted_revision_id = accepted.id
                session.add(self._provenance(accepted.id, "annotation_revision", "annotation_repair_accepted", owner_account_id, {"candidate_id": candidate.id}))
            repair = AnnotationRepairDecision(id=new_id(), annotation_id=annotation.id, source_revision_id=previous.id, candidate_id=candidate.id, decision=decision, accepted_revision_id=accepted_revision_id)
            session.add(repair)
            session.add(self._provenance(repair.id, "annotation_repair_decision", f"annotation_repair_{decision}", owner_account_id, {"candidate_id": candidate.id}))
            generation.generation += 1
            return repair

    async def annotation_view(self, *, owner_account_id: str, annotation_id: str) -> dict[str, Any]:
        async with self._session_factory() as session:
            annotation, revision = await self._owned_annotation(session, owner_account_id, annotation_id)
            return await self._annotation_view(session, annotation, revision)

    async def list_annotations(self, *, owner_account_id: str, include_tombstoned: bool = False) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            annotations = (await session.scalars(select(Annotation).where(Annotation.owner_account_id == owner_account_id).order_by(Annotation.created_at, Annotation.id))).all()
            result: list[dict[str, Any]] = []
            for annotation in annotations:
                revision = await self._latest_revision(session, AnnotationRevision, AnnotationRevision.annotation_id, annotation.id)
                if revision is not None and (include_tombstoned or revision.state == "active"):
                    result.append(await self._annotation_view(session, annotation, revision))
            return result

    async def annotation_export(self, *, owner_account_id: str, annotation_id: str) -> dict[str, Any]:
        async with self._session_factory() as session:
            annotation, latest = await self._owned_annotation(session, owner_account_id, annotation_id)
            revisions = (await session.scalars(select(AnnotationRevision).where(AnnotationRevision.annotation_id == annotation.id).order_by(AnnotationRevision.revision, AnnotationRevision.id))).all()
            revision_rows = []
            for revision in revisions:
                row = await self._annotation_view(session, annotation, revision)
                row = {key: value for key, value in row.items() if key not in {"id", "asset_id"}}
                row["supersedes_revision_id"] = revision.supersedes_revision_id
                revision_rows.append(row)
            decisions = (await session.scalars(select(AnnotationRepairDecision).where(AnnotationRepairDecision.annotation_id == annotation.id).order_by(AnnotationRepairDecision.created_at, AnnotationRepairDecision.id))).all()
            subjects = [revision.id for revision in revisions] + [decision.id for decision in decisions]
            provenance = (await session.scalars(select(ProvenanceEvent).where(ProvenanceEvent.subject_id.in_(subjects)).order_by(ProvenanceEvent.created_at, ProvenanceEvent.id))).all()
            return {
                "annotation": {"id": annotation.id, "asset_id": annotation.asset_id, "owner_account_id": annotation.owner_account_id, "created_at": annotation.created_at},
                "latest_revision_id": latest.id,
                "revisions": revision_rows,
                "repair_decisions": [
                    {"id": decision.id, "source_revision_id": decision.source_revision_id, "candidate_id": decision.candidate_id, "decision": decision.decision, "accepted_revision_id": decision.accepted_revision_id, "created_at": decision.created_at}
                    for decision in decisions
                ],
                "provenance": [self._row(event) | {"details": json.loads(event.details_json)} for event in provenance],
            }

    async def repair_queue(self, *, owner_account_id: str) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            rows: list[dict[str, Any]] = []
            annotations = (await session.scalars(select(Annotation).where(Annotation.owner_account_id == owner_account_id))).all()
            for annotation in annotations:
                latest = await self._latest_revision(session, AnnotationRevision, AnnotationRevision.annotation_id, annotation.id)
                if latest is None or latest.state != "active":
                    continue
                selector = await self._selector_for_revision(session, latest.id)
                candidates = await session.scalars(select(ExtractionRepairCandidate).where(ExtractionRepairCandidate.previous_run_id == latest.source_run_id))
                for candidate in candidates:
                    target = await session.get(ExtractionRun, candidate.run_id)
                    decided = await session.scalar(select(AnnotationRepairDecision.id).where(AnnotationRepairDecision.annotation_id == annotation.id, AnnotationRepairDecision.candidate_id == candidate.id))
                    if selector.span_key == candidate.old_span_key and target is not None and target.asset_id == annotation.asset_id and decided is None:
                        rows.append({"annotation_id": annotation.id, "expected_revision": latest.revision, "candidate_id": candidate.id, "source_run_id": candidate.previous_run_id, "target_run_id": candidate.run_id, "old_span_key": candidate.old_span_key, "new_span_key": candidate.new_span_key, "score": candidate.score})
            return sorted(rows, key=lambda row: (row["annotation_id"], row["candidate_id"]))
    async def knowledge_threshold(self, *, owner_account_id: str, task_type: str) -> KnowledgeThreshold | None:
        async with self._session_factory() as session:
            return await session.scalar(select(KnowledgeThreshold).where(KnowledgeThreshold.owner_account_id == owner_account_id, KnowledgeThreshold.task_type == task_type))
    async def set_knowledge_threshold(self, *, owner_account_id: str, task_type: str, minimum_confidence: float) -> KnowledgeThreshold:
        if not task_type.strip() or not 0 <= minimum_confidence <= 1:
            raise ValueError("knowledge threshold is invalid")
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            threshold = await session.scalar(select(KnowledgeThreshold).where(KnowledgeThreshold.owner_account_id == owner_account_id, KnowledgeThreshold.task_type == task_type))
            if threshold is None:
                threshold = KnowledgeThreshold(id=new_id(), owner_account_id=owner_account_id, task_type=task_type, minimum_confidence=minimum_confidence)
                session.add(threshold)
            else:
                threshold.minimum_confidence = minimum_confidence
            session.add(self._provenance(threshold.id, "knowledge_threshold", "knowledge_threshold_configured", owner_account_id, {"task_type": task_type}))
            generation.generation += 1
            return threshold
 
    async def list_research_preferences(self, *, owner_account_id: str) -> list[ResearchPreference]:
        async with self._session_factory() as session:
            rows = await session.scalars(
                select(ResearchPreference)
                .where(ResearchPreference.owner_account_id == owner_account_id)
                .order_by(ResearchPreference.annotation_id, ResearchPreference.id)
            )
            return list(rows)

    async def research_preference(self, *, owner_account_id: str, annotation_id: str) -> ResearchPreference | None:
        async with self._session_factory() as session:
            annotation = await session.scalar(select(Annotation).where(Annotation.id == annotation_id, Annotation.owner_account_id == owner_account_id))
            if annotation is None:
                raise ValueError("annotation not found")
            return await session.scalar(
                select(ResearchPreference).where(
                    ResearchPreference.owner_account_id == owner_account_id,
                    ResearchPreference.annotation_id == annotation_id,
                )
            )

    async def set_research_preference(self, *, owner_account_id: str, annotation_id: str, annotation_weight: float, highlight: bool) -> ResearchPreference:
        if type(annotation_weight) not in {int, float} or not -1 <= annotation_weight <= 1 or type(highlight) is not bool:
            raise ValueError("research preference is invalid")
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            annotation = await session.scalar(select(Annotation).where(Annotation.id == annotation_id, Annotation.owner_account_id == owner_account_id))
            if annotation is None:
                raise ValueError("annotation not found")
            preference = await session.scalar(
                select(ResearchPreference).where(
                    ResearchPreference.owner_account_id == owner_account_id,
                    ResearchPreference.annotation_id == annotation_id,
                )
            )
            if preference is None:
                preference = ResearchPreference(id=new_id(), owner_account_id=owner_account_id, annotation_id=annotation_id)
                session.add(preference)
            preference.annotation_weight = float(annotation_weight)
            preference.highlight = highlight
            await session.flush()
            session.add(self._provenance(preference.id, "research_preference", "research_preference_configured", owner_account_id, {"annotation_id": annotation_id}))
            generation.generation += 1
            return preference
 
    async def create_knowledge(self, *, owner_account_id: str, asset_id: str, source_run_id: str, kind: str, content: dict[str, Any], confidence: float, producer_kind: str, producer_id: str | None, task_type: str, evidence: list[dict[str, Any]]) -> KnowledgeItem:
        self._validate_knowledge_content(kind, content, confidence, producer_kind, producer_id, task_type)
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            asset = await self._owned_asset(session, owner_account_id, asset_id)
            await self._validate_knowledge_run(session, asset, source_run_id)
            links = await self._knowledge_evidence_values(session, owner_account_id, asset, evidence)
            threshold = await session.scalar(select(KnowledgeThreshold).where(KnowledgeThreshold.owner_account_id == owner_account_id, KnowledgeThreshold.task_type == task_type))
            status = "accepted" if threshold is not None and confidence >= threshold.minimum_confidence else "proposed"
            if status == "accepted":
                self._validate_strong_evidence(kind, links)
            item = KnowledgeItem(id=new_id(), owner_account_id=owner_account_id, asset_id=asset.id)
            revision = KnowledgeRevision(id=new_id(), knowledge_item_id=item.id, revision=1, status=status, kind=kind, content_json=self._canonical_json(content), confidence=confidence, producer_kind=producer_kind, producer_id=producer_id, task_type=task_type, source_run_id=source_run_id)
            activity = "knowledge_auto_accepted" if status == "accepted" else "knowledge_proposed"
            session.add_all((item, revision))
            await session.flush()
            session.add_all(KnowledgeEvidenceLink(id=new_id(), knowledge_revision_id=revision.id, **link) for link in links)
            session.add(self._provenance(revision.id, "knowledge_revision", activity, owner_account_id, {"producer_kind": producer_kind, "task_type": task_type}))
            generation.generation += 1
            return item

    async def knowledge_view(self, *, owner_account_id: str, knowledge_id: str) -> dict[str, Any]:
        async with self._session_factory() as session:
            item, revision = await self._owned_knowledge(session, owner_account_id, knowledge_id)
            return await self._knowledge_view(session, item, revision)

    async def list_knowledge(self, *, owner_account_id: str, status: str | None = None) -> list[dict[str, Any]]:
        async with self._session_factory() as session:
            items = (await session.scalars(select(KnowledgeItem).where(KnowledgeItem.owner_account_id == owner_account_id).order_by(KnowledgeItem.created_at, KnowledgeItem.id))).all()
            result: list[dict[str, Any]] = []
            for item in items:
                revision = await self._latest_revision(session, KnowledgeRevision, KnowledgeRevision.knowledge_item_id, item.id)
                if revision is not None and (status is None or revision.status == status):
                    result.append(await self._knowledge_view(session, item, revision))
            return result

    async def review_queue(self, *, owner_account_id: str) -> list[dict[str, Any]]:
        return await self.list_knowledge(owner_account_id=owner_account_id, status="proposed")

    async def review_knowledge(self, *, owner_account_id: str, knowledge_id: str, action: str, expected_revision: int, content: dict[str, Any] | None = None, evidence: list[dict[str, Any]] | None = None, target_revision: int | None = None, related_item_ids: list[str] | None = None, split_contents: list[dict[str, Any]] | None = None) -> KnowledgeRevision:
        if action not in {"accept", "edit_accept", "reject", "merge", "split", "relink_evidence", "reverse", "supersede"}:
            raise ValueError("knowledge review action is invalid")
        async with self._session_factory() as session, session.begin():
            generation = await self._lock_generation(session)
            item, previous = await self._owned_knowledge(session, owner_account_id, knowledge_id)
            if previous.revision != expected_revision:
                raise KnowledgeConflictError("knowledge revision conflict")

            target = None
            if action == "reverse":
                if type(target_revision) is not int or target_revision <= 0:
                    raise ValueError("reverse target revision is required")
                target = await session.scalar(select(KnowledgeRevision).where(KnowledgeRevision.knowledge_item_id == item.id, KnowledgeRevision.revision == target_revision))
                if target is None:
                    raise ValueError("reverse target revision is invalid")
                if target.status != "accepted":
                    raise ValueError("reverse target revision is not active")

            values = self._knowledge_values(target or previous, None if target is not None else content)
            asset = await self._owned_asset(session, owner_account_id, item.asset_id)
            links = await self._knowledge_evidence_values(session, owner_account_id, asset, evidence) if evidence is not None else await self._knowledge_links(session, target.id if target is not None else previous.id)

            if action == "edit_accept" and content is None:
                raise ValueError("edited content is required")
            if action == "relink_evidence" and evidence is None:
                raise ValueError("evidence is required")

            related: list[tuple[KnowledgeItem, KnowledgeRevision]] = []
            if action == "merge":
                related = await self._validate_related_knowledge(session, owner_account_id, item.id, related_item_ids)

            if action == "split":
                if not isinstance(split_contents, list) or not split_contents or not all(isinstance(part, dict) and part for part in split_contents):
                    raise ValueError("split contents are required")
                for part in split_contents:
                    self._validate_knowledge_content(previous.kind, part, previous.confidence, previous.producer_kind, previous.producer_id, previous.task_type)
                if previous.status == "accepted":
                    self._validate_strong_evidence(previous.kind, links)

            status = {"accept": "accepted", "edit_accept": "accepted", "reject": "rejected", "supersede": "superseded"}.get(action, previous.status)
            if action == "reverse":
                status = "accepted"
            if action in {"merge", "relink_evidence"}:
                status = "accepted" if previous.status == "accepted" else "proposed"
            if action == "split":
                status = "superseded"
            if status == "accepted":
                self._validate_strong_evidence(values["kind"], links)

            revision_values = self._knowledge_values(previous, None) if action == "split" else values
            revision = KnowledgeRevision(id=new_id(), knowledge_item_id=item.id, revision=previous.revision + 1, status=status, supersedes_revision_id=previous.id, **revision_values)
            details: dict[str, Any] = {"supersedes": previous.id}
            session.add(revision)
            await session.flush()
            session.add_all(KnowledgeEvidenceLink(id=new_id(), knowledge_revision_id=revision.id, **link) for link in links)

            if target is not None:
                details["target_revision"] = target_revision
            if related:
                details["related_item_ids"] = sorted(related_item.id for related_item, _ in related)

            if action == "split":
                child_rows: list[tuple[KnowledgeItem, KnowledgeRevision]] = []
                for part in split_contents or []:
                    child = KnowledgeItem(id=new_id(), owner_account_id=item.owner_account_id, asset_id=item.asset_id)
                    child_revision = KnowledgeRevision(id=new_id(), knowledge_item_id=child.id, revision=1, status=previous.status, **self._knowledge_values(previous, part))
                    child_rows.append((child, child_revision))
                    session.add_all((child, child_revision))
                await session.flush()
                for child, child_revision in child_rows:
                    session.add_all(KnowledgeEvidenceLink(id=new_id(), knowledge_revision_id=child_revision.id, **link) for link in links)
                    session.add(self._provenance(child_revision.id, "knowledge_revision", "knowledge_split_child", owner_account_id, {"parent_item_id": item.id, "parent_revision_id": previous.id}))
                details["split_contents"] = split_contents
                details["child_item_ids"] = [child.id for child, _ in child_rows]
                details["child_revision_ids"] = [child_revision.id for _, child_revision in child_rows]

            decision = KnowledgeReviewDecision(id=new_id(), knowledge_item_id=item.id, source_revision_id=previous.id, result_revision_id=revision.id, action=action, actor_account_id=owner_account_id, details_json=self._canonical_json(details))
            session.add_all((decision, self._provenance(revision.id, "knowledge_revision", f"knowledge_{action}", owner_account_id, {"supersedes": previous.id}), self._provenance(decision.id, "knowledge_review_decision", f"knowledge_{action}", owner_account_id, {"knowledge_id": item.id})))

            if action == "merge":
                for related_item, related_previous in sorted(related, key=lambda pair: pair[0].id):
                    related_revision = KnowledgeRevision(id=new_id(), knowledge_item_id=related_item.id, revision=related_previous.revision + 1, status="superseded", supersedes_revision_id=related_previous.id, **self._knowledge_values(related_previous, None))
                    session.add(related_revision)
                    await session.flush()
                    related_links = await self._knowledge_links(session, related_previous.id)
                    session.add_all(KnowledgeEvidenceLink(id=new_id(), knowledge_revision_id=related_revision.id, **link) for link in related_links)
                    related_decision = KnowledgeReviewDecision(id=new_id(), knowledge_item_id=related_item.id, source_revision_id=related_previous.id, result_revision_id=related_revision.id, action="supersede", actor_account_id=owner_account_id, details_json=self._canonical_json({"primary_item_id": item.id, "primary_revision_id": revision.id, "supersedes": related_previous.id}))
                    session.add_all((related_decision, self._provenance(related_revision.id, "knowledge_revision", "knowledge_supersede", owner_account_id, {"supersedes": related_previous.id, "primary_item_id": item.id, "primary_revision_id": revision.id}), self._provenance(related_decision.id, "knowledge_review_decision", "knowledge_supersede", owner_account_id, {"knowledge_id": related_item.id, "primary_item_id": item.id, "primary_revision_id": revision.id})))

            generation.generation += 1
            return revision

    async def knowledge_export(self, *, owner_account_id: str, knowledge_id: str) -> dict[str, Any]:
        async with self._session_factory() as session:
            item, latest = await self._owned_knowledge(session, owner_account_id, knowledge_id)
            revisions = (await session.scalars(select(KnowledgeRevision).where(KnowledgeRevision.knowledge_item_id == item.id).order_by(KnowledgeRevision.revision, KnowledgeRevision.id))).all()
            decisions = (await session.scalars(select(KnowledgeReviewDecision).where(KnowledgeReviewDecision.knowledge_item_id == item.id).order_by(KnowledgeReviewDecision.created_at, KnowledgeReviewDecision.id))).all()
            revision_rows = []
            for revision in revisions:
                row = await self._knowledge_view(session, item, revision)
                row["supersedes_revision_id"] = revision.supersedes_revision_id
                revision_rows.append(row)
            subjects = [revision.id for revision in revisions] + [decision.id for decision in decisions]
            provenance = (await session.scalars(select(ProvenanceEvent).where(ProvenanceEvent.subject_id.in_(subjects)).order_by(ProvenanceEvent.created_at, ProvenanceEvent.id))).all()
            return {"knowledge": {"id": item.id, "asset_id": item.asset_id, "owner_account_id": item.owner_account_id, "created_at": item.created_at}, "latest_revision_id": latest.id, "revisions": revision_rows, "review_decisions": [{"id": decision.id, "source_revision_id": decision.source_revision_id, "result_revision_id": decision.result_revision_id, "action": decision.action, "actor_account_id": decision.actor_account_id, "details": json.loads(decision.details_json), "created_at": decision.created_at} for decision in decisions], "provenance": [self._row(event) | {"details": json.loads(event.details_json)} for event in provenance]}

    @staticmethod
    def _validate_knowledge_content(kind: str, content: dict[str, Any], confidence: float, producer_kind: str, producer_id: str | None, task_type: str) -> None:
        if kind not in {"summary", "concept", "claim", "relation", "finding", "preference"} or not isinstance(content, dict) or not content or type(confidence) not in {int, float} or not 0 <= confidence <= 1 or producer_kind not in {"user", "agent"} or not isinstance(task_type, str) or not task_type.strip() or (producer_kind == "agent" and (not isinstance(producer_id, str) or not producer_id.strip())):
            raise ValueError("knowledge proposal is invalid")

    async def _validate_knowledge_run(self, session: Any, asset: AdmittedAsset, source_run_id: str) -> None:
        run = await session.get(ExtractionRun, source_run_id)
        if run is None or run.asset_id != asset.id:
            raise ValueError("knowledge source run is invalid")

    async def _knowledge_evidence_values(self, session: Any, owner_account_id: str, asset: AdmittedAsset, evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(evidence, list) or not evidence:
            raise ValueError("knowledge evidence is required")
        values: list[dict[str, Any]] = []
        for link in evidence:
            if not isinstance(link, dict) or set(link) != {"source_category", "source_id", "source_run_id", "source_version", "locator", "role"} or link["source_category"] not in {"extraction_run", "annotation"} or link["role"] not in {"support", "counter", "comparison"} or not all(isinstance(link[key], str) and link[key].strip() for key in ("source_id", "source_run_id", "source_version", "locator")):
                raise ValueError("knowledge evidence is invalid")
            await self._validate_knowledge_run(session, asset, link["source_run_id"])
            if link["source_category"] == "extraction_run":
                run = await session.get(ExtractionRun, link["source_id"])
                if run is None or run.id != link["source_run_id"] or run.asset_id != asset.id:
                    raise ValueError("knowledge evidence reference is invalid")
            else:
                annotation, annotation_revision = await self._owned_annotation(session, owner_account_id, link["source_id"])
                if annotation.asset_id != asset.id or annotation_revision.source_run_id != link["source_run_id"]:
                    raise ValueError("knowledge evidence reference is invalid")
            values.append({key: link[key] for key in ("source_category", "source_id", "source_run_id", "source_version", "locator", "role")})
        return values

    @staticmethod
    def _validate_strong_evidence(kind: str, evidence: list[dict[str, Any]]) -> None:
        if kind in {"claim", "relation"} and (not any(link["role"] == "support" for link in evidence) or not any(link["role"] in {"counter", "comparison"} for link in evidence)):
            raise ValueError("strong knowledge requires support and comparison evidence")

    @staticmethod
    def _knowledge_values(revision: KnowledgeRevision, content: dict[str, Any] | None) -> dict[str, Any]:
        if content is not None:
            AuthorityRepository._validate_knowledge_content(revision.kind, content, revision.confidence, revision.producer_kind, revision.producer_id, revision.task_type)
        return {"kind": revision.kind, "content_json": AuthorityRepository._canonical_json(content) if content is not None else revision.content_json, "confidence": revision.confidence, "producer_kind": revision.producer_kind, "producer_id": revision.producer_id, "task_type": revision.task_type, "source_run_id": revision.source_run_id}

    async def _knowledge_links(self, session: Any, revision_id: str) -> list[dict[str, Any]]:
        links = (await session.scalars(select(KnowledgeEvidenceLink).where(KnowledgeEvidenceLink.knowledge_revision_id == revision_id).order_by(KnowledgeEvidenceLink.created_at, KnowledgeEvidenceLink.id))).all()
        return [{key: getattr(link, key) for key in ("source_category", "source_id", "source_run_id", "source_version", "locator", "role")} for link in links]

    async def _owned_knowledge(self, session: Any, owner_account_id: str, knowledge_id: str) -> tuple[KnowledgeItem, KnowledgeRevision]:
        item = await session.scalar(select(KnowledgeItem).where(KnowledgeItem.id == knowledge_id, KnowledgeItem.owner_account_id == owner_account_id))
        if item is None:
            raise ValueError("knowledge not found")
        await self._owned_asset(session, owner_account_id, item.asset_id)
        revision = await self._latest_revision(session, KnowledgeRevision, KnowledgeRevision.knowledge_item_id, item.id)
        if revision is None:
            raise ValueError("knowledge not found")
        return item, revision

    async def _validate_related_knowledge(self, session: Any, owner_account_id: str, primary_item_id: str, related_item_ids: list[str] | None) -> list[tuple[KnowledgeItem, KnowledgeRevision]]:
        if not isinstance(related_item_ids, list) or not related_item_ids or any(not isinstance(item_id, str) or not item_id.strip() for item_id in related_item_ids) or len(set(related_item_ids)) != len(related_item_ids):
            raise ValueError("related knowledge items are invalid")
        if primary_item_id in related_item_ids:
            raise ValueError("related knowledge items are invalid")
        related: list[tuple[KnowledgeItem, KnowledgeRevision]] = []
        for item_id in related_item_ids:
            related.append(await self._owned_knowledge(session, owner_account_id, item_id))
        return related

    async def _knowledge_view(self, session: Any, item: KnowledgeItem, revision: KnowledgeRevision) -> dict[str, Any]:
        return {"id": item.id, "asset_id": item.asset_id, "revision_id": revision.id, "revision": revision.revision, "status": revision.status, "kind": revision.kind, "content": json.loads(revision.content_json), "confidence": revision.confidence, "producer_kind": revision.producer_kind, "producer_id": revision.producer_id, "task_type": revision.task_type, "source_run_id": revision.source_run_id, "evidence": await self._knowledge_links(session, revision.id), "created_at": revision.created_at}



    async def bibliography_csl(self, record_id: str) -> dict[str, Any]:
        async with self._session_factory() as session:
            revision = await self._latest_revision(
                session,
                BibliographicRevision,
                BibliographicRevision.bibliographic_record_id,
                record_id,
            )
            if revision is None:
                raise ValueError("bibliographic record does not exist")
            parsed = json.loads(revision.csl_json)
            if not isinstance(parsed, dict):
                raise ValueError("bibliographic authority is malformed")
            return parsed

    async def active_blob_refs(self) -> tuple[BlobHandle, ...]:
        async with self._session_factory() as session:
            return await self._active_blob_refs(session)

    async def active_blob_reference_sizes(self) -> dict[str, int]:
        return {blob.digest: blob.byte_size for blob in await self.active_blob_refs()}

    async def mark_blobs_unavailable(self, digests: Sequence[str]) -> None:
        if not digests:
            return
        async with self._session_factory() as session, session.begin():
            generation_state = await self._lock_generation(session)
            changed = False
            for digest in digests:
                record = await session.get(BlobRecord, digest)
                if record is not None and record.state == BlobState.COMMITTED.value:
                    record.state = BlobState.MISSING.value
                    changed = True
            if changed:
                generation_state.generation += 1

    async def snapshot_authority(self) -> AuthoritySnapshot:
        """Capture one consistent committed authority and recovery-state snapshot."""

        async with self._session_factory() as session, session.begin():
            if session.bind is not None and session.bind.dialect.name == "postgresql":
                await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            await self._lock_generation(session)
            dump = await self._dump_authority(session)
            blobs = await self._active_blob_refs(session)
            self.validate_snapshot_blob_refs(dump, blobs)
            return AuthoritySnapshot(generation=dump["generation"], dump=dump, blobs=blobs)

    async def dump_authority(self) -> dict[str, Any]:
        return (await self.snapshot_authority()).dump

    async def restore_authority(self, dump: dict[str, Any]) -> int:
        tables = self._validated_tables(dump)
        self.snapshot_blob_refs_from_dump(dump)
        generation = dump["generation"]
        async with self._session_factory() as session, session.begin():
            state = await self._lock_generation(session)
            await self._clear_authority(session)
            await self._restore_rows(session, tables)
            await session.execute(
                update(DurableJob)
                .where(DurableJob.state == JobState.RUNNING.value)
                .values(lease_token=None, lease_expires_at=None, lease_fence=DurableJob.lease_fence + 1)
            )
            state.recovery_required = True
            await session.execute(
                update(OutboxEvent)
                .where(OutboxEvent.status == OutboxStatus.LEASED.value)
                .values(lease_token=None, lease_expires_at=None, lease_fence=OutboxEvent.lease_fence + 1)
            )
            state.generation = generation
            return generation

    @classmethod
    def snapshot_blob_refs_from_dump(cls, dump: dict[str, Any]) -> tuple[BlobHandle, ...]:
        tables = cls._validated_tables(dump)
        records: dict[str, int] = {}
        committed: set[str] = set()
        for row in tables[BlobRecord.__tablename__]:
            digest = row.get("digest")
            byte_size = row.get("byte_size")
            state = row.get("state")
            if not isinstance(digest, str) or not _DIGEST.fullmatch(digest) or type(byte_size) is not int or byte_size < 0:
                raise ValueError("authority blob record is invalid")
            if state not in {item.value for item in BlobState} or digest in records:
                raise ValueError("authority blob record is invalid")
            records[digest] = byte_size
            if state == BlobState.COMMITTED.value:
                committed.add(digest)

        referenced: set[str] = set()
        for row in tables[AdmittedAsset.__tablename__]:
            digest = row.get("blob_digest")
            if not isinstance(digest, str) or digest not in records or digest not in committed:
                raise ValueError("authority asset blob reference is invalid")
            referenced.add(digest)

        if committed != referenced:
            raise ValueError("authority contains an unreferenced committed blob")
        return tuple(BlobHandle(digest, records[digest]) for digest in sorted(referenced))

    @classmethod
    def validate_snapshot_blob_refs(cls, dump: dict[str, Any], blobs: Sequence[BlobHandle]) -> None:
        expected = {(blob.digest, blob.byte_size) for blob in cls.snapshot_blob_refs_from_dump(dump)}
        actual = {(blob.digest, blob.byte_size) for blob in blobs}
        if len(actual) != len(blobs) or actual != expected:
            raise ValueError("manifest blob set does not match authority references")

    @staticmethod
    async def _clear_authority(session: Any) -> None:
        for model in (ProjectRevision, DocumentRevision, BibliographicRevision, AnnotationRevision, KnowledgeRevision):
            await session.execute(update(model).values(supersedes_revision_id=None))
        await session.flush()
        for model in _DELETE_ORDER:
            if model is ExtractionPart:
                await session.execute(update(ExtractionPart).values(parent_key=None))
                await session.flush()
            if model is ExtractionRun:
                await session.execute(update(ExtractionRun).values(supersedes_run_id=None))
                await session.flush()
            for row in (await session.scalars(select(model))).all():
                await session.delete(row)
            await session.flush()

    async def _restore_rows(self, session: Any, tables: dict[str, list[dict[str, Any]]]) -> None:
        await self._restore_model_rows(session, LibraryProject, tables)
        await self._restore_model_rows(session, KnowledgeThreshold, tables)
        await self._restore_revision_rows(session, ProjectRevision, tables)
        for model in (LibraryDocument,):
            await self._restore_model_rows(session, model, tables)
        await self._restore_revision_rows(session, DocumentRevision, tables)
        for model in (BlobRecord, AdmittedAsset, DurableJob, BibliographicRecord):
            await self._restore_model_rows(session, model, tables)
        await self._restore_revision_rows(session, BibliographicRevision, tables)
        await self._restore_revision_rows(session, ExtractionRun, tables, link_field="supersedes_run_id")
        await self._restore_part_rows(session, tables)
        for model in (
            ExtractionPage,
            ExtractionBlock,
            ExtractionSpan,
            ExtractionBibliographicCandidate,
            ExtractionFinding,
            ExtractionEvidenceSummary,
            ExtractionRunDiff,
            ExtractionRepairCandidate,
        ):
            await self._restore_model_rows(session, model, tables)
        await self._restore_model_rows(session, Annotation, tables)
        await self._restore_model_rows(session, KnowledgeItem, tables)
        await self._restore_revision_rows(session, KnowledgeRevision, tables)
        for model in (KnowledgeEvidenceLink, KnowledgeReviewDecision):
            await self._restore_model_rows(session, model, tables)
        await self._restore_model_rows(session, ResearchPreference, tables)
        await self._restore_revision_rows(session, AnnotationRevision, tables)
        for model in (AnnotationSelectorBundle, AnnotationRepairDecision, OutboxEvent, EventConsumerReceipt, ProvenanceEvent):
            await self._restore_model_rows(session, model, tables)

    @staticmethod
    async def _restore_model_rows(session: Any, model: Any, tables: dict[str, list[dict[str, Any]]]) -> None:
        session.add_all(model(**AuthorityRepository._decode_row(row)) for row in tables[model.__tablename__])
        await session.flush()

    @staticmethod
    async def _restore_part_rows(session: Any, tables: dict[str, list[dict[str, Any]]]) -> None:
        rows = [AuthorityRepository._decode_row(row) for row in tables[ExtractionPart.__tablename__]]
        by_key = {(row["run_id"], row["key"]): row for row in rows}
        ordered: list[dict[str, Any]] = []
        visited: set[tuple[str, str]] = set()
        for row in rows:
            chain: list[dict[str, Any]] = []
            current = row
            current_key = (current["run_id"], current["key"])
            while current_key not in visited:
                chain.append(current)
                parent_key = current["parent_key"]
                if parent_key is None or (current["run_id"], parent_key) in visited:
                    break
                current_key = (current["run_id"], parent_key)
                current = by_key[current_key]
            for item in reversed(chain):
                item_key = (item["run_id"], item["key"])
                if item_key not in visited:
                    visited.add(item_key)
                    ordered.append(item)
        session.add_all(ExtractionPart(**row) for row in ordered)
        await session.flush()

    @staticmethod
    async def _restore_revision_rows(
        session: Any,
        model: Any,
        tables: dict[str, list[dict[str, Any]]],
        *,
        link_field: str = "supersedes_revision_id",
    ) -> None:
        links: dict[str, str | None] = {}
        for row in tables[model.__tablename__]:
            values = AuthorityRepository._decode_row(row)
            links[values["id"]] = values.pop(link_field)
            session.add(model(**values))
        await session.flush()
        for row_id, linked_id in links.items():
            if linked_id is not None:
                restored = await session.get(model, row_id)
                assert restored is not None
                setattr(restored, link_field, linked_id)
        await session.flush()
    async def _project_for_title(self, session: Any, owner_account_id: str, title: str) -> LibraryProject | None:
        statement: Select[tuple[LibraryProject]] = (
            select(LibraryProject)
            .join(ProjectRevision, ProjectRevision.project_id == LibraryProject.id)
            .where(LibraryProject.owner_account_id == owner_account_id, ProjectRevision.title == title)
            .order_by(ProjectRevision.created_at.desc())
            .limit(1)
        )
        return await session.scalar(statement)

    async def _dump_authority(self, session: Any) -> dict[str, Any]:
        tables: dict[str, list[dict[str, Any]]] = {}
        for model in _AUTHORITY_MODELS:
            rows = (await session.scalars(select(model))).all()
            tables[model.__tablename__] = [self._row(row) for row in rows]
        generations = tables[AuthorityGeneration.__tablename__]
        generation = 0 if not generations else generations[0]["generation"]
        return {"generation": generation, "tables": tables}

    @staticmethod
    async def _active_blob_refs(session: Any) -> tuple[BlobHandle, ...]:
        result = await session.execute(
            select(BlobRecord)
            .join(AdmittedAsset, AdmittedAsset.blob_digest == BlobRecord.digest)
            .where(BlobRecord.state == BlobState.COMMITTED.value)
        )
        return tuple(sorted((BlobHandle(row.digest, row.byte_size) for row in result.scalars().unique()), key=lambda blob: blob.digest))

    @staticmethod
    async def _latest_revision(session: Any, model: Any, foreign_key: Any, parent_id: str) -> Any | None:
        return await session.scalar(select(model).where(foreign_key == parent_id).order_by(model.revision.desc()).limit(1))

    async def _owned_asset(self, session: Any, owner_account_id: str, asset_id: str) -> AdmittedAsset:
        asset = await session.scalar(
            select(AdmittedAsset)
            .join(DocumentRevision, DocumentRevision.id == AdmittedAsset.document_revision_id)
            .join(LibraryDocument, LibraryDocument.id == DocumentRevision.document_id)
            .join(LibraryProject, LibraryProject.id == LibraryDocument.project_id)
            .where(AdmittedAsset.id == asset_id, LibraryProject.owner_account_id == owner_account_id)
        )
        if asset is None:
            raise ValueError("annotation not found")
        return asset

    async def _owned_annotation(self, session: Any, owner_account_id: str, annotation_id: str) -> tuple[Annotation, AnnotationRevision]:
        annotation = await session.scalar(select(Annotation).where(Annotation.id == annotation_id, Annotation.owner_account_id == owner_account_id))
        if annotation is None:
            raise ValueError("annotation not found")
        await self._owned_asset(session, owner_account_id, annotation.asset_id)
        revision = await self._latest_revision(session, AnnotationRevision, AnnotationRevision.annotation_id, annotation.id)
        if revision is None:
            raise ValueError("annotation not found")
        return annotation, revision

    @staticmethod
    def _validate_annotation_content(kind: str, body: str, tags: list[str], signals: dict[str, Any]) -> None:
        if kind not in {"text", "region"} or not isinstance(body, str) or not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags) or not isinstance(signals, dict):
            raise ValueError("annotation content is invalid")

    async def _selector_values(self, session: Any, asset: AdmittedAsset, source_run_id: str, kind: str, selectors: dict[str, Any]) -> dict[str, Any]:
        run = await session.get(ExtractionRun, source_run_id)
        if run is None or run.asset_id != asset.id:
            raise ValueError("source extraction run does not belong to annotation asset")
        if not isinstance(selectors, dict):
            raise ValueError("selector bundle is invalid")
        normalized = dict(selectors)
        normalized["asset_fingerprint"] = asset.blob_digest
        normalized["source_run_id"] = source_run_id
        quote = normalized.get("quote")
        offsets = normalized.get("text_offsets")
        has_quote_offsets = isinstance(quote, dict) and isinstance(quote.get("exact"), str) and bool(quote["exact"]) and isinstance(offsets, dict) and type(offsets.get("start")) is int and type(offsets.get("end")) is int and offsets["start"] >= 0 and offsets["end"] >= offsets["start"]
        has_block_span = isinstance(normalized.get("block_key"), str) and bool(normalized["block_key"]) and isinstance(normalized.get("span_key"), str) and bool(normalized["span_key"])
        geometry = normalized.get("geometry")
        has_geometry = isinstance(geometry, dict) and all(type(geometry.get(key)) in {int, float} for key in ("x", "y", "width", "height")) and geometry["width"] > 0 and geometry["height"] > 0
        if (kind == "text" and not (has_quote_offsets or has_block_span)) or (kind == "region" and not has_geometry):
            raise ValueError("selector bundle lacks required anchor data")
        return {
            "selectors_json": self._canonical_json(normalized), "asset_fingerprint": asset.blob_digest, "source_run_id": source_run_id,
            "page_number": normalized.get("page_number"), "canonical_location": normalized.get("canonical_location"),
            "quote_exact": quote.get("exact") if isinstance(quote, dict) else None,
            "quote_prefix": quote.get("prefix") if isinstance(quote, dict) else None,
            "quote_suffix": quote.get("suffix") if isinstance(quote, dict) else None,
            "text_start": offsets.get("start") if isinstance(offsets, dict) else None,
            "text_end": offsets.get("end") if isinstance(offsets, dict) else None,
            "block_key": normalized.get("block_key"), "span_key": normalized.get("span_key"),
            "geometry_json": self._canonical_json(geometry) if isinstance(geometry, dict) else None, "epub_locator": normalized.get("epub_locator"),
        }

    async def _selector_for_revision(self, session: Any, revision_id: str) -> AnnotationSelectorBundle:
        selector = await session.scalar(select(AnnotationSelectorBundle).where(AnnotationSelectorBundle.annotation_revision_id == revision_id))
        if selector is None:
            raise ValueError("annotation selector bundle is missing")
        return selector

    async def _revision_values(self, session: Any, annotation: Annotation, previous: AnnotationRevision, body: str | None, tags: list[str] | None, signals: dict[str, Any] | None, selectors: dict[str, Any] | None, *, source_run_id: str | None = None) -> dict[str, Any]:
        current_tags = json.loads(previous.tags_json) if tags is None else tags
        current_signals = json.loads(previous.signals_json) if signals is None else signals
        current_body = previous.body if body is None else body
        self._validate_annotation_content(previous.kind, current_body, current_tags, current_signals)
        raw_selectors = json.loads((await self._selector_for_revision(session, previous.id)).selectors_json) if selectors is None else selectors
        bundle = await self._selector_values(session, await session.get(AdmittedAsset, annotation.asset_id), source_run_id or previous.source_run_id, previous.kind, raw_selectors)
        return {"kind": previous.kind, "body": current_body, "tags_json": self._canonical_json(current_tags), "signals_json": self._canonical_json(current_signals), "source_run_id": source_run_id or previous.source_run_id, "bundle": bundle}

    async def _annotation_view(self, session: Any, annotation: Annotation, revision: AnnotationRevision) -> dict[str, Any]:
        return {"id": annotation.id, "asset_id": annotation.asset_id, "revision_id": revision.id, "revision": revision.revision, "state": revision.state, "kind": revision.kind, "body": revision.body, "tags": json.loads(revision.tags_json), "signals": json.loads(revision.signals_json), "source_run_id": revision.source_run_id, "selectors": json.loads((await self._selector_for_revision(session, revision.id)).selectors_json), "created_at": revision.created_at}

    @staticmethod
    def _provenance(subject_id: str, subject_type: str, activity: str, actor: str, details: dict[str, str]) -> ProvenanceEvent:
        return ProvenanceEvent(
            id=new_id(),
            subject_type=subject_type,
            subject_id=subject_id,
            activity=activity,
            input_digest=None,
            output_digest=None,
            actor=actor,
            details_json=AuthorityRepository._canonical_json(details),
        )

    @staticmethod
    async def _lock_generation(session: Any) -> AuthorityGeneration:
        if session.bind.dialect.name == "sqlite":
            await session.execute(
                update(AuthorityGeneration)
                .where(AuthorityGeneration.id == 1)
                .values(generation=AuthorityGeneration.generation)
            )
        state = await session.scalar(select(AuthorityGeneration).where(AuthorityGeneration.id == 1).with_for_update())
        if state is None:
            raise RuntimeError("authority generation is not initialized")
        return state

    @classmethod
    def _validated_tables(cls, dump: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        tables = dump.get("tables")
        generation = dump.get("generation")
        if not isinstance(tables, dict) or type(generation) is not int or generation < 0:
            raise ValueError("invalid authority dump")
        expected = {model.__tablename__ for model in _AUTHORITY_MODELS}
        if set(tables) != expected or any(not isinstance(tables[name], list) for name in expected):
            raise ValueError("authority dump table set is invalid")
        typed_tables = {name: rows for name, rows in tables.items() if isinstance(rows, list)}
        if any(not isinstance(row, dict) for rows in typed_tables.values() for row in rows):
            raise ValueError("authority dump row is invalid")
        generations = typed_tables[AuthorityGeneration.__tablename__]
        if len(generations) > 1 or (generations and (generations[0].get("id") != 1 or generations[0].get("generation") != generation)):
            raise ValueError("authority generation is invalid")
        if generation and not generations:
            raise ValueError("authority generation is invalid")
        return typed_tables

    @staticmethod
    def _require_title(title: str) -> None:
        if not title.strip():
            raise ValueError("authority title must not be blank")

    @staticmethod
    def _canonical_json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    @classmethod
    def _row(cls, row: Any) -> dict[str, Any]:
        return {
            column.name: value.isoformat() if isinstance(value := getattr(row, column.name), datetime) else value
            for column in row.__table__.columns
        }

    @staticmethod
    def _decode_row(row: dict[str, Any]) -> dict[str, Any]:
        return {
            name: datetime.fromisoformat(value) if name.endswith("_at") and isinstance(value, str) else value
            for name, value in row.items()
        }
