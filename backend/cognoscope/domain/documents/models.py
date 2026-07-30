"""Immutable normalized-document extraction contracts.

These values carry parser output across the application boundary.  They validate the
normalized graph before it can be persisted, so malformed parser output never
becomes authority data.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
import math
from types import MappingProxyType
from typing import TypeAlias

from cognoscope.domain.library import AssetFormat, FormatTier


class BlockKind(StrEnum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE = "table"
    TABLE_CELL = "table_cell"
    FIGURE = "figure"
    CAPTION = "caption"
    QUOTE = "quote"
    CODE = "code"
    FOOTNOTE = "footnote"
    REFERENCE = "reference"


class PageMode(StrEnum):
    BORN_DIGITAL = "born_digital"
    OCR = "ocr"
    HYBRID = "hybrid"


class FindingSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ExtractionStatus(StrEnum):
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"


JSONScalar: TypeAlias = str | int | float | bool | None
JSONValue: TypeAlias = JSONScalar | Mapping[str, "JSONValue"] | Sequence["JSONValue"]


def _require_text(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")
    return value


def _require_non_negative_int(value: object, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")
    return value


def _require_page_number(value: object, field_name: str = "page number") -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{field_name} must be a positive integer")
    return value


def _require_confidence(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("confidence must be a finite number in [0, 1]")
    confidence = float(value)
    if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
        raise ValueError("confidence must be a finite number in [0, 1]")
    return confidence


def _require_positive_finite(value: object, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a positive finite number")
    number = float(value)
    if not math.isfinite(number) or number <= 0.0:
        raise ValueError(f"{field_name} must be a positive finite number")
    return number


@dataclass(frozen=True)
class BoundingBox:
    x: float
    y: float
    width: float
    height: float

    def __post_init__(self) -> None:
        values = (self.x, self.y, self.width, self.height)
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not 0.0 <= value <= 1.0
            for value in values
        ):
            raise ValueError("bounding box values must be finite numbers in [0, 1]")
        if self.x + self.width > 1.0 or self.y + self.height > 1.0:
            raise ValueError("bounding box must fit within normalized page bounds")


def _freeze_json(value: object) -> JSONValue:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("artifact contains a non-finite number")
        return value
    if isinstance(value, Mapping):
        frozen: dict[str, JSONValue] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("artifact object keys must be strings")
            frozen[key] = _freeze_json(item)
        return MappingProxyType(frozen)
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    raise ValueError("artifact must contain only JSON-like values")


def _assert_unique(values: Sequence[str], field_name: str) -> None:
    if len(set(values)) != len(values):
        raise ValueError(f"{field_name} keys must be unique")


@dataclass(frozen=True)
class AdapterIdentity:
    adapter_id: str
    version: str
    revision: str
    execution_profile: str
    promotion_evidence: str | None = None

    def __post_init__(self) -> None:
        _require_text(self.adapter_id, "adapter_id")
        _require_text(self.version, "version")
        _require_text(self.revision, "revision")
        _require_text(self.execution_profile, "execution_profile")
        if self.promotion_evidence is not None:
            _require_text(self.promotion_evidence, "promotion_evidence")


@dataclass(frozen=True)
class DocumentPart:
    key: str
    kind: str
    title: str | None
    ordinal: int
    parent_key: str | None = None
    confidence: float = 1.0

    def __post_init__(self) -> None:
        _require_text(self.key, "part key")
        _require_text(self.kind, "part kind")
        if self.title is not None and not isinstance(self.title, str):
            raise ValueError("part title must be a string or None")
        _require_non_negative_int(self.ordinal, "part ordinal")
        if self.parent_key is not None:
            _require_text(self.parent_key, "part parent_key")
        object.__setattr__(self, "confidence", _require_confidence(self.confidence))


@dataclass(frozen=True)
class NormalizedPage:
    number: int
    mode: PageMode
    source_text: str
    ocr_text: str | None
    normalized_text: str
    confidence: float
    width: float | None = None
    height: float | None = None

    def __post_init__(self) -> None:
        _require_page_number(self.number)
        if not isinstance(self.mode, PageMode):
            raise ValueError("page mode must be a PageMode")
        if not isinstance(self.source_text, str) or not isinstance(self.normalized_text, str):
            raise ValueError("page text variants must be strings")
        if self.ocr_text is not None and not isinstance(self.ocr_text, str):
            raise ValueError("ocr_text must be a string or None")
        object.__setattr__(self, "confidence", _require_confidence(self.confidence))
        if (self.width is None) != (self.height is None):
            raise ValueError("page width and height must be provided together")
        if self.width is not None:
            object.__setattr__(self, "width", _require_positive_finite(self.width, "page width"))
            object.__setattr__(self, "height", _require_positive_finite(self.height, "page height"))


@dataclass(frozen=True)
class NormalizedBlock:
    key: str
    kind: BlockKind
    ordinal: int
    page_number: int
    part_key: str
    source_text: str
    ocr_text: str | None
    normalized_text: str
    confidence: float
    bounding_box: BoundingBox | None = None

    def __post_init__(self) -> None:
        _require_text(self.key, "block key")
        if not isinstance(self.kind, BlockKind):
            raise ValueError("block kind must be a BlockKind")
        _require_non_negative_int(self.ordinal, "block ordinal")
        _require_page_number(self.page_number, "block page_number")
        _require_text(self.part_key, "block part_key")
        if not isinstance(self.source_text, str) or not isinstance(self.normalized_text, str):
            raise ValueError("block text variants must be strings")
        if self.ocr_text is not None and not isinstance(self.ocr_text, str):
            raise ValueError("ocr_text must be a string or None")
        if self.bounding_box is not None and not isinstance(self.bounding_box, BoundingBox):
            raise ValueError("block bounding_box must be a BoundingBox or None")
        object.__setattr__(self, "confidence", _require_confidence(self.confidence))


@dataclass(frozen=True)
class NormalizedSpan:
    key: str
    block_key: str
    ordinal: int
    start_offset: int
    end_offset: int
    text: str
    confidence: float
    bounding_boxes: tuple[BoundingBox, ...] = ()

    def __post_init__(self) -> None:
        _require_text(self.key, "span key")
        _require_text(self.block_key, "span block_key")
        _require_non_negative_int(self.ordinal, "span ordinal")
        _require_non_negative_int(self.start_offset, "span start_offset")
        _require_non_negative_int(self.end_offset, "span end_offset")
        if self.end_offset < self.start_offset:
            raise ValueError("span end_offset must not precede start_offset")
        if not isinstance(self.text, str):
            raise ValueError("span text must be a string")
        bounding_boxes = tuple(self.bounding_boxes)
        if not all(isinstance(item, BoundingBox) for item in bounding_boxes):
            raise ValueError("span bounding_boxes must contain BoundingBox values")
        object.__setattr__(self, "confidence", _require_confidence(self.confidence))
        object.__setattr__(self, "bounding_boxes", bounding_boxes)


@dataclass(frozen=True)
class ExtractionFinding:
    code: str
    severity: FindingSeverity
    message: str
    page_number: int | None = None
    block_key: str | None = None
    span_key: str | None = None
    requires_review: bool = True

    def __post_init__(self) -> None:
        _require_text(self.code, "finding code")
        if not isinstance(self.severity, FindingSeverity):
            raise ValueError("finding severity must be a FindingSeverity")
        _require_text(self.message, "finding message")
        if self.page_number is not None:
            _require_page_number(self.page_number, "finding page_number")
        if self.block_key is not None:
            _require_text(self.block_key, "finding block_key")
        if self.span_key is not None:
            _require_text(self.span_key, "finding span_key")
        if not isinstance(self.requires_review, bool):
            raise ValueError("finding requires_review must be a boolean")


@dataclass(frozen=True)
class BibliographicCandidate:
    key: str
    csl: Mapping[str, JSONValue]
    confidence: float
    provenance: Mapping[str, JSONValue] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require_text(self.key, "bibliographic candidate key")
        if not isinstance(self.csl, Mapping) or not isinstance(self.provenance, Mapping):
            raise ValueError("bibliographic candidate CSL and provenance must be JSON-like mappings")
        csl = _freeze_json(self.csl)
        provenance = _freeze_json(self.provenance)
        if not isinstance(csl, Mapping) or not isinstance(provenance, Mapping):
            raise ValueError("bibliographic candidate CSL and provenance must be JSON-like mappings")
        object.__setattr__(self, "csl", csl)
        object.__setattr__(self, "provenance", provenance)
        object.__setattr__(self, "confidence", _require_confidence(self.confidence))


@dataclass(frozen=True)
class EvidenceSummary:
    key: str
    summary: str
    evidence_span_keys: tuple[str, ...]
    confidence: float

    def __post_init__(self) -> None:
        _require_text(self.key, "evidence summary key")
        _require_text(self.summary, "evidence summary text")
        evidence_span_keys = tuple(self.evidence_span_keys)
        if not all(isinstance(key, str) and key for key in evidence_span_keys):
            raise ValueError("evidence summary span keys must be non-empty strings")
        _assert_unique(evidence_span_keys, "evidence summary span")
        object.__setattr__(self, "evidence_span_keys", evidence_span_keys)
        object.__setattr__(self, "confidence", _require_confidence(self.confidence))


@dataclass(frozen=True)
class NormalizedDocument:
    format: AssetFormat
    tier: FormatTier
    viewable: bool
    annotation_capable: bool
    parts: tuple[DocumentPart, ...] = ()
    pages: tuple[NormalizedPage, ...] = ()
    blocks: tuple[NormalizedBlock, ...] = ()
    spans: tuple[NormalizedSpan, ...] = ()
    findings: tuple[ExtractionFinding, ...] = ()
    bibliographic_candidates: tuple[BibliographicCandidate, ...] = ()
    evidence_summaries: tuple[EvidenceSummary, ...] = ()
    limitations: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.format, AssetFormat):
            raise ValueError("format must be an AssetFormat")
        if not isinstance(self.tier, FormatTier):
            raise ValueError("tier must be a FormatTier")
        if not isinstance(self.viewable, bool) or not isinstance(self.annotation_capable, bool):
            raise ValueError("document capabilities must be booleans")
        if self.annotation_capable and not self.viewable:
            raise ValueError("annotation-capable documents must be viewable")
        if self.tier is FormatTier.EXTRACTION_ONLY:
            if self.viewable or self.annotation_capable:
                raise ValueError("extraction-only documents cannot claim reader or annotation capability")
        elif not (self.viewable and self.annotation_capable):
            raise ValueError("viewable format tiers require reader and annotation capability")

        parts = tuple(self.parts)
        pages = tuple(self.pages)
        blocks = tuple(self.blocks)
        spans = tuple(self.spans)
        findings = tuple(self.findings)
        bibliographic_candidates = tuple(self.bibliographic_candidates)
        evidence_summaries = tuple(self.evidence_summaries)
        limitations = tuple(self.limitations)
        if not all(isinstance(item, DocumentPart) for item in parts):
            raise ValueError("parts must contain DocumentPart values")
        if not all(isinstance(item, NormalizedPage) for item in pages):
            raise ValueError("pages must contain NormalizedPage values")
        if not all(isinstance(item, NormalizedBlock) for item in blocks):
            raise ValueError("blocks must contain NormalizedBlock values")
        if not all(isinstance(item, NormalizedSpan) for item in spans):
            raise ValueError("spans must contain NormalizedSpan values")
        if not all(isinstance(item, ExtractionFinding) for item in findings):
            raise ValueError("findings must contain ExtractionFinding values")
        if not all(isinstance(item, BibliographicCandidate) for item in bibliographic_candidates):
            raise ValueError("bibliographic_candidates must contain BibliographicCandidate values")
        if not all(isinstance(item, EvidenceSummary) for item in evidence_summaries):
            raise ValueError("evidence_summaries must contain EvidenceSummary values")
        if not all(isinstance(item, str) and item for item in limitations):
            raise ValueError("limitations must contain non-empty strings")

        _assert_unique([part.key for part in parts], "part")
        _assert_unique([block.key for block in blocks], "block")
        _assert_unique([span.key for span in spans], "span")
        _assert_unique([candidate.key for candidate in bibliographic_candidates], "bibliographic candidate")
        _assert_unique([summary.key for summary in evidence_summaries], "evidence summary")
        page_numbers = [page.number for page in pages]
        if len(set(page_numbers)) != len(page_numbers):
            raise ValueError("page numbers must be unique")

        part_by_key = {part.key: part for part in parts}
        for part in parts:
            parent_key = part.parent_key
            seen = {part.key}
            while parent_key is not None:
                if parent_key in seen or parent_key not in part_by_key:
                    raise ValueError("document parts must form a valid parent DAG")
                seen.add(parent_key)
                parent_key = part_by_key[parent_key].parent_key

        block_by_key = {block.key: block for block in blocks}
        span_keys = {span.key for span in spans}
        page_number_set = set(page_numbers)
        for block in blocks:
            if block.part_key not in part_by_key:
                raise ValueError("block references an unknown document part")
            if block.page_number not in page_number_set:
                raise ValueError("block references an unknown page")
        for span in spans:
            block = block_by_key.get(span.block_key)
            if block is None:
                raise ValueError("span references an unknown block")
            if span.end_offset > len(block.normalized_text):
                raise ValueError("span offsets exceed normalized block text")
            if block.normalized_text[span.start_offset : span.end_offset] != span.text:
                raise ValueError("span text does not match normalized block offsets")
        for finding in findings:
            if finding.page_number is not None and finding.page_number not in page_number_set:
                raise ValueError("finding references an unknown page")
            if finding.block_key is not None and finding.block_key not in block_by_key:
                raise ValueError("finding references an unknown block")
            if finding.span_key is not None and finding.span_key not in span_keys:
                raise ValueError("finding references an unknown span")
        for summary in evidence_summaries:
            if any(key not in span_keys for key in summary.evidence_span_keys):
                raise ValueError("evidence summary references an unknown span")

        object.__setattr__(self, "parts", parts)
        object.__setattr__(self, "pages", pages)
        object.__setattr__(self, "blocks", blocks)
        object.__setattr__(self, "spans", spans)
        object.__setattr__(self, "findings", findings)
        object.__setattr__(self, "bibliographic_candidates", bibliographic_candidates)
        object.__setattr__(self, "evidence_summaries", evidence_summaries)
        object.__setattr__(self, "limitations", limitations)


@dataclass(frozen=True)
class AdapterOutput:
    document: NormalizedDocument
    artifact: Mapping[str, JSONValue]

    def __post_init__(self) -> None:
        if not isinstance(self.document, NormalizedDocument):
            raise ValueError("adapter output document must be normalized")
        if not isinstance(self.artifact, Mapping):
            raise ValueError("adapter output artifact must be a JSON-like mapping")
        frozen = _freeze_json(self.artifact)
        if not isinstance(frozen, Mapping):  # Defensive: the outer input is a mapping.
            raise ValueError("adapter output artifact must be a JSON-like mapping")
        object.__setattr__(self, "artifact", frozen)


@dataclass(frozen=True)
class ExtractionAsset:
    id: str
    blob_digest: str
    blob_size: int
    format: AssetFormat
    tier: FormatTier

    def __post_init__(self) -> None:
        _require_text(self.id, "asset id")
        _require_text(self.blob_digest, "asset blob_digest")
        _require_non_negative_int(self.blob_size, "asset blob_size")
        if not isinstance(self.format, AssetFormat) or not isinstance(self.tier, FormatTier):
            raise ValueError("asset format and tier must be admitted format values")


@dataclass(frozen=True)
class ExtractionRunRecord:
    id: str
    asset_id: str
    sequence: int
    status: ExtractionStatus
    adapter_id: str | None = None
    adapter_version: str | None = None
    adapter_revision: str | None = None
    artifact_digest: str | None = None
    limitations: tuple[str, ...] = ()
    supersedes_run_id: str | None = None

    def __post_init__(self) -> None:
        _require_text(self.id, "run id")
        _require_text(self.asset_id, "run asset_id")
        if isinstance(self.sequence, bool) or not isinstance(self.sequence, int) or self.sequence < 1:
            raise ValueError("run sequence must be a positive integer")
        if not isinstance(self.status, ExtractionStatus):
            raise ValueError("run status must be an ExtractionStatus")
        for field_name in ("adapter_id", "adapter_version", "adapter_revision", "artifact_digest", "supersedes_run_id"):
            value = getattr(self, field_name)
            if value is not None:
                _require_text(value, field_name)
        limitations = tuple(self.limitations)
        if not all(isinstance(item, str) and item for item in limitations):
            raise ValueError("run limitations must contain non-empty strings")
        if self.status is ExtractionStatus.COMPLETED:
            if not all((self.adapter_id, self.adapter_version, self.adapter_revision, self.artifact_digest)):
                raise ValueError("completed runs require adapter identity and artifact digest")
        if self.status is ExtractionStatus.BLOCKED and self.artifact_digest is not None:
            raise ValueError("blocked runs cannot have an artifact digest")
        object.__setattr__(self, "limitations", limitations)


@dataclass(frozen=True)
class ExtractionDiff:
    added_span_count: int
    removed_span_count: int
    changed_block_count: int = 0

    def __post_init__(self) -> None:
        _require_non_negative_int(self.added_span_count, "added_span_count")
        _require_non_negative_int(self.removed_span_count, "removed_span_count")
        _require_non_negative_int(self.changed_block_count, "changed_block_count")


@dataclass(frozen=True)
class RepairCandidate:
    old_span_key: str
    new_span_key: str
    score: float

    def __post_init__(self) -> None:
        _require_text(self.old_span_key, "old_span_key")
        _require_text(self.new_span_key, "new_span_key")
        object.__setattr__(self, "score", _require_confidence(self.score))


@dataclass(frozen=True)
class ExtractionSnapshot:
    run: ExtractionRunRecord
    document: NormalizedDocument | None
    diff: ExtractionDiff | None = None
    repair_candidates: tuple[RepairCandidate, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.run, ExtractionRunRecord):
            raise ValueError("snapshot run must be an ExtractionRunRecord")
        if self.document is not None and not isinstance(self.document, NormalizedDocument):
            raise ValueError("snapshot document must be normalized or absent")
        if (self.run.status is ExtractionStatus.COMPLETED) != (self.document is not None):
            raise ValueError("only completed runs may contain a normalized document")
        if self.diff is not None and not isinstance(self.diff, ExtractionDiff):
            raise ValueError("snapshot diff must be an ExtractionDiff or None")
        candidates = tuple(self.repair_candidates)
        if not all(isinstance(item, RepairCandidate) for item in candidates):
            raise ValueError("repair_candidates must contain RepairCandidate values")
        if len({candidate.old_span_key for candidate in candidates}) != len(candidates):
            raise ValueError("repair candidates must have unique old_span_key values")
        if len({candidate.new_span_key for candidate in candidates}) != len(candidates):
            raise ValueError("repair candidates must have unique new_span_key values")
        object.__setattr__(self, "repair_candidates", candidates)
