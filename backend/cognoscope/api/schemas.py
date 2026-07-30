from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

Username = Annotated[str, Field(min_length=3, max_length=128, pattern=r"^[^\s]+$")]
Password = Annotated[str, Field(min_length=12, max_length=256)]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: object | None = None


class ErrorEnvelope(BaseModel):
    error: ErrorDetail


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["cognoscope-api"]


class BootstrapStatusResponse(BaseModel):
    setup_open: bool


class BootstrapRequest(BaseModel):
    username: Username
    password: Password


class LoginRequest(BaseModel):
    username: Username
    password: Password


class PasswordChangeRequest(BaseModel):
    current_password: Password
    new_password: Password


class AccountResponse(BaseModel):
    id: str
    username: str


class SessionResponse(BaseModel):
    account: AccountResponse
    csrf_token: str
    idle_expires_at: datetime
    absolute_expires_at: datetime


class PermitScopeRequest(BaseModel):
    project_id: Annotated[str, Field(min_length=1, max_length=128)]
    task_class: Annotated[str, Field(min_length=1, max_length=128)]
    asset_revision_id: Annotated[str | None, Field(max_length=128)] = None
    annotation_revision_id: Annotated[str | None, Field(max_length=128)] = None
    content_digest: Digest
    byte_start: Annotated[int, Field(ge=0)]
    byte_end: Annotated[int, Field(ge=0)]
    provider_endpoint: HttpUrl
    provider_model: Annotated[str, Field(min_length=1, max_length=256)]
    purpose: Annotated[str, Field(min_length=1, max_length=256)]
    max_payload_bytes: Annotated[int, Field(gt=0, le=50_000_000)]
    max_dispatches: Annotated[int, Field(gt=0, le=10_000)]
    max_cost_micros: Annotated[int, Field(ge=0)]
    expires_at: datetime


class PermitCreateRequest(BaseModel):
    decision: Literal["once", "project_task"]
    scope: PermitScopeRequest


class AlwaysLocalRequest(BaseModel):
    project_id: Annotated[str, Field(min_length=1, max_length=128)]
    task_class: Annotated[str, Field(min_length=1, max_length=128)]


class PermitScopeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: str
    task_class: str
    asset_revision_id: str | None
    annotation_revision_id: str | None
    content_digest: str
    byte_start: int
    byte_end: int
    provider_endpoint: str
    provider_model: str
    purpose: str
    max_payload_bytes: int
    max_dispatches: int
    max_cost_micros: int
    expires_at: datetime


class PermitResponse(BaseModel):
    id: str
    decision: Literal["once", "project_task"]
    scope: PermitScopeResponse
    uses_consumed: int
    revoked_at: datetime | None


class AlwaysLocalResponse(BaseModel):
    id: str
    project_id: str
    task_class: str
    decision: Literal["always_local"]
    created_at: datetime


JobStateResponse = Literal["queued", "running", "resource_wait", "partial", "failed", "cancelled", "completed", "recovery_pending"]
OutboxStatusResponse = Literal["pending", "leased", "delivered", "poison"]


class ImportCreateRequest(BaseModel):
    admitted_asset_id: Annotated[str, Field(min_length=1, max_length=36)]
    idempotency_key: Annotated[str, Field(min_length=1, max_length=256)]
    resource_profile: Annotated[str | None, Field(max_length=128)] = "cpu-local"


class JobRetryRequest(BaseModel):
    idempotency_key: Annotated[str, Field(min_length=1, max_length=256)]


class JobResponse(BaseModel):
    id: str
    admitted_asset_id: str
    state: JobStateResponse
    checkpoint: int
    version: int
    attempt_count: int
    resource_profile: str | None
    wait_reason: str | None
    cancel_requested: bool
    result: object | None
    failure_code: str | None
    created_at: datetime
    updated_at: datetime
    terminal_at: datetime | None


class JobListResponse(BaseModel):
    jobs: list[JobResponse]


class OutboxEventResponse(BaseModel):
    id: str
    event_type: str
    status: OutboxStatusResponse
    attempt_count: int
    last_error: str | None
    available_at: datetime


class OutboxEventListResponse(BaseModel):
    events: list[OutboxEventResponse]


class DomainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BoundingBoxResponse(DomainResponse):
    x: float
    y: float
    width: float
    height: float


class DocumentPartResponse(DomainResponse):
    key: str
    kind: str
    title: str | None
    ordinal: int
    parent_key: str | None
    confidence: float


class NormalizedPageResponse(DomainResponse):
    number: int
    mode: Literal["born_digital", "ocr", "hybrid"]
    source_text: str
    ocr_text: str | None
    normalized_text: str
    confidence: float
    width: float | None
    height: float | None


class NormalizedBlockResponse(DomainResponse):
    key: str
    kind: Literal["heading", "paragraph", "list_item", "table", "table_cell", "figure", "caption", "quote", "code", "footnote", "reference"]
    ordinal: int
    page_number: int
    part_key: str
    source_text: str
    ocr_text: str | None
    normalized_text: str
    confidence: float
    bounding_box: BoundingBoxResponse | None


class NormalizedSpanResponse(DomainResponse):
    key: str
    block_key: str
    ordinal: int
    start_offset: int
    end_offset: int
    text: str
    confidence: float
    bounding_boxes: list[BoundingBoxResponse]


class ExtractionFindingResponse(DomainResponse):
    code: str
    severity: Literal["info", "warning", "error"]
    message: str
    page_number: int | None
    block_key: str | None
    span_key: str | None
    requires_review: bool


class BibliographicCandidateResponse(DomainResponse):
    key: str
    csl: dict[str, object]
    confidence: float
    provenance: dict[str, object]


class EvidenceSummaryResponse(DomainResponse):
    key: str
    summary: str
    evidence_span_keys: list[str]
    confidence: float


class NormalizedDocumentResponse(DomainResponse):
    format: Literal["pdf", "epub", "docx", "html", "markdown", "text", "pptx", "xlsx", "image"]
    tier: Literal["first_class", "structured_secondary", "extraction_only"]
    viewable: bool
    annotation_capable: bool
    parts: list[DocumentPartResponse]
    pages: list[NormalizedPageResponse]
    blocks: list[NormalizedBlockResponse]
    spans: list[NormalizedSpanResponse]
    findings: list[ExtractionFindingResponse]
    bibliographic_candidates: list[BibliographicCandidateResponse]
    evidence_summaries: list[EvidenceSummaryResponse]
    limitations: list[str]


class ExtractionRunResponse(DomainResponse):
    id: str
    asset_id: str
    sequence: int
    status: Literal["blocked", "completed", "failed"]
    adapter_id: str | None
    adapter_version: str | None
    adapter_revision: str | None
    artifact_digest: str | None
    limitations: list[str]
    supersedes_run_id: str | None


class ExtractionDiffResponse(DomainResponse):
    added_span_count: int
    removed_span_count: int
    changed_block_count: int


class RepairCandidateResponse(DomainResponse):
    old_span_key: str
    new_span_key: str
    score: float


class ExtractionSnapshotResponse(DomainResponse):
    run: ExtractionRunResponse
    document: NormalizedDocumentResponse | None
    diff: ExtractionDiffResponse | None
    repair_candidates: list[RepairCandidateResponse]


AnnotationKind = Literal["text", "region"]
AnnotationState = Literal["active", "tombstoned"]


class AnnotationCreateRequest(BaseModel):
    asset_id: Annotated[str, Field(min_length=1, max_length=36)]
    source_run_id: Annotated[str, Field(min_length=1, max_length=36)]
    kind: AnnotationKind
    body: str = ""
    tags: list[str] = Field(default_factory=list)
    signals: dict[str, object] = Field(default_factory=dict)
    selectors: dict[str, object]


class AnnotationRevisionRequest(BaseModel):
    expected_revision: Annotated[int, Field(gt=0)]
    body: str | None = None
    tags: list[str] | None = None
    signals: dict[str, object] | None = None
    selectors: dict[str, object] | None = None
    tombstone: bool = False


class AnnotationRestoreRequest(BaseModel):
    expected_revision: Annotated[int, Field(gt=0)]


class AnnotationRepairDecisionRequest(BaseModel):
    expected_revision: Annotated[int, Field(gt=0)]
    candidate_id: Annotated[str, Field(min_length=1, max_length=36)]
    decision: Literal["accepted", "rejected"]


class AnnotationResponse(BaseModel):
    id: str
    asset_id: str
    revision_id: str
    revision: int
    state: AnnotationState
    kind: AnnotationKind
    body: str
    tags: list[str]
    signals: dict[str, object]
    source_run_id: str
    selectors: dict[str, object]
    created_at: datetime


class AnnotationListResponse(BaseModel):
    annotations: list[AnnotationResponse]


class AnnotationRepairQueueItem(BaseModel):
    annotation_id: str
    expected_revision: int
    candidate_id: str
    source_run_id: str
    target_run_id: str
    old_span_key: str
    new_span_key: str
    score: float


class AnnotationRepairQueueResponse(BaseModel):
    repairs: list[AnnotationRepairQueueItem]


class AnnotationExportResponse(BaseModel):
    annotation: dict[str, object]
    latest_revision_id: str
    revisions: list[dict[str, object]]
    repair_decisions: list[dict[str, object]]
    provenance: list[dict[str, object]]


KnowledgeKind = Literal["summary", "concept", "claim", "relation", "finding", "preference"]
KnowledgeStatus = Literal["proposed", "accepted", "rejected", "superseded"]
KnowledgeProducerKind = Literal["user", "agent"]
KnowledgeEvidenceRole = Literal["support", "counter", "comparison"]


class KnowledgeEvidenceRequest(BaseModel):
    source_category: Literal["extraction_run", "annotation"]
    source_version: Annotated[str, Field(min_length=1, max_length=128)]
    source_id: Annotated[str, Field(min_length=1, max_length=36)]
    source_run_id: Annotated[str, Field(min_length=1, max_length=36)]
    locator: Annotated[str, Field(min_length=1)]
    role: KnowledgeEvidenceRole


class KnowledgeCreateRequest(BaseModel):
    asset_id: Annotated[str, Field(min_length=1, max_length=36)]
    source_run_id: Annotated[str, Field(min_length=1, max_length=36)]
    kind: KnowledgeKind
    content: dict[str, object]
    confidence: Annotated[float, Field(ge=0, le=1)]
    producer_kind: KnowledgeProducerKind
    producer_id: Annotated[str | None, Field(max_length=256)] = None
    task_type: Annotated[str, Field(min_length=1, max_length=128)]
    evidence: list[KnowledgeEvidenceRequest] = Field(min_length=1)


class KnowledgeThresholdRequest(BaseModel):
    minimum_confidence: Annotated[float, Field(ge=0, le=1)]


class KnowledgeReviewRequest(BaseModel):
    action: Literal["accept", "edit_accept", "reject", "merge", "split", "relink_evidence", "reverse", "supersede"]
    expected_revision: Annotated[int, Field(gt=0)]
    content: dict[str, object] | None = None
    evidence: list[KnowledgeEvidenceRequest] | None = None
    target_revision: Annotated[int | None, Field(gt=0)] = None
    related_item_ids: list[Annotated[str, Field(min_length=1, max_length=36)]] | None = None
    split_contents: list[dict[str, object]] | None = None


class KnowledgeResponse(BaseModel):
    id: str
    asset_id: str
    revision_id: str
    revision: int
    status: KnowledgeStatus
    kind: KnowledgeKind
    content: dict[str, object]
    confidence: float
    producer_kind: KnowledgeProducerKind
    producer_id: str | None
    task_type: str
    source_run_id: str
    evidence: list[KnowledgeEvidenceRequest]
    created_at: datetime


class KnowledgeListResponse(BaseModel):
    knowledge: list[KnowledgeResponse]


class KnowledgeThresholdResponse(BaseModel):
    task_type: str
    minimum_confidence: float


class KnowledgeExportResponse(BaseModel):
    knowledge: dict[str, object]
    latest_revision_id: str
    revisions: list[dict[str, object]]
    review_decisions: list[dict[str, object]]
    provenance: list[dict[str, object]]
 
class ResearchPreferenceUpdateRequest(BaseModel):
    annotation_weight: Annotated[float, Field(ge=-1, le=1)]
    highlight: bool


class ResearchPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_account_id: str
    annotation_id: str
    annotation_weight: float
    highlight: bool
    created_at: datetime
    updated_at: datetime


class ResearchPreferenceListResponse(BaseModel):
    preferences: list[ResearchPreferenceResponse]


class AssetMetadataResponse(BaseModel):
    id: str
    format: Literal["pdf", "epub", "docx", "html", "markdown", "text", "pptx", "xlsx", "image"]
    tier: Literal["first_class", "structured_secondary", "extraction_only"]
    media_type: str


class AssetAdmissionResponse(BaseModel):
    admitted_asset_id: str
    document_id: str
    blob_digest: Digest
    byte_size: int
    format: Literal["pdf", "epub", "docx", "html", "markdown", "text", "pptx", "xlsx", "image"]
    tier: Literal["first_class", "structured_secondary", "extraction_only"]
    media_type: str
    generation: int
