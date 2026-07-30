from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from cognoscope.api.errors import ApiError
from cognoscope.api.dependencies import FixedUser, get_extraction_repository, get_fixed_user, get_job_service
from cognoscope.api.schemas import ExtractionSnapshotResponse, JobListResponse, JobResponse, JobRetryRequest, OutboxEventListResponse, OutboxEventResponse

from cognoscope.application.job_service import JobService
from cognoscope.infrastructure.models import DurableJob, OutboxEvent
from cognoscope.infrastructure.postgres.extraction_repository import ExtractionRepository

router = APIRouter(tags=["jobs"])


def job_response(job: DurableJob) -> JobResponse:
    return JobResponse(
        id=job.id,
        admitted_asset_id=job.admitted_asset_id,
        state=job.state,
        checkpoint=job.checkpoint,
        version=job.version,
        attempt_count=job.attempt_count,
        resource_profile=job.resource_profile,
        wait_reason=job.wait_reason,
        cancel_requested=job.cancel_requested,
        result=json.loads(job.result_json) if job.result_json else None,
        failure_code=job.failure_code,
        created_at=job.created_at,
        updated_at=job.updated_at,
        terminal_at=job.terminal_at,
    )


def event_response(event: OutboxEvent) -> OutboxEventResponse:
    return OutboxEventResponse(
        id=event.id,
        event_type=event.event_type,
        status=event.status,
        attempt_count=event.attempt_count,
        last_error=event.last_error,
        available_at=event.available_at,
    )


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(user: FixedUser = Depends(get_fixed_user), service: JobService = Depends(get_job_service)) -> JobListResponse:
    return JobListResponse(jobs=[job_response(job) for job in await service.list_jobs(account_id=user.account_id)])


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: FixedUser = Depends(get_fixed_user), service: JobService = Depends(get_job_service)) -> JobResponse:
    return job_response(await service.get_job(account_id=user.account_id, job_id=job_id))

@router.get("/jobs/{job_id}/extraction", response_model=ExtractionSnapshotResponse)
async def get_job_extraction(
    job_id: str,
    user: FixedUser = Depends(get_fixed_user),
    service: JobService = Depends(get_job_service),
    repository: ExtractionRepository = Depends(get_extraction_repository),
) -> ExtractionSnapshotResponse:
    job = await service.get_job(account_id=user.account_id, job_id=job_id)
    snapshot = await repository.for_job(job.id, job.admitted_asset_id)
    if snapshot is None:
        raise ApiError(404, "extraction_not_ready", "Normalized extraction is not ready for this job")
    return ExtractionSnapshotResponse.model_validate(snapshot)



@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(job_id: str, user: FixedUser = Depends(get_fixed_user), service: JobService = Depends(get_job_service)) -> JobResponse:
    return job_response(await service.request_cancel(account_id=user.account_id, job_id=job_id))


@router.post("/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_job(job_id: str, body: JobRetryRequest, user: FixedUser = Depends(get_fixed_user), service: JobService = Depends(get_job_service)) -> JobResponse:
    return job_response(await service.retry_import(account_id=user.account_id, job_id=job_id, request_idempotency_key=body.idempotency_key))


@router.get("/jobs/{job_id}/events", response_model=OutboxEventListResponse)
async def list_job_events(job_id: str, user: FixedUser = Depends(get_fixed_user), service: JobService = Depends(get_job_service)) -> OutboxEventListResponse:
    return OutboxEventListResponse(events=[event_response(event) for event in await service.events_for_job(account_id=user.account_id, job_id=job_id)])


@router.post("/jobs/events/{event_id}/retry", response_model=OutboxEventResponse)
async def retry_event(event_id: str, user: FixedUser = Depends(get_fixed_user), service: JobService = Depends(get_job_service)) -> OutboxEventResponse:
    return event_response(await service.retry_owned_poison_event(account_id=user.account_id, event_id=event_id))
