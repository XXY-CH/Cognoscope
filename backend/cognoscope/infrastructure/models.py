from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from cognoscope.domain.events import OutboxStatus
from cognoscope.domain.jobs import JobState


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class BlobState(StrEnum):
    COMMITTED = "committed"
    MISSING = "missing"
    CORRUPT = "corrupt"


class AuthorityGeneration(Base):
    __tablename__ = "authority_generation"
    __table_args__ = (CheckConstraint("id = 1", name="ck_authority_generation_singleton"), CheckConstraint("generation >= 0", name="ck_authority_generation_nonnegative"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    generation: Mapped[int] = mapped_column(Integer, default=0)
    recovery_required: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class LibraryProject(Base):
    __tablename__ = "library_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProjectRevision(Base):
    __tablename__ = "project_revisions"
    __table_args__ = (
        UniqueConstraint("project_id", "revision", name="uq_project_revision"),
        CheckConstraint("revision > 0", name="ck_project_revision_positive"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("library_projects.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(512))
    supersedes_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("project_revisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LibraryDocument(Base):
    __tablename__ = "library_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("library_projects.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DocumentRevision(Base):
    __tablename__ = "document_revisions"
    __table_args__ = (
        UniqueConstraint("document_id", "revision", name="uq_document_revision"),
        CheckConstraint("revision > 0", name="ck_document_revision_positive"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("library_documents.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(512))
    supersedes_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_revisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BlobRecord(Base):
    __tablename__ = "blob_records"
    __table_args__ = (
        CheckConstraint("byte_size >= 0", name="ck_blob_record_size_nonnegative"),
        CheckConstraint("state IN ('committed', 'missing', 'corrupt')", name="ck_blob_record_state"),
    )

    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    byte_size: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(32), default=BlobState.COMMITTED.value, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdmittedAsset(Base):
    __tablename__ = "admitted_assets"
    __table_args__ = (
        CheckConstraint("detected_format IN ('pdf', 'epub', 'docx', 'html', 'markdown', 'text', 'pptx', 'xlsx', 'image')", name="ck_admitted_asset_format"),
        CheckConstraint("format_tier IN ('first_class', 'structured_secondary', 'extraction_only')", name="ck_admitted_asset_tier"),
        UniqueConstraint("id", "blob_digest", "detected_format", "format_tier", name="uq_admitted_asset_extraction_authority"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("document_revisions.id"), unique=True, index=True)
    blob_digest: Mapped[str] = mapped_column(String(64), ForeignKey("blob_records.digest"), index=True)
    detected_format: Mapped[str] = mapped_column(String(32))
    format_tier: Mapped[str] = mapped_column(String(32))
    media_type: Mapped[str] = mapped_column(String(256))
    admitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BibliographicRecord(Base):
    __tablename__ = "bibliographic_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("library_documents.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BibliographicRevision(Base):
    __tablename__ = "bibliographic_revisions"
    __table_args__ = (
        UniqueConstraint("bibliographic_record_id", "revision", name="uq_bibliographic_revision"),
        CheckConstraint("revision > 0", name="ck_bibliographic_revision_positive"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    bibliographic_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("bibliographic_records.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    csl_json: Mapped[str] = mapped_column(Text)
    supersedes_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("bibliographic_revisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProvenanceEvent(Base):
    __tablename__ = "provenance_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    subject_type: Mapped[str] = mapped_column(String(64), index=True)
    subject_id: Mapped[str] = mapped_column(String(36), index=True)
    activity: Mapped[str] = mapped_column(String(128))
    input_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor: Mapped[str] = mapped_column(String(128))
    details_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DurableJob(Base):
    __tablename__ = "durable_jobs"
    __table_args__ = (
        UniqueConstraint("account_id", "request_idempotency_key", name="uq_durable_job_account_request"),
        UniqueConstraint("id", "admitted_asset_id", name="uq_durable_job_asset"),
        CheckConstraint("state IN ('queued', 'running', 'resource_wait', 'partial', 'failed', 'cancelled', 'completed', 'recovery_pending')", name="ck_durable_job_state"),
        CheckConstraint("checkpoint >= 0", name="ck_durable_job_checkpoint_nonnegative"),
        CheckConstraint("version >= 0", name="ck_durable_job_version_nonnegative"),
        CheckConstraint("attempt_count >= 0", name="ck_durable_job_attempt_nonnegative"),
        CheckConstraint("lease_fence >= 0", name="ck_durable_job_lease_fence_nonnegative"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    admitted_asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("admitted_assets.id"), index=True)
    kind: Mapped[str] = mapped_column(String(64), default="ingestion")
    request_idempotency_key: Mapped[str] = mapped_column(String(256))
    state: Mapped[str] = mapped_column(String(32), default=JobState.QUEUED.value, index=True)
    checkpoint: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=0)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    resource_profile: Mapped[str | None] = mapped_column(String(128), nullable=True)
    wait_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_fence: Mapped[int] = mapped_column(Integer, default=0)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    terminal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        UniqueConstraint("deduplication_key", name="uq_outbox_event_deduplication"),
        CheckConstraint("status IN ('pending', 'leased', 'delivered', 'poison')", name="ck_outbox_event_status"),
        CheckConstraint("attempt_count >= 0", name="ck_outbox_event_attempt_nonnegative"),
        CheckConstraint("lease_fence >= 0", name="ck_outbox_event_lease_fence_nonnegative"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    aggregate_id: Mapped[str] = mapped_column(String(36), ForeignKey("durable_jobs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(128), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    deduplication_key: Mapped[str] = mapped_column(String(256))
    status: Mapped[str] = mapped_column(String(32), default=OutboxStatus.PENDING.value, index=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_fence: Mapped[int] = mapped_column(Integer, default=0)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EventConsumerReceipt(Base):
    __tablename__ = "event_consumer_receipts"
    __table_args__ = (UniqueConstraint("consumer_name", "event_id", name="uq_event_consumer_receipt"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    consumer_name: Mapped[str] = mapped_column(String(128))
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("outbox_events.id"), index=True)
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ExtractionRun(Base):
    __tablename__ = "extraction_runs"
    __table_args__ = (
        UniqueConstraint("asset_id", "sequence", name="uq_extraction_run_asset_sequence"),
        UniqueConstraint("job_id", name="uq_extraction_run_job"),
        ForeignKeyConstraint(
            ("job_id", "asset_id"),
            ("durable_jobs.id", "durable_jobs.admitted_asset_id"),
            name="fk_extraction_run_job_asset",
        ),
        UniqueConstraint("id", "supersedes_run_id", name="uq_extraction_run_supersession_edge"),
        ForeignKeyConstraint(
            ("asset_id", "source_blob_digest", "detected_format", "format_tier"),
            ("admitted_assets.id", "admitted_assets.blob_digest", "admitted_assets.detected_format", "admitted_assets.format_tier"),
            name="fk_extraction_run_admitted_authority",
        ),
        CheckConstraint("sequence > 0", name="ck_extraction_run_sequence_positive"),
        CheckConstraint("status IN ('completed', 'blocked', 'failed')", name="ck_extraction_run_status"),
        CheckConstraint("detected_format IN ('pdf', 'epub', 'docx', 'html', 'markdown', 'text', 'pptx', 'xlsx', 'image')", name="ck_extraction_run_format"),
        CheckConstraint("format_tier IN ('first_class', 'structured_secondary', 'extraction_only')", name="ck_extraction_run_tier"),
        CheckConstraint("status != 'completed' OR (adapter_id IS NOT NULL AND adapter_version IS NOT NULL AND adapter_revision IS NOT NULL AND artifact_digest IS NOT NULL AND artifact_json IS NOT NULL)", name="ck_extraction_run_completed_artifact"),
        CheckConstraint("status != 'blocked' OR (adapter_id IS NULL AND adapter_version IS NULL AND adapter_revision IS NULL AND artifact_digest IS NULL AND artifact_json IS NULL)", name="ck_extraction_run_blocked_artifact"),
        CheckConstraint("annotation_capable = FALSE OR viewable = TRUE", name="ck_extraction_run_annotation_requires_view"),
        CheckConstraint("status != 'completed' OR ((format_tier = 'extraction_only' AND viewable = FALSE AND annotation_capable = FALSE) OR (format_tier != 'extraction_only' AND viewable = TRUE AND annotation_capable = TRUE))", name="ck_extraction_run_tier_capabilities"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(String(36), index=True)
    job_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), index=True)
    adapter_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    adapter_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    adapter_revision: Mapped[str | None] = mapped_column(String(128), nullable=True)
    artifact_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    artifact_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_blob_digest: Mapped[str] = mapped_column(String(64), ForeignKey("blob_records.digest"), index=True)
    detected_format: Mapped[str] = mapped_column(String(32))
    format_tier: Mapped[str] = mapped_column(String(32))
    viewable: Mapped[bool] = mapped_column(Boolean, default=False)
    annotation_capable: Mapped[bool] = mapped_column(Boolean, default=False)
    limitations_json: Mapped[str] = mapped_column(Text, default="[]")
    supersedes_run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("extraction_runs.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ExtractionPart(Base):
    __tablename__ = "extraction_parts"
    __table_args__ = (
        UniqueConstraint("run_id", "key", name="uq_extraction_part_run_key"),
        UniqueConstraint("run_id", "ordinal", name="uq_extraction_part_run_ordinal"),
        ForeignKeyConstraint(("run_id", "parent_key"), ("extraction_parts.run_id", "extraction_parts.key")),
        CheckConstraint("ordinal >= 0", name="ck_extraction_part_ordinal_nonnegative"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_extraction_part_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    key: Mapped[str] = mapped_column(String(256))
    kind: Mapped[str] = mapped_column(String(64))
    title: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    parent_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)


class ExtractionPage(Base):
    __tablename__ = "extraction_pages"
    __table_args__ = (
        UniqueConstraint("run_id", "number", name="uq_extraction_page_run_number"),
        CheckConstraint("number > 0", name="ck_extraction_page_number_positive"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_extraction_page_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(32))
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    width: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)


class ExtractionBlock(Base):
    __tablename__ = "extraction_blocks"
    __table_args__ = (
        UniqueConstraint("run_id", "key", name="uq_extraction_block_run_key"),
        UniqueConstraint("run_id", "ordinal", name="uq_extraction_block_run_ordinal"),
        ForeignKeyConstraint(("run_id", "page_number"), ("extraction_pages.run_id", "extraction_pages.number")),
        ForeignKeyConstraint(("run_id", "part_key"), ("extraction_parts.run_id", "extraction_parts.key")),
        CheckConstraint("ordinal >= 0", name="ck_extraction_block_ordinal_nonnegative"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_extraction_block_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    key: Mapped[str] = mapped_column(String(256))
    kind: Mapped[str] = mapped_column(String(64))
    ordinal: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int] = mapped_column(Integer)
    part_key: Mapped[str] = mapped_column(String(256))
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    bounding_box_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExtractionSpan(Base):
    __tablename__ = "extraction_spans"
    __table_args__ = (
        UniqueConstraint("run_id", "key", name="uq_extraction_span_run_key"),
        ForeignKeyConstraint(("run_id", "block_key"), ("extraction_blocks.run_id", "extraction_blocks.key")),
        CheckConstraint("ordinal >= 0", name="ck_extraction_span_ordinal_nonnegative"),
        CheckConstraint("start_offset >= 0 AND end_offset >= start_offset", name="ck_extraction_span_offsets"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_extraction_span_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    key: Mapped[str] = mapped_column(String(256))
    block_key: Mapped[str] = mapped_column(String(256))
    ordinal: Mapped[int] = mapped_column(Integer)
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    bounding_boxes_json: Mapped[str] = mapped_column(Text, default="[]")


class ExtractionBibliographicCandidate(Base):
    __tablename__ = "extraction_bibliographic_candidates"
    __table_args__ = (
        UniqueConstraint("run_id", "key", name="uq_extraction_bibliographic_candidate_run_key"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_extraction_bibliographic_candidate_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    key: Mapped[str] = mapped_column(String(256))
    csl_json: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    provenance_json: Mapped[str] = mapped_column(Text, default="{}")


class ExtractionFinding(Base):
    __tablename__ = "extraction_findings"
    __table_args__ = (
        CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="ck_extraction_finding_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    code: Mapped[str] = mapped_column(String(256))
    severity: Mapped[str] = mapped_column(String(32), index=True)
    message: Mapped[str] = mapped_column(Text)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    block_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    span_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ExtractionRunDiff(Base):
    __tablename__ = "extraction_run_diffs"
    __table_args__ = (
        UniqueConstraint("run_id", name="uq_extraction_run_diff_run"),
        UniqueConstraint("run_id", "previous_run_id", name="uq_extraction_run_diff_edge"),
        ForeignKeyConstraint(("run_id", "previous_run_id"), ("extraction_runs.id", "extraction_runs.supersedes_run_id"), name="fk_extraction_run_diff_supersession_edge"),
        CheckConstraint("added_span_count >= 0", name="ck_extraction_run_diff_added_nonnegative"),
        CheckConstraint("removed_span_count >= 0", name="ck_extraction_run_diff_removed_nonnegative"),
        CheckConstraint("changed_block_count >= 0", name="ck_extraction_run_diff_changed_nonnegative"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    previous_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    added_span_count: Mapped[int] = mapped_column(Integer)
    removed_span_count: Mapped[int] = mapped_column(Integer)
    changed_block_count: Mapped[int] = mapped_column(Integer, default=0)


class ExtractionRepairCandidate(Base):
    __tablename__ = "extraction_repair_candidates"
    __table_args__ = (
        UniqueConstraint("run_id", "old_span_key", "new_span_key", name="uq_extraction_repair_candidate_mapping"),
        ForeignKeyConstraint(("run_id", "previous_run_id"), ("extraction_run_diffs.run_id", "extraction_run_diffs.previous_run_id"), name="fk_extraction_repair_diff_edge"),
        ForeignKeyConstraint(("previous_run_id", "old_span_key"), ("extraction_spans.run_id", "extraction_spans.key"), name="fk_extraction_repair_old_span"),
        ForeignKeyConstraint(("run_id", "new_span_key"), ("extraction_spans.run_id", "extraction_spans.key")),
        CheckConstraint("score >= 0 AND score <= 1", name="ck_extraction_repair_candidate_score_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    previous_run_id: Mapped[str] = mapped_column(String(36), index=True)
    old_span_key: Mapped[str] = mapped_column(String(256))
    new_span_key: Mapped[str] = mapped_column(String(256))
    score: Mapped[float] = mapped_column(Float)


class ExtractionEvidenceSummary(Base):
    __tablename__ = "extraction_evidence_summaries"
    __table_args__ = (
        UniqueConstraint("run_id", "key", name="uq_extraction_evidence_summary_run_key"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_extraction_evidence_summary_confidence_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    key: Mapped[str] = mapped_column(String(256))
    summary: Mapped[str] = mapped_column(Text)
    evidence_span_keys_json: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("admitted_assets.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AnnotationRevision(Base):
    __tablename__ = "annotation_revisions"
    __table_args__ = (
        UniqueConstraint("annotation_id", "revision", name="uq_annotation_revision"),
        CheckConstraint("revision > 0", name="ck_annotation_revision_positive"),
        CheckConstraint("state IN ('active', 'tombstoned')", name="ck_annotation_revision_state"),
        CheckConstraint("kind IN ('text', 'region')", name="ck_annotation_revision_kind"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    annotation_id: Mapped[str] = mapped_column(String(36), ForeignKey("annotations.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(32), default="active")
    kind: Mapped[str] = mapped_column(String(32))
    body: Mapped[str] = mapped_column(Text, default="")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    signals_json: Mapped[str] = mapped_column(Text, default="{}")
    source_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    supersedes_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("annotation_revisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AnnotationSelectorBundle(Base):
    __tablename__ = "annotation_selector_bundles"
    __table_args__ = (UniqueConstraint("annotation_revision_id", name="uq_annotation_selector_revision"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    annotation_revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("annotation_revisions.id"), index=True)
    selectors_json: Mapped[str] = mapped_column(Text)
    asset_fingerprint: Mapped[str] = mapped_column(String(64))
    source_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    canonical_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_exact: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_prefix: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_suffix: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    block_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    span_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    geometry_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    epub_locator: Mapped[str | None] = mapped_column(Text, nullable=True)


class AnnotationRepairDecision(Base):
    __tablename__ = "annotation_repair_decisions"
    __table_args__ = (
        UniqueConstraint("annotation_id", "candidate_id", name="uq_annotation_repair_candidate"),
        CheckConstraint("decision IN ('accepted', 'rejected')", name="ck_annotation_repair_decision"),
        CheckConstraint("(decision = 'accepted' AND accepted_revision_id IS NOT NULL) OR (decision = 'rejected' AND accepted_revision_id IS NULL)", name="ck_annotation_repair_acceptance"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    annotation_id: Mapped[str] = mapped_column(String(36), ForeignKey("annotations.id"), index=True)
    source_revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("annotation_revisions.id"), index=True)
    candidate_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_repair_candidates.id"), index=True)
    decision: Mapped[str] = mapped_column(String(32))
    accepted_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("annotation_revisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("admitted_assets.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeRevision(Base):
    __tablename__ = "knowledge_revisions"
    __table_args__ = (
        UniqueConstraint("knowledge_item_id", "revision", name="uq_knowledge_revision"),
        CheckConstraint("revision > 0", name="ck_knowledge_revision_positive"),
        CheckConstraint("status IN ('proposed', 'accepted', 'rejected', 'superseded')", name="ck_knowledge_revision_status"),
        CheckConstraint("kind IN ('summary', 'concept', 'claim', 'relation', 'finding', 'preference')", name="ck_knowledge_revision_kind"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_knowledge_revision_confidence"),
        CheckConstraint("producer_kind IN ('user', 'agent')", name="ck_knowledge_revision_producer_kind"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    knowledge_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("knowledge_items.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(32))
    content_json: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    producer_kind: Mapped[str] = mapped_column(String(16))
    producer_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    task_type: Mapped[str] = mapped_column(String(128))
    source_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    supersedes_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_revisions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeEvidenceLink(Base):
    __tablename__ = "knowledge_evidence_links"
    __table_args__ = (
        CheckConstraint("source_category IN ('extraction_run', 'annotation')", name="ck_knowledge_evidence_source_category"),
        CheckConstraint("role IN ('support', 'counter', 'comparison')", name="ck_knowledge_evidence_role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    knowledge_revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("knowledge_revisions.id"), index=True)
    source_category: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(36))
    source_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("extraction_runs.id"), index=True)
    locator: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(32))
    source_version: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeReviewDecision(Base):
    __tablename__ = "knowledge_review_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    knowledge_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("knowledge_items.id"), index=True)
    source_revision_id: Mapped[str] = mapped_column(String(36), ForeignKey("knowledge_revisions.id"), index=True)
    result_revision_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_revisions.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(32))
    actor_account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeThreshold(Base):
    __tablename__ = "knowledge_thresholds"
    __table_args__ = (UniqueConstraint("owner_account_id", "task_type", name="uq_knowledge_threshold_owner_task"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    task_type: Mapped[str] = mapped_column(String(128))
    minimum_confidence: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
 
class ResearchPreference(Base):
    __tablename__ = "research_preferences"
    __table_args__ = (
        UniqueConstraint("owner_account_id", "annotation_id", name="uq_research_preference_owner_annotation"),
        CheckConstraint("annotation_weight >= -1 AND annotation_weight <= 1", name="ck_research_preference_weight"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_account_id: Mapped[str] = mapped_column(String(36), default="default-user", index=True)
    annotation_id: Mapped[str] = mapped_column(String(36), ForeignKey("annotations.id"), index=True)
    annotation_weight: Mapped[float] = mapped_column(Float, default=0.0)
    highlight: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
