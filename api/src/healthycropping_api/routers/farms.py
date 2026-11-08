"""CRUD /farms, scoped to the authenticated caller."""

from typing import Any

from fastapi import APIRouter, Response
from pydantic import UUID4

from healthycropping_api.auth import CurrentUser
from healthycropping_api.dependencies import Farms, Plots
from healthycropping_api.errors import ApiError
from healthycropping_api.schemas import ErrorResponse, FarmCreate, FarmResponse, FarmUpdate
from healthycropping_api.store import DocumentAlreadyExistsError

router = APIRouter(
    prefix="/farms",
    tags=["farms"],
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)


def _farm_not_found() -> ApiError:
    return ApiError(404, "farm_not_found", "Farm not found.")


def _to_response(document: dict[str, Any]) -> FarmResponse:
    return FarmResponse.model_validate(document)


@router.post("", status_code=201, responses={409: {"model": ErrorResponse}})
def create_farm(body: FarmCreate, user: CurrentUser, farms: Farms) -> FarmResponse:
    data = body.model_dump(mode="json", exclude={"id"})
    try:
        document = farms.create(user.uid, str(body.id), data)
    except DocumentAlreadyExistsError as exc:
        raise ApiError(409, "farm_exists", "A farm with this ID already exists.") from exc
    return _to_response(document)


@router.get("")
def list_farms(user: CurrentUser, farms: Farms) -> list[FarmResponse]:
    return [_to_response(document) for document in farms.list(user.uid)]


@router.get("/{farm_id}")
def read_farm(farm_id: UUID4, user: CurrentUser, farms: Farms) -> FarmResponse:
    document = farms.get(user.uid, str(farm_id))
    if document is None:
        raise _farm_not_found()
    return _to_response(document)


@router.patch("/{farm_id}")
def update_farm(farm_id: UUID4, body: FarmUpdate, user: CurrentUser, farms: Farms) -> FarmResponse:
    changes = body.model_dump(mode="json", exclude_unset=True)
    document = farms.update(user.uid, str(farm_id), changes)
    if document is None:
        raise _farm_not_found()
    return _to_response(document)


@router.delete("/{farm_id}", status_code=204)
def delete_farm(farm_id: UUID4, user: CurrentUser, farms: Farms, plots: Plots) -> Response:
    if not farms.delete(user.uid, str(farm_id)):
        raise _farm_not_found()
    # Mirrors the app's SQLite ON DELETE CASCADE from farms to plots.
    for plot in plots.list(user.uid, farm_id=str(farm_id)):
        plots.delete(user.uid, plot["id"])
    return Response(status_code=204)
