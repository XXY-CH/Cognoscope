from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from cognoscope.api.dependencies import get_library_service, require_csrf_session, require_session
from cognoscope.api.errors import ApiError
from cognoscope.api.schemas import AssetAdmissionResponse, AssetMetadataResponse

from cognoscope.application.library_service import AdmissionRequest, LibraryService

router = APIRouter(tags=["library"])


@router.post("/library/assets", response_model=AssetAdmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    request: Request,
    project_title: Annotated[str, Query(min_length=1, max_length=256)],
    document_title: Annotated[str, Query(min_length=1, max_length=512)],
    declared_media_type: Annotated[str | None, Query(max_length=256)] = None,
    authenticated: FixedUser = Depends(require_csrf_session),
    service: LibraryService = Depends(get_library_service),
) -> AssetAdmissionResponse:
    try:
        admitted = await service.admit(
            AdmissionRequest(
                owner_account_id=authenticated.account.id,
                project_title=project_title,
                document_title=document_title,
                declared_media_type=declared_media_type,
            ),
            request.stream(),
        )
    except ValueError as exc:
        raise ApiError(422, "asset_admission_rejected", str(exc)) from exc

    return AssetAdmissionResponse(
        admitted_asset_id=admitted.admitted_asset_id,
        document_id=admitted.document_id,
        blob_digest=admitted.blob.digest,
        byte_size=admitted.blob.byte_size,
        format=admitted.format.value,
        tier=admitted.tier.value,
        media_type=admitted.media_type,
        generation=admitted.generation,
    )

@router.get("/library/assets/{asset_id}", response_model=AssetMetadataResponse)
async def get_asset(
    asset_id: str,
    authenticated: FixedUser = Depends(require_session),
    service: LibraryService = Depends(get_library_service),
) -> AssetMetadataResponse:
    try:
        owned_id, asset_format, tier, media_type, _ = await service.owned_asset(owner_account_id=authenticated.account.id, asset_id=asset_id)
    except ValueError as exc:
        raise ApiError(404, "asset_not_found", "The asset was not found") from exc
    return AssetMetadataResponse(id=owned_id, format=asset_format.value, tier=tier.value, media_type=media_type)


@router.get("/library/assets/{asset_id}/content", response_class=Response)
async def get_asset_content(
    asset_id: str,
    authenticated: FixedUser = Depends(require_session),
    service: LibraryService = Depends(get_library_service),
) -> Response:
    try:
        media_type, payload = await service.read_owned_asset(owner_account_id=authenticated.account.id, asset_id=asset_id)
    except ValueError as exc:
        raise ApiError(404, "asset_not_found", "The asset was not found") from exc
    return Response(content=payload, media_type=media_type, headers={"Content-Disposition": "inline", "X-Content-Type-Options": "nosniff"})
