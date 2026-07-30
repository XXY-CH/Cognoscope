"""Private content-addressed local storage with staged atomic publication."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterable, Iterable, Mapping
from dataclasses import dataclass
import hashlib
import inspect
import os
from pathlib import Path
import re
import shutil
from typing import Callable
from uuid import uuid4

from cognoscope.domain.library import ArchiveLimits, FormatClassification, sniff_format


_DIGEST = re.compile(r"^[a-f0-9]{64}$")


@dataclass(frozen=True)
class QuarantinedUpload:
    id: str
    digest: str
    byte_size: int


@dataclass(frozen=True)
class StagedBlob:
    digest: str
    byte_size: int


@dataclass(frozen=True)
class BlobHandle:
    digest: str
    byte_size: int


@dataclass(frozen=True)
class ReconciliationReport:
    removed_staging: tuple[str, ...]
    removed_orphans: tuple[str, ...]
    missing_references: tuple[str, ...]
    invalid_content: tuple[str, ...]


Inspection = Callable[[Path], bool | asyncio.Future[bool]]


class PrivateBlobStore:
    """Owns private file paths; application callers exchange digest handles only."""

    def __init__(self, root: Path, *, max_upload_bytes: int = 512 * 1024 * 1024) -> None:
        self._root = root.resolve()
        self._quarantine = self._root / "quarantine"
        self._staging = self._root / "staging"
        self._content = self._root / "content"
        self._max_upload_bytes = max_upload_bytes
        for directory in (self._root, self._quarantine, self._staging, self._content):
            directory.mkdir(parents=True, exist_ok=True)
            os.chmod(directory, 0o700)

    def _quarantine_path(self, upload_id: str) -> Path:
        return self._quarantine / upload_id

    def _staged_path(self, digest: str) -> Path:
        self._validate_digest(digest)
        return self._staging / digest

    def _content_path(self, digest: str) -> Path:
        self._validate_digest(digest)
        return self._content / digest[:2] / digest

    @staticmethod
    def _validate_digest(digest: str) -> None:
        if not _DIGEST.fullmatch(digest):
            raise ValueError("invalid blob digest")

    @staticmethod
    def _fsync_directory(directory: Path) -> None:
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    @staticmethod
    async def _chunks(chunks: AsyncIterable[bytes] | Iterable[bytes]):
        if hasattr(chunks, "__aiter__"):
            async for chunk in chunks:  # type: ignore[union-attr]
                yield chunk
        else:
            for chunk in chunks:  # type: ignore[union-attr]
                yield chunk

    async def quarantine_upload(self, chunks: AsyncIterable[bytes] | Iterable[bytes]) -> QuarantinedUpload:
        upload_id = str(uuid4())
        destination = self._quarantine_path(upload_id)
        digest = hashlib.sha256()
        total = 0
        try:
            with destination.open("xb") as target:
                os.chmod(destination, 0o600)
                async for chunk in self._chunks(chunks):
                    if not isinstance(chunk, bytes):
                        raise TypeError("upload chunks must be bytes")
                    total += len(chunk)
                    if total > self._max_upload_bytes:
                        raise ValueError("upload exceeds maximum upload size")
                    digest.update(chunk)
                    target.write(chunk)
                target.flush()
                os.fsync(target.fileno())
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
        self._fsync_directory(self._quarantine)
        return QuarantinedUpload(upload_id, digest.hexdigest(), total)

    async def inspect(
        self,
        upload: QuarantinedUpload,
        *,
        archive_limits: ArchiveLimits = ArchiveLimits(),
        inspection: Inspection | None = None,
    ) -> FormatClassification:
        path = self._quarantine_path(upload.id)
        if not path.is_file() or path.stat().st_size != upload.byte_size or self._digest(path) != upload.digest:
            raise ValueError("quarantine integrity check failed")
        classification = sniff_format(path, archive_limits)
        if inspection is not None:
            outcome = inspection(path)
            if inspect.isawaitable(outcome):
                outcome = await outcome
            if outcome is not True:
                raise ValueError("content inspection rejected upload")
        return classification

    async def stage(self, upload: QuarantinedUpload) -> StagedBlob:
        source = self._quarantine_path(upload.id)
        destination = self._staged_path(upload.digest)
        if not source.is_file() or source.stat().st_size != upload.byte_size or self._digest(source) != upload.digest:
            raise ValueError("quarantine integrity check failed")
        if destination.exists():
            source.unlink(missing_ok=True)
        else:
            os.replace(source, destination)
            os.chmod(destination, 0o600)
            self._fsync_directory(self._staging)
        self._fsync_directory(self._quarantine)
        return StagedBlob(upload.digest, upload.byte_size)

    async def publish(self, staged: StagedBlob) -> BlobHandle:
        source = self._staged_path(staged.digest)
        destination = self._content_path(staged.digest)
        if not source.is_file() or source.stat().st_size != staged.byte_size or self._digest(source) != staged.digest:
            raise ValueError("staging integrity check failed")
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.chmod(destination.parent, 0o700)
        if destination.exists():
            if not await self.verify(BlobHandle(staged.digest, staged.byte_size)):
                raise ValueError("existing content-addressed blob failed verification")
            source.unlink()
        else:
            os.replace(source, destination)
            os.chmod(destination, 0o600)
            self._fsync_directory(destination.parent)
        self._fsync_directory(self._staging)
        return BlobHandle(staged.digest, staged.byte_size)

    async def verify(self, blob: BlobHandle) -> bool:
        path = self._content_path(blob.digest)
        return path.is_file() and path.stat().st_size == blob.byte_size and self._digest(path) == blob.digest

    async def read_verified(self, blob: BlobHandle, *, max_bytes: int | None = None) -> bytes:
        """Read immutable content through one descriptor and verify the returned bytes."""

        self._validate_digest(blob.digest)
        limit = self._max_upload_bytes if max_bytes is None else max_bytes
        if limit < 0 or blob.byte_size > limit:
            raise ValueError("blob exceeds parser input limit")
        path = self._content_path(blob.digest)

        def read() -> bytes:
            if not path.is_file() or path.is_symlink():
                raise ValueError("committed blob is unavailable")
            with path.open("rb") as source:
                payload = source.read(blob.byte_size + 1)
            if len(payload) != blob.byte_size or hashlib.sha256(payload).hexdigest() != blob.digest:
                raise ValueError("committed blob failed verification")
            return payload

        return await asyncio.to_thread(read)

    async def copy_verified_to(self, blob: BlobHandle, destination: Path) -> None:
        """Copy a verified blob to an operator-selected snapshot directory."""

        if not await self.verify(blob):
            raise ValueError("cannot snapshot an unverified blob")
        destination.mkdir(parents=True, exist_ok=True)
        os.chmod(destination, 0o700)
        target = destination / blob.digest
        source = self._content_path(blob.digest)
        with source.open("rb") as input_stream, target.open("xb") as output_stream:
            shutil.copyfileobj(input_stream, output_stream, length=1024 * 1024)
            output_stream.flush()
            os.fsync(output_stream.fileno())
        os.chmod(target, 0o600)
        self._fsync_directory(destination)

    async def import_verified_snapshot_blob(self, source: Path, blob: BlobHandle) -> None:
        """Stage a previously verified snapshot blob before atomic publication."""

        self._validate_digest(blob.digest)
        if not source.is_file() or source.is_symlink() or source.stat().st_size != blob.byte_size or self._digest(source) != blob.digest:
            raise ValueError("snapshot blob failed verification")
        staged = self._staged_path(blob.digest)
        if not staged.exists():
            with source.open("rb") as input_stream, staged.open("xb") as output_stream:
                shutil.copyfileobj(input_stream, output_stream, length=1024 * 1024)
                output_stream.flush()
                os.fsync(output_stream.fileno())
            os.chmod(staged, 0o600)
            self._fsync_directory(self._staging)
        await self.publish(StagedBlob(blob.digest, blob.byte_size))

    async def discard_quarantine(self, upload: QuarantinedUpload) -> None:
        self._quarantine_path(upload.id).unlink(missing_ok=True)
        self._fsync_directory(self._quarantine)


    async def reconcile(self, references: Mapping[str, int]) -> ReconciliationReport:
        """Remove abandoned private files and report references that cannot remain active."""

        normalized = {digest: size for digest, size in references.items() if _DIGEST.fullmatch(digest) and size >= 0}
        if len(normalized) != len(references):
            raise ValueError("invalid blob reference")
        removed_staging: list[str] = []
        for staged in self._staging.iterdir():
            if staged.is_file() or staged.is_symlink():
                if _DIGEST.fullmatch(staged.name):
                    removed_staging.append(staged.name)
                staged.unlink(missing_ok=True)
        for quarantined in self._quarantine.iterdir():
            if quarantined.is_file() or quarantined.is_symlink():
                quarantined.unlink(missing_ok=True)

        discovered: set[str] = set()
        removed_orphans: list[str] = []
        invalid_content: list[str] = []
        for prefix in self._content.iterdir():
            if not prefix.is_dir() or prefix.is_symlink():
                if prefix.exists():
                    if prefix.is_dir():
                        shutil.rmtree(prefix)
                    else:
                        prefix.unlink()
                continue
            for candidate in prefix.iterdir():
                digest = candidate.name
                if not candidate.is_file() or candidate.is_symlink() or not _DIGEST.fullmatch(digest) or candidate.parent.name != digest[:2]:
                    if candidate.is_dir():
                        shutil.rmtree(candidate)
                    else:
                        candidate.unlink(missing_ok=True)
                    continue
                size = candidate.stat().st_size
                if self._digest(candidate) != digest:
                    invalid_content.append(digest)
                    candidate.unlink()
                    continue
                discovered.add(digest)
                if normalized.get(digest) != size:
                    removed_orphans.append(digest)
                    candidate.unlink()
            if not any(prefix.iterdir()):
                prefix.rmdir()
        self._fsync_directory(self._staging)
        self._fsync_directory(self._quarantine)
        self._fsync_directory(self._content)
        missing = sorted(set(normalized) - discovered)
        return ReconciliationReport(
            tuple(sorted(removed_staging)),
            tuple(sorted(removed_orphans)),
            tuple(missing),
            tuple(sorted(invalid_content)),
        )

    def committed_digests(self) -> set[str]:
        digests: set[str] = set()
        for prefix in self._content.glob("[0-9a-f][0-9a-f]"):
            if prefix.is_dir() and not prefix.is_symlink():
                for candidate in prefix.iterdir():
                    if candidate.is_file() and not candidate.is_symlink() and _DIGEST.fullmatch(candidate.name):
                        digests.add(candidate.name)
        return digests

    @staticmethod
    def _digest(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
