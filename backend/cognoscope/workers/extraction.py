"""U7 extraction work bound to a U6 durable job lease."""

from __future__ import annotations

from cognoscope.application.extraction_service import ExtractionService
from cognoscope.application.job_service import JobService
from cognoscope.domain.documents import ExtractionStatus
from cognoscope.domain.jobs import JobLease
from cognoscope.workers.ingestion import CheckpointResult, run_ingestion_step


async def run_extraction_job(
    jobs: JobService,
    extraction: ExtractionService,
    *,
    job_id: str,
    worker_id: str,
    actor: str,
    lease_seconds: int = 30,
    lease: JobLease | None = None,
) -> None:
    active_lease = lease or await jobs.claim_job(job_id=job_id, worker_id=worker_id, lease_seconds=lease_seconds)
    job = await jobs.leased_job(active_lease)

    async def work() -> CheckpointResult:
        snapshot = await extraction.extract(job.admitted_asset_id, actor=actor, lease=active_lease)
        result = {"extraction_run_id": snapshot.run.id, "status": snapshot.run.status.value}
        if snapshot.run.status is ExtractionStatus.BLOCKED:
            limitation = snapshot.run.limitations[0] if snapshot.run.limitations else "extraction_blocked"
            return CheckpointResult(checkpoint=1, result=result, partial=True, failure_code=limitation)
        return CheckpointResult(checkpoint=2, result=result)

    await run_ingestion_step(
        jobs,
        job_id=job_id,
        worker_id=worker_id,
        work=work,
        lease=active_lease,
        lease_seconds=lease_seconds,
    )
