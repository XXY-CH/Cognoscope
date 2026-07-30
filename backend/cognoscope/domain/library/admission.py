"""Admission policy: byte-derived format decisions and bounded archive inspection."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
import re
import stat
import zipfile


class AssetFormat(StrEnum):
    PDF = "pdf"
    EPUB = "epub"
    DOCX = "docx"
    HTML = "html"
    MARKDOWN = "markdown"
    TEXT = "text"
    PPTX = "pptx"
    XLSX = "xlsx"
    IMAGE = "image"
    CLOSED_EBOOK = "closed_ebook"


class FormatTier(StrEnum):
    FIRST_CLASS = "first_class"
    STRUCTURED_SECONDARY = "structured_secondary"
    EXTRACTION_ONLY = "extraction_only"


@dataclass(frozen=True)
class ArchiveLimits:
    max_entries: int = 2_000
    max_entry_bytes: int = 64 * 1024 * 1024
    max_uncompressed_bytes: int = 256 * 1024 * 1024
    max_compression_ratio: int = 100


@dataclass(frozen=True)
class FormatClassification:
    format: AssetFormat
    tier: FormatTier
    media_type: str


class AdmissionRejected(ValueError):
    """Raised when untrusted bytes cannot safely become an admitted asset."""


_FORMATS: dict[AssetFormat, FormatClassification] = {
    AssetFormat.PDF: FormatClassification(AssetFormat.PDF, FormatTier.FIRST_CLASS, "application/pdf"),
    AssetFormat.EPUB: FormatClassification(AssetFormat.EPUB, FormatTier.FIRST_CLASS, "application/epub+zip"),
    AssetFormat.DOCX: FormatClassification(
        AssetFormat.DOCX,
        FormatTier.STRUCTURED_SECONDARY,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    AssetFormat.HTML: FormatClassification(AssetFormat.HTML, FormatTier.STRUCTURED_SECONDARY, "text/html"),
    AssetFormat.MARKDOWN: FormatClassification(AssetFormat.MARKDOWN, FormatTier.STRUCTURED_SECONDARY, "text/markdown"),
    AssetFormat.TEXT: FormatClassification(AssetFormat.TEXT, FormatTier.STRUCTURED_SECONDARY, "text/plain"),
    AssetFormat.PPTX: FormatClassification(
        AssetFormat.PPTX,
        FormatTier.EXTRACTION_ONLY,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
    AssetFormat.XLSX: FormatClassification(
        AssetFormat.XLSX,
        FormatTier.EXTRACTION_ONLY,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    AssetFormat.IMAGE: FormatClassification(AssetFormat.IMAGE, FormatTier.EXTRACTION_ONLY, "image/*"),
}

_MEDIA_TYPES = {
    "application/pdf": AssetFormat.PDF,
    "application/epub+zip": AssetFormat.EPUB,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": AssetFormat.DOCX,
    "text/html": AssetFormat.HTML,
    "text/markdown": AssetFormat.MARKDOWN,
    "text/plain": AssetFormat.TEXT,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": AssetFormat.PPTX,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": AssetFormat.XLSX,
}

_MARKDOWN_MARKER = re.compile(r"(?m)^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```)")


def _reject_archive(info: zipfile.ZipInfo) -> None:
    name = info.filename
    parts = Path(name).parts
    if not name or name.startswith(("/", "\\")) or ".." in parts or any(part in {"", "."} for part in parts):
        raise AdmissionRejected("unsafe archive path")
    if info.flag_bits & 0x1:
        raise AdmissionRejected("DRM or closed ebook archive encryption is not supported")
    mode = info.external_attr >> 16
    if stat.S_ISLNK(mode):
        raise AdmissionRejected("unsafe archive symlink")


def _read_bounded(bundle: zipfile.ZipFile, info: zipfile.ZipInfo, maximum: int) -> bytes:
    if info.file_size > maximum:
        raise AdmissionRejected("archive entry exceeds inspection limit")
    with bundle.open(info) as source:
        data = source.read(maximum + 1)
    if len(data) > maximum:
        raise AdmissionRejected("archive entry exceeds inspection limit")
    return data


def _inspect_zip(path: Path, limits: ArchiveLimits) -> AssetFormat:
    try:
        with zipfile.ZipFile(path) as bundle:
            infos = bundle.infolist()
            if len(infos) > limits.max_entries:
                raise AdmissionRejected("archive has too many entries")
            total = 0
            names: set[str] = set()
            first_info: zipfile.ZipInfo | None = None
            epub_mimetype: bytes | None = None
            for index, info in enumerate(infos):
                _reject_archive(info)
                if index == 0:
                    first_info = info
                if info.is_dir():
                    continue
                if info.file_size > limits.max_entry_bytes:
                    raise AdmissionRejected("archive entry exceeds inspection limit")
                if info.compress_size and info.file_size > info.compress_size * limits.max_compression_ratio:
                    raise AdmissionRejected("archive compression ratio exceeds inspection limit")
                total += info.file_size
                if total > limits.max_uncompressed_bytes:
                    raise AdmissionRejected("archive uncompressed size exceeds inspection limit")
                names.add(info.filename)
                if info.filename == "mimetype":
                    epub_mimetype = _read_bounded(bundle, info, 128)
                if info.filename.lower().endswith((".zip", ".jar", ".epub", ".docx", ".xlsx", ".pptx")):
                    payload = _read_bounded(bundle, info, 8)
                    if payload.startswith(b"PK\x03\x04"):
                        raise AdmissionRejected("nested archives are not admitted")

            if "META-INF/encryption.xml" in names:
                raise AdmissionRejected("DRM or closed ebook archive encryption is not supported")
            if (
                first_info is not None
                and first_info.filename == "mimetype"
                and first_info.compress_type == zipfile.ZIP_STORED
                and epub_mimetype == b"application/epub+zip"
                and "META-INF/container.xml" in names
            ):
                return AssetFormat.EPUB
            if "[Content_Types].xml" in names and "word/document.xml" in names:
                return AssetFormat.DOCX
            if "[Content_Types].xml" in names and "ppt/presentation.xml" in names:
                return AssetFormat.PPTX
            if "[Content_Types].xml" in names and "xl/workbook.xml" in names:
                return AssetFormat.XLSX
    except zipfile.BadZipFile as exc:
        raise AdmissionRejected("malformed archive") from exc
    raise AdmissionRejected("unsupported archive format")


def _is_image(prefix: bytes, tail: bytes) -> bool:
    return (
        (prefix.startswith(b"\x89PNG\r\n\x1a\n") and tail.endswith(b"IEND\xaeB`\x82"))
        or (prefix.startswith(b"\xff\xd8\xff") and tail.endswith(b"\xff\xd9"))
        or (prefix.startswith((b"GIF87a", b"GIF89a")) and tail.endswith(b";"))
        or prefix.startswith((b"II*\x00", b"MM\x00*"))
    )


def sniff_format(path: Path, limits: ArchiveLimits = ArchiveLimits()) -> FormatClassification:
    """Classify only verified private bytes; callers never influence this with a name."""

    with path.open("rb") as source:
        prefix = source.read(16 * 1024)
        source.seek(max(path.stat().st_size - 1024, 0))
        tail = source.read(1024)
    if b"BOOKMOBI" in prefix[:128] or prefix.startswith(b"TPZ") or prefix.startswith(b"CONT"):
        raise AdmissionRejected("DRM or closed ebook format is not supported")
    if prefix.startswith(b"%PDF-"):
        if b"%%EOF" not in tail:
            raise AdmissionRejected("malformed PDF")
        return _FORMATS[AssetFormat.PDF]
    if prefix.startswith(b"PK\x03\x04"):
        return _FORMATS[_inspect_zip(path, limits)]
    if _is_image(prefix, tail):
        return _FORMATS[AssetFormat.IMAGE]
    try:
        text = prefix.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise AdmissionRejected("unsupported or malformed binary format") from exc
    if any(byte < 32 and byte not in {9, 10, 13} for byte in prefix):
        raise AdmissionRejected("unsupported or malformed binary format")
    normalized = text.lstrip("\ufeff\t\r\n ").lower()
    if normalized.startswith(("<!doctype html", "<html", "<head", "<body")):
        return _FORMATS[AssetFormat.HTML]
    if not normalized:
        raise AdmissionRejected("empty uploads are not admitted")
    if _MARKDOWN_MARKER.search(text):
        return _FORMATS[AssetFormat.MARKDOWN]
    return _FORMATS[AssetFormat.TEXT]


def validate_declared_media_type(classification: FormatClassification, declared_media_type: str | None) -> None:
    """Use a request MIME value only as a mismatch detector, never as a classifier."""

    if not declared_media_type or declared_media_type == "application/octet-stream":
        return
    expected = _MEDIA_TYPES.get(declared_media_type.lower())
    if expected is None or expected is not classification.format:
        raise AdmissionRejected("declared media type does not match inspected bytes")
