"""Portable bibliography exports and authenticated authority snapshots."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
from uuid import uuid4

from cognoscope.infrastructure.postgres.authority_repository import AuthorityRepository
from cognoscope.infrastructure.storage import BlobHandle, PrivateBlobStore


_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_BIB_TYPES = {"article": "article-journal", "book": "book", "incollection": "chapter"}
_CSL_TYPES = {value: key for key, value in _BIB_TYPES.items()}
_SNAPSHOT_FORMAT_VERSION = 2


@dataclass(frozen=True)
class BibliographyBundle:
    csl_json: str
    bibtex: str
    biblatex: str


@dataclass(frozen=True)
class SnapshotBlob:
    digest: str
    byte_size: int


@dataclass(frozen=True)
class SnapshotResult:
    generation: int
    path: Path


class ExportService:
    """Exports portable research metadata separately from operational snapshots."""

    def __init__(self, repository: AuthorityRepository, storage: PrivateBlobStore, *, manifest_key: bytes) -> None:
        if not manifest_key:
            raise ValueError("snapshot manifest key is required")
        self._repository = repository
        self._storage = storage
        self._manifest_key = manifest_key

    async def export_bibliography(self, record_id: str) -> BibliographyBundle:
        return self.bibliography_bundle(await self._repository.bibliography_csl(record_id))

    @staticmethod
    def bibliography_bundle(csl: dict[str, object]) -> BibliographyBundle:
        ExportService._validate_csl(csl)
        csl_json = json.dumps(csl, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        entry_type = _CSL_TYPES.get(str(csl["type"]), "misc")
        fields = [
            ("title", str(csl["title"])),
            ("author", ExportService._authors(csl.get("author"))),
            ("year", ExportService._year(csl.get("issued"))),
            ("doi", str(csl.get("DOI", ""))),
        ]
        bibtex_fields = ",\n".join(f"  {name} = {{{value}}}" for name, value in fields if value)
        biblatex_fields = ",\n".join(
            f"  {'date' if name == 'year' else name} = {{{value}}}" for name, value in fields if value
        )
        key = str(csl["id"])
        return BibliographyBundle(
            csl_json=csl_json,
            bibtex=f"@{entry_type}{{{key},\n{bibtex_fields}\n}}\n",
            biblatex=f"@{entry_type}{{{key},\n{biblatex_fields}\n}}\n",
        )

    @staticmethod
    def parse_bibliography(csl_json: str) -> dict[str, object]:
        try:
            csl = json.loads(csl_json)
        except json.JSONDecodeError as exc:
            raise ValueError("CSL JSON is malformed") from exc
        if not isinstance(csl, dict):
            raise ValueError("CSL JSON must be an object")
        ExportService._validate_csl(csl)
        return csl

    @classmethod
    def parse_bibtex(cls, source: str) -> dict[str, object]:
        return cls._csl_from_bib_entry(source, date_field="year")

    @classmethod
    def parse_biblatex(cls, source: str) -> dict[str, object]:
        return cls._csl_from_bib_entry(source, date_field="date")

    async def create_snapshot(self, destination: Path) -> Path:
        authority_snapshot = await self._repository.snapshot_authority()
        snapshot = destination / f"snapshot-{uuid4()}"
        blobs_dir = snapshot / "blobs"
        snapshot.mkdir(parents=True, mode=0o700)
        os.chmod(snapshot, 0o700)
        blobs_dir.mkdir(mode=0o700)
        authority_bytes = self._canonical_bytes(authority_snapshot.dump)
        self._write_snapshot_file(snapshot / "authority.json", authority_bytes)
        for blob in authority_snapshot.blobs:
            await self._storage.copy_verified_to(blob, blobs_dir)
        manifest = {
            "format_version": _SNAPSHOT_FORMAT_VERSION,
            "generation": authority_snapshot.generation,
            "authority_sha256": hashlib.sha256(authority_bytes).hexdigest(),
            "blobs": [{"digest": blob.digest, "byte_size": blob.byte_size} for blob in authority_snapshot.blobs],
        }
        manifest["signature"] = self._sign(manifest)
        manifest_path = snapshot / "manifest.json"
        self._write_snapshot_file(manifest_path, self._canonical_bytes(manifest))
        self._fsync_directory(snapshot)
        self._fsync_directory(destination)
        return snapshot

    async def restore_snapshot(
        self,
        snapshot: Path,
        target_repository: AuthorityRepository,
        destination_storage: PrivateBlobStore,
    ) -> SnapshotResult:
        manifest = self._load_json(snapshot / "manifest.json", "snapshot manifest")
        signature = manifest.pop("signature", None)
        if not isinstance(signature, str) or not hmac.compare_digest(signature, self._sign(manifest)):
            raise ValueError("snapshot manifest authentication failed")
        if manifest.get("format_version") != _SNAPSHOT_FORMAT_VERSION or type(manifest.get("generation")) is not int:
            raise ValueError("snapshot manifest version is invalid")
        authority_path = snapshot / "authority.json"
        if not authority_path.is_file() or authority_path.is_symlink():
            raise ValueError("snapshot authority dump is missing")
        authority_bytes = authority_path.read_bytes()
        if manifest.get("authority_sha256") != hashlib.sha256(authority_bytes).hexdigest():
            raise ValueError("snapshot authority dump hash is invalid")
        try:
            dump = json.loads(authority_bytes)
        except json.JSONDecodeError as exc:
            raise ValueError("snapshot authority dump is malformed") from exc
        if not isinstance(dump, dict) or dump.get("generation") != manifest["generation"]:
            raise ValueError("snapshot authority generation is invalid")
        blobs = self._snapshot_blobs(manifest.get("blobs"))
        handles = tuple(BlobHandle(blob.digest, blob.byte_size) for blob in blobs)
        target_repository.validate_snapshot_blob_refs(dump, handles)
        self._verify_snapshot_blob_set(snapshot / "blobs", blobs)

        for blob in handles:
            await destination_storage.import_verified_snapshot_blob(snapshot / "blobs" / blob.digest, blob)
        generation = await target_repository.restore_authority(dump)
        if generation != manifest["generation"]:
            raise ValueError("restored authority generation is invalid")
        return SnapshotResult(generation=generation, path=snapshot)

    def _sign(self, manifest_without_signature: dict[str, object]) -> str:
        return hmac.new(self._manifest_key, self._canonical_bytes(manifest_without_signature), hashlib.sha256).hexdigest()

    @staticmethod
    def _canonical_bytes(value: object) -> bytes:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

    @staticmethod
    def _write_snapshot_file(path: Path, payload: bytes) -> None:
        with path.open("xb") as target:
            target.write(payload)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(path, 0o600)

    @staticmethod
    def _fsync_directory(directory: Path) -> None:
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    @staticmethod
    def _digest(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _load_json(path: Path, description: str) -> dict[str, object]:
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"{description} is missing")
        try:
            payload = json.loads(path.read_bytes())
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"{description} is malformed") from exc
        if not isinstance(payload, dict):
            raise ValueError(f"{description} is invalid")
        return payload

    @staticmethod
    def _snapshot_blobs(value: object) -> tuple[SnapshotBlob, ...]:
        if not isinstance(value, list):
            raise ValueError("snapshot blob manifest is invalid")
        blobs: list[SnapshotBlob] = []
        for item in value:
            if not isinstance(item, dict) or set(item) != {"digest", "byte_size"}:
                raise ValueError("snapshot blob manifest is invalid")
            digest, byte_size = item["digest"], item["byte_size"]
            if not isinstance(digest, str) or not _DIGEST.fullmatch(digest) or type(byte_size) is not int or byte_size < 0:
                raise ValueError("snapshot blob manifest is invalid")
            blobs.append(SnapshotBlob(digest, byte_size))
        if len({blob.digest for blob in blobs}) != len(blobs):
            raise ValueError("snapshot blob manifest repeats a digest")
        return tuple(sorted(blobs, key=lambda blob: blob.digest))

    @staticmethod
    def _verify_snapshot_blob_set(directory: Path, blobs: tuple[SnapshotBlob, ...]) -> None:
        if not directory.is_dir() or directory.is_symlink():
            raise ValueError("snapshot blobs are missing")
        expected = {blob.digest for blob in blobs}
        actual = {entry.name for entry in directory.iterdir()}
        if actual != expected:
            raise ValueError("snapshot blobs are incomplete or contain extras")
        for blob in blobs:
            candidate = directory / blob.digest
            if candidate.is_symlink() or not candidate.is_file() or candidate.stat().st_size != blob.byte_size:
                raise ValueError("snapshot blob is invalid")
            digest = ExportService._digest(candidate)
            if digest != blob.digest:
                raise ValueError("snapshot blob hash is invalid")

    @classmethod
    def _csl_from_bib_entry(cls, source: str, *, date_field: str) -> dict[str, object]:
        entry_type, identifier, fields = cls._parse_bib_entry(source)
        title = fields.get("title")
        if not title:
            raise ValueError("bibliography entry requires title")
        csl: dict[str, object] = {
            "id": identifier,
            "type": _BIB_TYPES.get(entry_type.lower(), "misc"),
            "title": title,
        }
        authors = cls._parse_authors(fields.get("author"))
        if authors:
            csl["author"] = authors
        doi = fields.get("doi")
        if doi:
            csl["DOI"] = doi
        date = fields.get(date_field) or fields.get("year") or fields.get("date")
        year = cls._bib_year(date)
        if year is not None:
            csl["issued"] = {"date-parts": [[year]]}
        cls._validate_csl(csl)
        return csl

    @staticmethod
    def _parse_bib_entry(source: str) -> tuple[str, str, dict[str, str]]:
        text = source.strip()
        if not text.startswith("@"):
            raise ValueError("bibliography entry is malformed")
        index = 1
        while index < len(text) and (text[index].isalnum() or text[index] in "_-" ):
            index += 1
        entry_type = text[1:index]
        while index < len(text) and text[index].isspace():
            index += 1
        if not entry_type or index >= len(text) or text[index] not in "{(":
            raise ValueError("bibliography entry is malformed")
        closer = "}" if text[index] == "{" else ")"
        index += 1
        identifier_start = index
        while index < len(text) and text[index] != ",":
            index += 1
        identifier = text[identifier_start:index].strip()
        if not identifier or index >= len(text):
            raise ValueError("bibliography entry is malformed")
        index += 1
        fields: dict[str, str] = {}
        while True:
            while index < len(text) and (text[index].isspace() or text[index] == ","):
                index += 1
            if index >= len(text):
                raise ValueError("bibliography entry is malformed")
            if text[index] == closer:
                if text[index + 1 :].strip():
                    raise ValueError("bibliography entry is malformed")
                return entry_type, identifier, fields
            field_start = index
            while index < len(text) and (text[index].isalnum() or text[index] in "_-" ):
                index += 1
            field = text[field_start:index].lower()
            while index < len(text) and text[index].isspace():
                index += 1
            if not field or index >= len(text) or text[index] != "=":
                raise ValueError("bibliography entry is malformed")
            index += 1
            while index < len(text) and text[index].isspace():
                index += 1
            if index >= len(text):
                raise ValueError("bibliography entry is malformed")
            if text[index] == "{":
                value, index = ExportService._read_braced(text, index)
            elif text[index] == '"':
                value, index = ExportService._read_quoted(text, index)
            else:
                value_start = index
                while index < len(text) and text[index] not in f",{closer}":
                    index += 1
                value = text[value_start:index].strip()
            if field in fields:
                raise ValueError("bibliography entry repeats a field")
            fields[field] = value.strip()

    @staticmethod
    def _read_braced(text: str, index: int) -> tuple[str, int]:
        index += 1
        start = index
        depth = 1
        while index < len(text):
            if text[index] == "\\":
                index += 2
                continue
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
                if depth == 0:
                    return text[start:index], index + 1
            index += 1
        raise ValueError("bibliography entry is malformed")

    @staticmethod
    def _read_quoted(text: str, index: int) -> tuple[str, int]:
        index += 1
        value: list[str] = []
        while index < len(text):
            if text[index] == "\\" and index + 1 < len(text):
                value.append(text[index + 1])
                index += 2
                continue
            if text[index] == '"':
                return "".join(value), index + 1
            value.append(text[index])
            index += 1
        raise ValueError("bibliography entry is malformed")

    @staticmethod
    def _validate_csl(csl: dict[str, object]) -> None:
        for field in ("id", "type", "title"):
            if not isinstance(csl.get(field), str) or not str(csl[field]).strip():
                raise ValueError(f"CSL JSON requires {field}")

    @staticmethod
    def _authors(value: object) -> str:
        if not isinstance(value, list):
            return ""
        authors: list[str] = []
        for person in value:
            if isinstance(person, dict):
                literal = person.get("literal")
                family, given = person.get("family"), person.get("given")
                if isinstance(literal, str):
                    authors.append(literal)
                elif isinstance(family, str):
                    authors.append(f"{family}, {given}" if isinstance(given, str) else family)
        return " and ".join(authors)

    @staticmethod
    def _parse_authors(value: str | None) -> list[dict[str, str]]:
        if not value:
            return []
        authors: list[dict[str, str]] = []
        for name in value.split(" and "):
            name = name.strip()
            if not name:
                continue
            if "," in name:
                family, given = (part.strip() for part in name.split(",", 1))
                if family:
                    person = {"family": family}
                    if given:
                        person["given"] = given
                    authors.append(person)
            else:
                authors.append({"literal": name})
        return authors

    @staticmethod
    def _year(value: object) -> str:
        if not isinstance(value, dict):
            return ""
        parts = value.get("date-parts")
        if isinstance(parts, list) and parts and isinstance(parts[0], list) and parts[0] and type(parts[0][0]) is int:
            return str(parts[0][0])
        return ""

    @staticmethod
    def _bib_year(value: str | None) -> int | None:
        if value is None:
            return None
        match = re.search(r"\b(\d{4})\b", value)
        return int(match.group(1)) if match else None
