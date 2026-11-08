"""Offline scan sync: idempotent batch upload and listing, scoped to the authenticated caller."""

from datetime import UTC
from typing import Any

from fastapi import APIRouter
from pydantic import UUID4

from healthycropping_api.auth import CurrentUser
from healthycropping_api.dependencies import Farms, Plots, Scans
from healthycropping_api.repositories import OwnedRepository
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

_TIMESTAMP_FIELDS = ("scanned_at", "updated_at", "deleted_at")


def scan_folder(owner_uid: str) -> str:
    """Cloudinary folder holding the caller's scan photos (see the uploads router)."""
    return f"users/{owner_uid}/scans"


class _LiveIds:
    """Memoized "is this one of the caller's live records" checks for one sync batch."""

    def __init__(self, repository: OwnedRepository, owner_uid: str) -> None:
        self._repository = repository
        self._owner_uid = owner_uid
        self._known: dict[str, bool] = {}

    def __contains__(self, doc_id: str) -> bool:
        if doc_id not in self._known:
            self._known[doc_id] = self._repository.get(self._owner_uid, doc_id) is not None
        return self._known[doc_id]


def _rejection_code(scan: ScanIn, owner_uid: str, farms: _LiveIds, plots: _LiveIds) -> str | None:
    if scan.farm_id is not None and str(scan.farm_id) not in farms:
        return "farm_not_found"
    if scan.plot_id is not None and str(scan.plot_id) not in plots:
        return "plot_not_found"
    public_id = scan.cloudinary_public_id
    if public_id is not None and not public_id.startswith(f"{scan_folder(owner_uid)}/"):
        return "invalid_public_id"
    return None


def _to_document(scan: ScanIn) -> dict[str, Any]:
    # JSON mode turns UUIDs into strings; timestamps stay datetimes so Firestore stores them as
    # timestamps and last-write-wins compares instants rather than strings. They are stored in
    # UTC, as Firestore returns them, so every store answers with the same values.
    data = scan.model_dump(mode="json", exclude={"id"})
    for field in _TIMESTAMP_FIELDS:
        value = getattr(scan, field)
        data[field] = None if value is None else value.astimezone(UTC)
    return data


@router.post("/sync", response_model_exclude_none=True)
def sync_scans(
    body: ScanSyncRequest, user: CurrentUser, farms: Farms, plots: Plots, scans: Scans
) -> ScanSyncResponse:
    """Upsert a batch; each item gets its own status, in request order."""
    live_farms, live_plots = _LiveIds(farms, user.uid), _LiveIds(plots, user.uid)
    results = []
    for scan in body.scans:
        scan_id = str(scan.id)
        code = _rejection_code(scan, user.uid, live_farms, live_plots)
        if code is None:
            status = scans.upsert(user.uid, scan_id, _to_document(scan))
            # Rejected here means the ID belongs to another user's scan.
            code = "id_conflict" if status == "rejected" else None
        else:
            status = "rejected"
        results.append(ScanSyncResult(id=scan_id, status=status, code=code))
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
