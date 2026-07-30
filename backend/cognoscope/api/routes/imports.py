from fastapi import APIRouter, Depends, status

from cognoscope.api.dependencies import FixedUser, get_fixed_user, get_job_service
from cognoscope.api.schemas import ImportCreateRequest, JobResponse

from cognoscope.api.routes.jobs import job_response
from cognoscope.application.job_service import JobService

router = APIRouter(tags=["imports"])




@router.post("/imports", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_import(
    body: ImportCreateRequest,
    user: FixedUser = Depends(get_fixed_user),
    service: JobService = Depends(get_job_service),
) -> JobResponse:
    return job_response(
        await service.create_import(
            account_id=user.account_id,
            admitted_asset_id=body.admitted_asset_id,
            request_idempotency_key=body.idempotency_key,
            resource_profile=body.resource_profile,
        )
    )
