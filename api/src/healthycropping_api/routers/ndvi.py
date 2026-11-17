"""GET /plots/{plot_id}/ndvi: monthly cloud-masked Sentinel-2 NDVI for the plot (#43)."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from pydantic import UUID4

from healthycropping_api.dependencies import Plots
from healthycropping_api.errors import ApiError
from healthycropping_api.rate_limit import NDVI_LIMIT, RateLimitedUser, limiter
from healthycropping_api.schemas import ErrorResponse
from healthycropping_api.services.ndvi import (
    ATTRIBUTION,
    COLLECTION,
    MIN_CLEAR_FRACTION,
    NdviMonth,
    NdviNotConfiguredError,
    NdviProvider,
    NdviResponse,
    NdviUnavailableError,
    last_months,
    month_status,
    plot_geometry,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/plots",
    tags=["ndvi"],
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)


def _not_configured() -> ApiError:
    return ApiError(503, "ndvi_not_configured", "Satellite NDVI is not configured on this server.")


@router.get("/{plot_id}/ndvi")
@limiter.limit(NDVI_LIMIT)
def get_plot_ndvi(
    plot_id: UUID4, user: RateLimitedUser, request: Request, plots: Plots
) -> NdviResponse:
    """NDVI of the last 12 complete months over the plot boundary, or around its point."""
    plot = plots.get(user.uid, str(plot_id))
    if plot is None:
        raise ApiError(404, "plot_not_found", "Plot not found.")
    located = plot_geometry(plot)
    if located is None:
        raise ApiError(422, "plot_not_located", "Plot has no boundary or location point.")
    geometry, source = located
    provider: NdviProvider | None = request.app.state.ndvi_provider
    if provider is None:
        raise _not_configured()
    months = last_months(datetime.now(UTC).date())
    try:
        series = provider.monthly(geometry, months)
    except NdviNotConfiguredError as exc:
        raise _not_configured() from exc
    except NdviUnavailableError as exc:
        logger.warning("Earth Engine unavailable for plot NDVI: %s", exc)
        raise ApiError(
            503, "ndvi_unavailable", "Satellite data is not available right now."
        ) from exc
    return NdviResponse(
        plot_id=str(plot_id),
        source=source,
        collection=COLLECTION,
        months=[
            NdviMonth(
                month=entry.month,
                ndvi=entry.ndvi if month_status(entry, MIN_CLEAR_FRACTION) == "ok" else None,
                clear_fraction=entry.clear_fraction,
                images=entry.images,
                status=month_status(entry, MIN_CLEAR_FRACTION),
            )
            for entry in series
        ],
        attribution=ATTRIBUTION,
    )
