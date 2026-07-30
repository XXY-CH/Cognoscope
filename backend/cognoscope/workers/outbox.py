"""Transactional outbox delivery entrypoint."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from cognoscope.application.job_service import JobService
from cognoscope.domain.events import EventLease


async def deliver_next_event(
    service: JobService,
    *,
    worker_id: str,
    consumer_name: str,
    handle: Callable[[EventLease, AsyncSession], Awaitable[None]],
) -> bool:
    """Deliver one local projection event; handler and receipt commit atomically."""
    lease = await service.claim_outbox_event(worker_id=worker_id)
    if lease is None:
        return False
    await service.deliver_outbox_event(lease, consumer_name=consumer_name, handler=handle)
    return True
