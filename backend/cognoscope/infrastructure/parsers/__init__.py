"""Deterministic parser selection for already-admitted assets."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from cognoscope.domain.documents import AdapterIdentity, AdapterOutput
from cognoscope.domain.library import AssetFormat

from cognoscope.infrastructure.parsers.native import NativeParserLimits, NativeStructuredAdapter, ParserResourceLimitError
from cognoscope.infrastructure.parsers.pdf import PdfParserLimits, PdfStructuredAdapter


class ExtractionAdapter(Protocol):
    """Structural protocol shared by native and promoted parser adapters."""

    identity: AdapterIdentity
    formats: frozenset[AssetFormat]

    def extract(self, payload: bytes, asset: object) -> AdapterOutput: ...


class ParserRegistry:
    """Maps each admitted format to exactly one structural extraction adapter."""

    def __init__(self, adapters: Iterable[ExtractionAdapter] = ()) -> None:
        by_format: dict[AssetFormat, ExtractionAdapter] = {}
        for adapter in adapters:
            for asset_format in sorted(adapter.formats, key=lambda item: item.value):
                if asset_format in by_format:
                    raise ValueError(f"duplicate parser registration for {asset_format.value}")
                by_format[asset_format] = adapter
        self._by_format = by_format

    def adapter_for(self, asset_format: AssetFormat) -> ExtractionAdapter | None:
        return self._by_format.get(asset_format)


def default_registry() -> ParserRegistry:
    """Return bounded local adapters for formats safe to process locally."""

    return ParserRegistry((NativeStructuredAdapter(), PdfStructuredAdapter()))


__all__ = ["ExtractionAdapter", "NativeParserLimits", "NativeStructuredAdapter", "ParserRegistry", "ParserResourceLimitError", "PdfParserLimits", "PdfStructuredAdapter", "default_registry"]
