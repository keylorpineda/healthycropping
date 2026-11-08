"""CRUD /plots, scoped to the authenticated caller and their farms."""

from typing import Any

from fastapi import APIRouter, Response
from pydantic import UUID4

from healthycropping_api.auth import CurrentUser
from healthycropping_api.dependencies import Farms, Plots
from healthycropping_api.errors import ApiError
from healthycropping_api.schemas import ErrorResponse, PlotCreate, PlotResponse, PlotUpdate
from healthycropping_api.store import DocumentAlreadyExistsError

router = APIRouter(
    prefix="/plots",
    tags=["plots"],
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)


def _plot_not_found() -> ApiError:
    return ApiError(404, "plot_not_found", "Plot not found.")


def _require_farm(farms: Farms, owner_uid: str, farm_id: str) -> None:
    if farms.get(owner_uid, farm_id) is None:
        raise ApiError(404, "farm_not_found", "Farm not found.")


def _to_response(document: dict[str, Any]) -> PlotResponse:
    return PlotResponse.model_validate(document)


@router.post("", status_code=201, responses={409: {"model": ErrorResponse}})
def create_plot(body: PlotCreate, user: CurrentUser, farms: Farms, plots: Plots) -> PlotResponse:
    data = body.model_dump(mode="json", exclude={"id"})
    _require_farm(farms, user.uid, data["farm_id"])
    try:
        document = plots.create(user.uid, str(body.id), data)
    except DocumentAlreadyExistsError as exc:
        raise ApiError(409, "plot_exists", "A plot with this ID already exists.") from exc
    return _to_response(document)


@router.get("")
def list_plots(user: CurrentUser, plots: Plots, farm_id: UUID4 | None = None) -> list[PlotResponse]:
    equals = {} if farm_id is None else {"farm_id": str(farm_id)}
    return [_to_response(document) for document in plots.list(user.uid, **equals)]


@router.get("/{plot_id}")
def read_plot(plot_id: UUID4, user: CurrentUser, plots: Plots) -> PlotResponse:
    document = plots.get(user.uid, str(plot_id))
    if document is None:
        raise _plot_not_found()
    return _to_response(document)


@router.patch("/{plot_id}")
def update_plot(
    plot_id: UUID4, body: PlotUpdate, user: CurrentUser, farms: Farms, plots: Plots
) -> PlotResponse:
    changes = body.model_dump(mode="json", exclude_unset=True)
    if plots.get(user.uid, str(plot_id)) is None:
        raise _plot_not_found()
    if "farm_id" in changes:
        _require_farm(farms, user.uid, changes["farm_id"])
    document = plots.update(user.uid, str(plot_id), changes)
    if document is None:
        raise _plot_not_found()
    return _to_response(document)


@router.delete("/{plot_id}", status_code=204)
def delete_plot(plot_id: UUID4, user: CurrentUser, plots: Plots) -> Response:
    if not plots.delete(user.uid, str(plot_id)):
        raise _plot_not_found()
    return Response(status_code=204)
