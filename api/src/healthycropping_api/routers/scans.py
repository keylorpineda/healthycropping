"""Offline scan sync: idempotent batch upload and listing, scoped to the authenticated caller."""

from typing import Any

from fastapi import APIRouter
from pydantic import UUID4

from healthycropping_api.auth import CurrentUser
from healthycropping_api.dependencies import Farms, Plots, Scans
from healthycropping_api.schemas import (
    Crop,
    ErrorResponse,
    ScanIn,
    ScanResponse,
    ScanSyncRequest,
    ScanSyncResponse,
    ScanSyncResult,
)

router = APIRouter(prefix="/scans", tags=["scans"], responses={401: {"model": ErrorResponse}})

_TIMESTAMP_FIELDS = {"scanned_at", "updated_at", "deleted_at"}


def scan_folder(owner_uid: str) -> str:
    """Cloudinary folder holding the caller's scan photos (see the uploads router)."""
    return f"users/{owner_uid}/scans"


def _rejection_code(scan: ScanIn, owner_uid: str, farms: Farms, plots: Plots) -> str | None:
    if scan.farm_id is not None and farms.get(owner_uid, str(scan.farm_id)) is None:
        return "farm_not_found"
    if scan.plot_id is not None and plots.get(owner_uid, str(scan.plot_id)) is None:
        return "plot_not_found"
    public_id = scan.cloudinary_public_id
    if public_id is not None and not public_id.startswith(f"{scan_folder(owner_uid)}/"):
        return "invalid_public_id"
    return None


def _to_document(scan: ScanIn) -> dict[str, Any]:
    # JSON mode turns UUIDs into strings; timestamps stay datetimes so Firestore stores them as
    # timestamps and last-write-wins compares instants rather than strings.
    data = scan.model_dump(mode="json", exclude={"id"})
    data.update(scan.model_dump(include=_TIMESTAMP_FIELDS))
    return data


def _sync_one(
    scan: ScanIn, owner_uid: str, farms: Farms, plots: Plots, scans: Scans
) -> ScanSyncResult:
    scan_id = str(scan.id)
    code = _rejection_code(scan, owner_uid, farms, plots)
    if code is not None:
        return ScanSyncResult(id=scan_id, status="rejected", code=code)
    status = scans.upsert(owner_uid, scan_id, _to_document(scan))
    # Rejected here means the ID belongs to another user's scan.
    return ScanSyncResult(
        id=scan_id, status=status, code="id_conflict" if status == "rejected" else None
    )


@router.post("/sync", response_model_exclude_none=True)
def sync_scans(
    body: ScanSyncRequest, user: CurrentUser, farms: Farms, plots: Plots, scans: Scans
) -> ScanSyncResponse:
    """Upsert a batch; each item gets its own status, in request order."""
    results = [_sync_one(scan, user.uid, farms, plots, scans) for scan in body.scans]
    return ScanSyncResponse(results=results)


@router.get("")
def list_scans(
    user: CurrentUser,
    scans: Scans,
    farm_id: UUID4 | None = None,
    plot_id: UUID4 | None = None,
    crop: Crop | None = None,
) -> list[ScanResponse]:
    filters = {"farm_id": farm_id, "plot_id": plot_id, "crop": crop}
    equals = {field: str(value) for field, value in filters.items() if value is not None}
    documents = sorted(scans.list(user.uid, **equals), key=lambda document: document["scanned_at"])
    return [ScanResponse.model_validate(document) for document in documents]
