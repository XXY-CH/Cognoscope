from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from cognoscope.application.extraction_service import ExtractionService
from cognoscope.application.job_service import JobService
from cognoscope.config import Settings
from cognoscope.domain.events import EventLease
from cognoscope.infrastructure.parsers import default_registry
from cognoscope.infrastructure.postgres.extraction_repository import ExtractionRepository
from cognoscope.infrastructure.storage import PrivateBlobStore
from cognoscope.workers.extraction import run_extraction_job
from cognoscope.workers.ingestion import CheckpointResult, run_ingestion_step
from cognoscope.workers.outbox import deliver_next_event
from cognoscope.infrastructure.database import Database

logger = logging.getLogger(__name__)


async def _pending_extraction() -> CheckpointResult:
    return CheckpointResult(checkpoint=1, result={"status": "extraction_pending"}, partial=True, failure_code="extraction_pending")


async def _consume_local(_: EventLease, __: AsyncSession) -> None:
    return None


async def run_worker_once(
    service: JobService,
    *,
    worker_id: str,
    work: Callable[[], Awaitable[CheckpointResult]] = _pending_extraction,
    consume: Callable[[EventLease, AsyncSession], Awaitable[None]] = _consume_local,
    extraction: ExtractionService | None = None,
    actor: str = "worker:local",
) -> bool:
    lease = await service.claim_next_job(worker_id=worker_id)
    ran = lease is not None
    if lease is not None:
        if extraction is None:
            await run_ingestion_step(service, job_id=lease.job_id, worker_id=worker_id, work=work, lease=lease)
        else:
            await run_extraction_job(service, extraction, job_id=lease.job_id, worker_id=worker_id, actor=actor, lease=lease)
    await deliver_next_event(service, worker_id=worker_id, consumer_name="u6-local", handle=consume)
    return ran


async def serve() -> None:
    settings, stopped = Settings(), asyncio.Event()
    database = Database(settings)
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_name, stopped.set)
    service = JobService(database.session_factory)
    extraction = ExtractionService(ExtractionRepository(database.session_factory), PrivateBlobStore(settings.storage_root), default_registry())
    try:
        while not stopped.is_set():
            try:
                if not await run_worker_once(service, worker_id="cognoscope-worker", extraction=extraction):
                    await asyncio.wait_for(stopped.wait(), timeout=0.25)
            except TimeoutError:
                pass
            except Exception:
                logger.exception("bounded worker iteration failed")
                await asyncio.sleep(0.25)
    finally:
        await database.dispose()


def run() -> None:
    asyncio.run(serve())
