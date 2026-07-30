"""Durable command state for worker-owned Cognoscope jobs."""

from dataclasses import dataclass
from enum import StrEnum


class JobState(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    RESOURCE_WAIT = "resource_wait"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    RECOVERY_PENDING = "recovery_pending"


TERMINAL_STATES = frozenset({JobState.PARTIAL, JobState.FAILED, JobState.CANCELLED, JobState.COMPLETED})
CLAIMABLE_STATES = frozenset({JobState.QUEUED, JobState.RESOURCE_WAIT, JobState.RECOVERY_PENDING})


@dataclass(frozen=True)
class JobLease:
    job_id: str
    token: str
    fence: int
