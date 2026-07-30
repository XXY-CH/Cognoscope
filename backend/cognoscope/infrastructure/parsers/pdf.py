"""Bounded local PDF text-layer extraction using pypdf.

This adapter deliberately does not OCR. Pages without a usable text layer are
retained as empty pages and carry an explicit degradation finding.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any

from pypdf import PdfReader

from cognoscope.domain.documents import (
    AdapterIdentity,
    AdapterOutput,
    BlockKind,
    DocumentPart,
    ExtractionFinding,
    FindingSeverity,
    NormalizedBlock,
    NormalizedDocument,
    NormalizedPage,
    NormalizedSpan,
    PageMode,
)
from cognoscope.domain.library import AssetFormat, FormatTier
from cognoscope.infrastructure.parsers.native import ParserResourceLimitError


@dataclass(frozen=True)
class PdfParserLimits:
    """Resource bounds for the local pypdf text-layer adapter."""

    max_input_bytes: int = 32 * 1024 * 1024
    max_pages: int = 2_000
    max_decoded_chars: int = 8 * 1024 * 1024

    def __post_init__(self) -> None:
        if any(value <= 0 for value in self.__dict__.values()):
            raise ValueError("PDF parser limits must be positive")


@dataclass(frozen=True)
class PdfStructuredAdapter:
    """Extract deterministic page text from born-digital PDFs without OCR."""

    identity: AdapterIdentity = AdapterIdentity(
        "pdf-pypdf-prototype",
        "1.0.0",
        "pypdf-6.4.0",
        "cpu-local",
        promotion_evidence="prototype:local-pypdf-text-layer",
    )
    formats: frozenset[AssetFormat] = frozenset({AssetFormat.PDF})
    limits: PdfParserLimits = PdfParserLimits()

    @property
    def max_input_bytes(self) -> int:
        return self.limits.max_input_bytes

    def extract(self, payload: bytes, asset: object) -> AdapterOutput:
        if len(payload) > self.limits.max_input_bytes:
            raise ParserResourceLimitError("PDF input exceeds byte budget")
        asset_format = AssetFormat(getattr(asset, "format"))
        tier = FormatTier(getattr(asset, "tier"))
        if asset_format is not AssetFormat.PDF:
            raise ValueError("PDF parser received a non-PDF asset")
        if tier is not FormatTier.FIRST_CLASS:
            raise ValueError("PDF parser requires the admitted first-class tier")

        try:
            reader = PdfReader(BytesIO(payload), strict=False)
            page_count = len(reader.pages)
        except Exception as exc:
            raise ValueError("malformed PDF") from exc
        if page_count <= 0:
            raise ValueError("PDF has no pages")
        if page_count > self.limits.max_pages:
            raise ParserResourceLimitError("PDF exceeds page budget")

        parts = (DocumentPart(key="root", kind="document", title="PDF", ordinal=0),)
        pages: list[NormalizedPage] = []
        blocks: list[NormalizedBlock] = []
        spans: list[NormalizedSpan] = []
        findings: list[ExtractionFinding] = []
        page_artifacts: list[dict[str, Any]] = []
        decoded_chars = 0

        for page_number, page in enumerate(reader.pages, start=1):
            try:
                extracted = page.extract_text() or ""
            except Exception as exc:
                extracted = ""
                findings.append(
                    ExtractionFinding(
                        "pdf_text_extraction_failed",
                        FindingSeverity.WARNING,
                        "PDF text-layer extraction failed for this page; OCR was not attempted",
                        page_number=page_number,
                    )
                )
            if not isinstance(extracted, str):
                extracted = str(extracted)
            decoded_chars += len(extracted)
            if decoded_chars > self.limits.max_decoded_chars:
                raise ParserResourceLimitError("PDF text exceeds decoded character budget")

            normalized_text = extracted.strip()
            width, height = _page_dimensions(page)
            pages.append(
                NormalizedPage(
                    number=page_number,
                    mode=PageMode.BORN_DIGITAL,
                    source_text=extracted,
                    ocr_text=None,
                    normalized_text=normalized_text,
                    confidence=1.0 if normalized_text else 0.0,
                    width=width,
                    height=height,
                )
            )
            artifact_page: dict[str, Any] = {
                "number": page_number,
                "text": extracted,
                "normalized_text": normalized_text,
                "mode": PageMode.BORN_DIGITAL.value,
            }
            if normalized_text:
                block_key = f"block-{len(blocks) + 1}"
                span_key = f"span-{len(spans) + 1}"
                blocks.append(
                    NormalizedBlock(
                        key=block_key,
                        kind=BlockKind.PARAGRAPH,
                        ordinal=len(blocks),
                        page_number=page_number,
                        part_key="root",
                        source_text=normalized_text,
                        ocr_text=None,
                        normalized_text=normalized_text,
                        confidence=1.0,
                    )
                )
                spans.append(
                    NormalizedSpan(
                        key=span_key,
                        block_key=block_key,
                        ordinal=0,
                        start_offset=0,
                        end_offset=len(normalized_text),
                        text=normalized_text,
                        confidence=1.0,
                    )
                )
                artifact_page.update({"block_key": block_key, "span_key": span_key})
            else:
                findings.append(
                    ExtractionFinding(
                        "ocr_runtime_not_promoted",
                        FindingSeverity.WARNING,
                        "This PDF page has no usable text layer; OCR runtime is not promoted and no text was invented",
                        page_number=page_number,
                    )
                )
            page_artifacts.append(artifact_page)

        limitations = ("ocr_runtime_not_promoted",) if any(not page.normalized_text for page in pages) else ()
        document = NormalizedDocument(
            format=AssetFormat.PDF,
            tier=FormatTier.FIRST_CLASS,
            viewable=True,
            annotation_capable=True,
            parts=parts,
            pages=tuple(pages),
            blocks=tuple(blocks),
            spans=tuple(spans),
            findings=tuple(findings),
            limitations=limitations,
        )
        return AdapterOutput(
            document,
            {
                "parser": self.identity.adapter_id,
                "version": self.identity.version,
                "revision": self.identity.revision,
                "format": AssetFormat.PDF.value,
                "mode": "text-layer-only",
                "pages": tuple(page_artifacts),
            },
        )


def _page_dimensions(page: object) -> tuple[float | None, float | None]:
    """Read positive page dimensions without making geometry extraction required."""

    try:
        box = page.mediabox  # type: ignore[attr-defined]
        width = float(box.width)
        height = float(box.height)
    except (AttributeError, TypeError, ValueError):
        return None, None
    if width <= 0 or height <= 0:
        return None, None
    return width, height


__all__ = ["PdfParserLimits", "PdfStructuredAdapter"]
