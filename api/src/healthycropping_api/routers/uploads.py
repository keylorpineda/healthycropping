"""Signed Cloudinary upload parameters: the device uploads photos directly, never via the API."""

import time

from cloudinary.utils import api_sign_request
from fastapi import APIRouter, Request

from healthycropping_api.auth import CurrentUser
from healthycropping_api.config import Settings
from healthycropping_api.errors import ApiError
from healthycropping_api.routers.scans import scan_folder
from healthycropping_api.schemas import ErrorResponse, ScanSignatureRequest, ScanSignatureResponse

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
    responses={401: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)

# Incoming transformation: Cloudinary stores at most 1280x1280, keeping the aspect ratio.
SCAN_TRANSFORMATION = "c_limit,w_1280,h_1280"


@router.post("/scan-signature")
def sign_scan_upload(
    body: ScanSignatureRequest, user: CurrentUser, request: Request
) -> ScanSignatureResponse:
    settings: Settings = request.app.state.settings
    cloud_name = settings.cloudinary_cloud_name
    api_key = settings.cloudinary_api_key
    api_secret = settings.cloudinary_api_secret
    if not cloud_name or not api_key or not api_secret:
        raise ApiError(503, "uploads_unavailable", "Photo uploads are not configured.")

    folder = scan_folder(user.uid)
    public_id = str(body.scan_id)
    timestamp = int(time.time())
    # Exactly the parameters the client must send with the upload, besides api_key and file.
    signature: str = api_sign_request(
        {
            "folder": folder,
            "public_id": public_id,
            "timestamp": timestamp,
            "transformation": SCAN_TRANSFORMATION,
        },
        api_secret,
    )
    return ScanSignatureResponse(
        cloud_name=cloud_name,
        api_key=api_key,
        timestamp=timestamp,
        signature=signature,
        folder=folder,
        public_id=public_id,
        transformation=SCAN_TRANSFORMATION,
        upload_url=f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload",
    )
