"""Bounded, fenced ingestion work."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from cognoscope.application.job_service import JobService
from cognoscope.domain.jobs import JobLease, JobState


@dataclass(frozen=True)
class CheckpointResult:
    checkpoint: int
    result: object | None = None
    partial: bool = False
    failure_code: str | None = None


async def run_ingestion_step(
    service: JobService,
    *,
    job_id: str,
    worker_id: str,
    work: Callable[[], Awaitable[CheckpointResult]],
    lease: JobLease | None = None,
    lease_seconds: int = 30,
) -> None:
    """Run one bounded unit, renewing its fence and recording ordinary failures."""
    lease = lease or await service.claim_job(job_id=job_id, worker_id=worker_id, lease_seconds=lease_seconds)
    if await service.lease_cancel_requested(lease):
        await service.finish(lease, state=JobState.CANCELLED)
        return
    stopped = asyncio.Event()

    async def renew() -> None:
        while not stopped.is_set():
            try:
                await asyncio.wait_for(stopped.wait(), timeout=max(lease_seconds / 3, 0.1))
            except TimeoutError:
                await service.heartbeat(lease, lease_seconds=lease_seconds)

    heartbeat = asyncio.create_task(renew())
    try:
        outcome = await work()
    except Exception:
        if await service.lease_cancel_requested(lease):
            await service.finish(lease, state=JobState.CANCELLED)
        else:
            await service.finish(lease, state=JobState.FAILED, failure_code="ingestion_work_failed")
        return
    finally:
        stopped.set()
        await heartbeat
    if await service.lease_cancel_requested(lease):
        await service.finish(lease, state=JobState.CANCELLED, result={"checkpoint": outcome.checkpoint})
        return
    if outcome.checkpoint > 0:
        await service.checkpoint(lease, checkpoint=outcome.checkpoint, result=outcome.result)
    if await service.lease_cancel_requested(lease):
        await service.finish(lease, state=JobState.CANCELLED, result={"checkpoint": outcome.checkpoint})
    elif outcome.partial:
        await service.finish(lease, state=JobState.PARTIAL, result=outcome.result, failure_code=outcome.failure_code)
    else:
        await service.finish(lease, state=JobState.COMPLETED, result=outcome.result)
