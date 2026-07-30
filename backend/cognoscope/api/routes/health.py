from fastapi import APIRouter

from cognoscope.api.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Check API health")
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="cognoscope-api")
