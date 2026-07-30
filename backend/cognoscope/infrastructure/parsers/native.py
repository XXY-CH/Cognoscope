"""Stdlib-only normalization for admitted secondary and supplemental formats."""

from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePosixPath
import re
import stat
from typing import Iterable
import xml.etree.ElementTree as ElementTree
import zipfile

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


class ParserResourceLimitError(ValueError):
    """The admitted input exceeds a deterministic local parser budget."""


@dataclass(frozen=True)
class NativeParserLimits:
    max_input_bytes: int = 16 * 1024 * 1024
    max_decoded_chars: int = 8 * 1024 * 1024
    max_segments: int = 50_000
    max_xml_nodes: int = 100_000
    max_archive_entries: int = 2_000
    max_archive_member_bytes: int = 8 * 1024 * 1024
    max_archive_total_bytes: int = 32 * 1024 * 1024
    max_compression_ratio: int = 100

    def __post_init__(self) -> None:
        if any(value <= 0 for value in self.__dict__.values()):
            raise ValueError("native parser limits must be positive")


class _VisibleHtml(HTMLParser):
    _IGNORED = frozenset({"script", "style", "template"})
    _BOUNDARIES = frozenset({"address", "article", "br", "div", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "p", "section", "table", "tr"})

    def __init__(self, limits: NativeParserLimits) -> None:
        super().__init__(convert_charrefs=True)
        self._limits = limits
        self._ignored_depth = 0
        self._text_chars = 0
        self._chunks: list[str] = []

    def _append(self, value: str) -> None:
        if not value:
            return
        if len(self._chunks) >= self._limits.max_segments or self._text_chars + len(value) > self._limits.max_decoded_chars:
            raise ParserResourceLimitError("HTML structure exceeds parser budget")
        self._chunks.append(value)
        self._text_chars += len(value)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered in self._IGNORED:
            self._ignored_depth += 1
        elif not self._ignored_depth and lowered in self._BOUNDARIES:
            self._append("\n\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if not self._ignored_depth and tag.lower() in self._BOUNDARIES:
            self._append("\n\n")

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in self._IGNORED and self._ignored_depth:
            self._ignored_depth -= 1
        elif not self._ignored_depth and lowered in self._BOUNDARIES:
            self._append("\n\n")

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth:
            self._append(data)

    def text(self) -> str:
        return "".join(self._chunks)


@dataclass(frozen=True)
class NativeStructuredAdapter:
    """A bounded local parser; it never routes PDF or EPUB bytes."""

    identity: AdapterIdentity = AdapterIdentity("native-stdlib", "1.0.0", "stdlib-v1", "cpu-local")
    formats: frozenset[AssetFormat] = frozenset(
        {
            AssetFormat.TEXT,
            AssetFormat.MARKDOWN,
            AssetFormat.HTML,
            AssetFormat.DOCX,
            AssetFormat.PPTX,
            AssetFormat.XLSX,
            AssetFormat.IMAGE,
        }
    )
    limits: NativeParserLimits = NativeParserLimits()

    @property
    def max_input_bytes(self) -> int:
        return self.limits.max_input_bytes

    def extract(self, payload: bytes, asset: object) -> AdapterOutput:
        if len(payload) > self.limits.max_input_bytes:
            raise ParserResourceLimitError("parser input exceeds byte budget")
        asset_format = AssetFormat(getattr(asset, "format"))
        tier = FormatTier(getattr(asset, "tier"))
        if tier is not _tier_for(asset_format):
            raise ValueError("asset context conflicts with admitted format tier")
        if asset_format is AssetFormat.TEXT or asset_format is AssetFormat.MARKDOWN:
            source = _decode(payload, self.limits)
            return self._output(asset_format, tier, source, _paragraphs(source, self.limits), mode="utf8")
        if asset_format is AssetFormat.HTML:
            parser = _VisibleHtml(self.limits)
            parser.feed(_decode(payload, self.limits))
            parser.close()
            source = parser.text()
            return self._output(asset_format, tier, source, _paragraphs(source, self.limits), mode="html.parser")
        if asset_format is AssetFormat.DOCX:
            paragraphs, findings = _docx_content(payload, self.limits)
            return self._output(asset_format, tier, "\n\n".join(paragraphs), paragraphs, mode="ooxml", findings=findings)
        if asset_format is AssetFormat.PPTX:
            slides = _pptx_slides(payload, self.limits)
            return self._output(asset_format, tier, "\n\n".join(slides), slides, mode="ooxml")
        if asset_format is AssetFormat.XLSX:
            cells = _xlsx_cells(payload, self.limits)
            return self._output(asset_format, tier, "\n".join(cells), cells, mode="ooxml")
        if asset_format is AssetFormat.IMAGE:
            return AdapterOutput(
                _image_document(tier),
                {"parser": self.identity.adapter_id, "format": asset_format.value, "mode": "ocr-unavailable"},
            )
        raise ValueError(f"native parser does not support {asset_format.value}")

    def _output(self, asset_format: AssetFormat, tier: FormatTier, source: str, segments: Iterable[str], *, mode: str, findings: tuple[ExtractionFinding, ...] = ()) -> AdapterOutput:
        retained_segments = tuple(segments)
        if len(source) > self.limits.max_decoded_chars or len(retained_segments) > self.limits.max_segments:
            raise ParserResourceLimitError("normalized parser output exceeds budget")
        return AdapterOutput(
            _document(asset_format, tier, source, retained_segments, findings=findings),
            {"parser": self.identity.adapter_id, "format": asset_format.value, "mode": mode, "source_text": source, "segments": retained_segments},
        )


def _tier_for(asset_format: AssetFormat) -> FormatTier:
    if asset_format in {AssetFormat.PPTX, AssetFormat.XLSX, AssetFormat.IMAGE}:
        return FormatTier.EXTRACTION_ONLY
    return FormatTier.STRUCTURED_SECONDARY


def _decode(payload: bytes, limits: NativeParserLimits) -> str:
    text = payload.decode("utf-8", errors="replace")
    if len(text) > limits.max_decoded_chars:
        raise ParserResourceLimitError("decoded text exceeds parser budget")
    return text


def _paragraphs(text: str, limits: NativeParserLimits) -> tuple[str, ...]:
    for count, _ in enumerate(re.finditer(r"\n[ \t]*\n+", text), start=1):
        if count >= limits.max_segments:
            raise ParserResourceLimitError("text structure exceeds parser budget")
    return tuple(part.strip() for part in re.split(r"\n[ \t]*\n+", text) if part.strip())

def _document(asset_format: AssetFormat, tier: FormatTier, source: str, segments: Iterable[str], *, findings: tuple[ExtractionFinding, ...] = ()) -> NormalizedDocument:
    normalized = source.strip()
    blocks: list[NormalizedBlock] = []
    spans: list[NormalizedSpan] = []
    for ordinal, source_segment in enumerate(segments):
        text = source_segment.strip()
        if not text:
            continue
        block_key = f"block-{len(blocks) + 1}"
        blocks.append(
            NormalizedBlock(
                key=block_key,
                kind=BlockKind.PARAGRAPH,
                ordinal=len(blocks),
                page_number=1,
                part_key="root",
                source_text=source_segment,
                ocr_text=None,
                normalized_text=text,
                confidence=1.0,
            )
        )
        spans.append(
            NormalizedSpan(
                key=f"span-{len(spans) + 1}",
                block_key=block_key,
                ordinal=0,
                start_offset=0,
                end_offset=len(text),
                text=text,
                confidence=1.0,
            )
        )
    return NormalizedDocument(
        format=asset_format,
        tier=tier,
        viewable=tier is FormatTier.STRUCTURED_SECONDARY,
        annotation_capable=tier is FormatTier.STRUCTURED_SECONDARY,
        parts=(DocumentPart(key="root", kind="document", title="Document", ordinal=0),),
        pages=(NormalizedPage(number=1, mode=PageMode.BORN_DIGITAL, source_text=source, ocr_text=None, normalized_text=normalized, confidence=1.0),),
        blocks=tuple(blocks),
        findings=findings,
        spans=tuple(spans),
        limitations=("extraction_only_no_reader",) if tier is FormatTier.EXTRACTION_ONLY else (),
    )


def _image_document(tier: FormatTier) -> NormalizedDocument:
    return NormalizedDocument(
        format=AssetFormat.IMAGE,
        tier=tier,
        viewable=False,
        annotation_capable=False,
        parts=(DocumentPart(key="root", kind="document", title="Image", ordinal=0),),
        pages=(NormalizedPage(number=1, mode=PageMode.OCR, source_text="", ocr_text=None, normalized_text="", confidence=0.0),),
        limitations=("extraction_only_no_reader", "ocr_runtime_not_promoted"),
        findings=(ExtractionFinding("ocr_runtime_not_promoted", FindingSeverity.WARNING, "OCR runtime is not promoted; image text was not invented", page_number=1),),
    )


def _member_map(payload: bytes, limits: NativeParserLimits) -> dict[str, zipfile.ZipInfo]:
    try:
        bundle = zipfile.ZipFile(BytesIO(payload))
    except zipfile.BadZipFile as exc:
        raise ValueError("malformed OOXML archive") from exc
    with bundle:
        infos = bundle.infolist()
        if len(infos) > limits.max_archive_entries:
            raise ParserResourceLimitError("OOXML archive exceeds entry budget")
        total = 0
        members: dict[str, zipfile.ZipInfo] = {}
        for info in infos:
            _validate_member(info, limits)
            if info.is_dir():
                continue
            if info.filename in members:
                raise ValueError("OOXML archive has duplicate members")
            total += info.file_size
            if total > limits.max_archive_total_bytes:
                raise ParserResourceLimitError("OOXML archive exceeds total byte budget")
            members[info.filename] = info
        return members


def _validate_member(info: zipfile.ZipInfo, limits: NativeParserLimits) -> None:
    path = PurePosixPath(info.filename)
    if not info.filename or info.filename.startswith(("/", "\\")) or ".." in path.parts:
        raise ValueError("unsafe OOXML member path")
    if stat.S_ISLNK(info.external_attr >> 16):
        raise ValueError("unsafe OOXML symlink")
    if info.file_size > limits.max_archive_member_bytes:
        raise ParserResourceLimitError("OOXML member exceeds byte budget")
    if info.file_size and not info.compress_size:
        raise ValueError("OOXML member has invalid compressed size")
    if info.compress_size and info.file_size > info.compress_size * limits.max_compression_ratio:
        raise ParserResourceLimitError("OOXML member exceeds compression budget")


def _read_members(payload: bytes, wanted: Iterable[str], limits: NativeParserLimits) -> dict[str, bytes]:
    members = _member_map(payload, limits)
    selected = tuple(name for name in wanted if name in members)
    try:
        with zipfile.ZipFile(BytesIO(payload)) as bundle:
            return {name: bundle.read(members[name]) for name in selected}
    except zipfile.BadZipFile as exc:
        raise ValueError("malformed OOXML archive") from exc


def _xml_root(content: bytes, limits: NativeParserLimits) -> ElementTree.Element:
    try:
        parsed = ElementTree.iterparse(BytesIO(content), events=("start",))
        for count, _ in enumerate(parsed, start=1):
            if count > limits.max_xml_nodes:
                raise ParserResourceLimitError("OOXML document exceeds node budget")
        if parsed.root is None:
            raise ValueError("malformed OOXML XML")
        return parsed.root
    except ElementTree.ParseError as exc:
        raise ValueError("malformed OOXML XML") from exc


def _local_name(element: ElementTree.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]

def _docx_content(payload: bytes, limits: NativeParserLimits) -> tuple[tuple[str, ...], tuple[ExtractionFinding, ...]]:
    content = _read_members(payload, ("word/document.xml",), limits).get("word/document.xml")
    if content is None:
        raise ValueError("DOCX document member is missing")
    root = _xml_root(content, limits)
    nodes = tuple(root.iter())
    paragraphs: list[str] = []
    text_chars = 0
    for paragraph in nodes:
        if _local_name(paragraph) != "p":
            continue
        text = "".join(node.text or "" for node in paragraph.iter() if _local_name(node) == "t").strip()
        if not text:
            continue
        if len(paragraphs) >= limits.max_segments or text_chars + len(text) > limits.max_decoded_chars:
            raise ParserResourceLimitError("DOCX text exceeds parser budget")
        paragraphs.append(text)
        text_chars += len(text)
    findings: list[ExtractionFinding] = []
    if any(_local_name(node) == "tbl" for node in nodes):
        findings.append(ExtractionFinding("table_extraction_missing", FindingSeverity.WARNING, "Detected DOCX table text is retained without normalized cell structure"))
    if any(_local_name(node) in {"footnoteReference", "endnoteReference"} for node in nodes):
        findings.append(ExtractionFinding("footnote_extraction_missing", FindingSeverity.WARNING, "Detected DOCX note links require structural review"))
    if any(_local_name(node) == "instrText" and any(marker in (node.text or "").upper() for marker in {"CITATION", "BIBLIOGRAPHY"}) for node in nodes):
        findings.append(ExtractionFinding("reference_extraction_missing", FindingSeverity.WARNING, "Detected DOCX citation fields require structural review"))
    return tuple(paragraphs), tuple(findings)


def _pptx_slides(payload: bytes, limits: NativeParserLimits) -> tuple[str, ...]:
    members = _member_map(payload, limits)
    names = sorted(name for name in members if re.fullmatch(r"ppt/slides/slide\d+\.xml", name))
    contents = _read_members(payload, names, limits)
    slides: list[str] = []
    text_chars = 0
    for name in names:
        text = "".join(node.text or "" for node in _xml_root(contents[name], limits).iter() if _local_name(node) == "t").strip()
        if not text:
            continue
        if len(slides) >= limits.max_segments or text_chars + len(text) > limits.max_decoded_chars:
            raise ParserResourceLimitError("PPTX text exceeds parser budget")
        slides.append(text)
        text_chars += len(text)
    return tuple(slides)


def _xlsx_cells(payload: bytes, limits: NativeParserLimits) -> tuple[str, ...]:
    members = _member_map(payload, limits)
    wanted = [name for name in members if name == "xl/sharedStrings.xml" or re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)]
    contents = _read_members(payload, sorted(wanted), limits)
    shared = _shared_strings(contents.get("xl/sharedStrings.xml"), limits)
    values: list[str] = []
    text_chars = 0
    for name in sorted(item for item in contents if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", item)):
        for cell in _xml_root(contents[name], limits).iter():
            if _local_name(cell) != "c":
                continue
            value = _cell_value(cell, shared)
            if not value:
                continue
            if len(values) >= limits.max_segments or text_chars + len(value) > limits.max_decoded_chars:
                raise ParserResourceLimitError("XLSX text exceeds parser budget")
            values.append(value)
            text_chars += len(value)
    return tuple(values)


def _shared_strings(content: bytes | None, limits: NativeParserLimits) -> tuple[str, ...]:
    if content is None:
        return ()
    values: list[str] = []
    text_chars = 0
    for item in _xml_root(content, limits).iter():
        if _local_name(item) != "si":
            continue
        value = "".join(node.text or "" for node in item.iter() if _local_name(node) == "t")
        if len(values) >= limits.max_segments or text_chars + len(value) > limits.max_decoded_chars:
            raise ParserResourceLimitError("XLSX shared strings exceed parser budget")
        values.append(value)
        text_chars += len(value)
    return tuple(values)


def _cell_value(cell: ElementTree.Element, shared: tuple[str, ...]) -> str:
    inline = "".join(node.text or "" for node in cell.iter() if _local_name(node) == "t").strip()
    if inline:
        return inline
    raw = next((node.text for node in cell.iter() if _local_name(node) == "v" and node.text), "")
    if cell.attrib.get("t") == "s":
        try:
            return shared[int(raw)]
        except (IndexError, ValueError):
            return ""
    return raw.strip()
