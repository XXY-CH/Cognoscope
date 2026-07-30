"""Apply immutable, numbered SQL migrations before application processes start."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256
import os
from pathlib import Path
import re
import sqlite3

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


_MIGRATION_NAME = re.compile(r"^(?P<version>\d+)_[a-z0-9_]+\.sql$")


class MigrationDriftError(RuntimeError):
    """An applied migration's immutable source no longer matches its recorded checksum."""


@dataclass(frozen=True)
class Migration:
    version: str
    path: Path
    checksum: str

    @classmethod
    def from_path(cls, path: Path) -> "Migration":
        match = _MIGRATION_NAME.fullmatch(path.name)
        if match is None:
            raise ValueError(f"migration filename must be numbered snake_case SQL: {path.name}")
        return cls(match.group("version"), path, sha256(path.read_bytes()).hexdigest())


def _sqlite_statements(source: str) -> tuple[str, ...]:
    statements: list[str] = []
    pending: list[str] = []
    for char in source:
        pending.append(char)
        if char == ";":
            candidate = "".join(pending)
            if sqlite3.complete_statement(candidate):
                if candidate.strip():
                    statements.append(candidate)
                pending.clear()
    if "".join(pending).strip():
        raise ValueError("SQLite migration ends with an incomplete statement")
    return tuple(statements)


class MigrationRunner:
    """Serial, checksum-verified deployment of immutable SQL migrations."""

    def __init__(self, database_url: str, directory: Path) -> None:
        self._database_url = database_url
        self._directory = directory

    def migrations(self) -> tuple[Migration, ...]:
        migrations = tuple(sorted((Migration.from_path(path) for path in self._directory.glob("*.sql")), key=lambda migration: int(migration.version)))
        if not migrations:
            raise ValueError(f"no migrations found in {self._directory}")
        if len({migration.version for migration in migrations}) != len(migrations):
            raise ValueError("migration versions must be unique")
        return migrations

    def pending(self, applied: Mapping[str, str]) -> tuple[Migration, ...]:
        pending: list[Migration] = []
        for migration in self.migrations():
            recorded_checksum = applied.get(migration.version)
            if recorded_checksum is None:
                pending.append(migration)
            elif recorded_checksum != migration.checksum:
                raise MigrationDriftError(f"applied migration checksum changed: {migration.path.name}")
        return tuple(pending)

    async def apply(self) -> tuple[str, ...]:
        engine = create_async_engine(self._database_url, pool_pre_ping=True)
        try:
            async with engine.begin() as connection:
                if connection.dialect.name == "sqlite":
                    await connection.exec_driver_sql("BEGIN IMMEDIATE")
                await connection.execute(
                    text(
                        "CREATE TABLE IF NOT EXISTS schema_migrations ("
                        "version TEXT PRIMARY KEY, checksum VARCHAR(64) NOT NULL, "
                        "applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP)"
                    )
                )
                applied = dict((await connection.execute(text("SELECT version, checksum FROM schema_migrations"))).all())
                pending = self.pending(applied)
                for migration in pending:
                    source = migration.path.read_text()
                    if connection.dialect.name == "sqlite":
                        for statement in _sqlite_statements(source):
                            await connection.exec_driver_sql(statement)
                    else:
                        raw_connection = await connection.get_raw_connection()
                        await raw_connection.driver_connection.execute(source)
                    await connection.execute(
                        text("INSERT INTO schema_migrations (version, checksum) VALUES (:version, :checksum)"),
                        {"version": migration.version, "checksum": migration.checksum},
                    )
                return tuple(migration.version for migration in pending)
        finally:
            await engine.dispose()


def migrations_directory() -> Path:
    configured = os.environ.get("COGNOSCOPE_MIGRATIONS_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[5] / "db" / "migrations"


def run() -> None:
    database_url = os.environ.get("COGNOSCOPE_DATABASE_URL")
    if not database_url:
        raise RuntimeError("COGNOSCOPE_DATABASE_URL must be configured")
    asyncio.run(MigrationRunner(database_url, migrations_directory()).apply())


if __name__ == "__main__":
    run()
