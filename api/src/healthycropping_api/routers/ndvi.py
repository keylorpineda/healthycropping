"""GET /plots/{plot_id}/ndvi: monthly cloud-masked Sentinel-2 NDVI for the plot (#43)."""

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import UUID4

from healthycropping_api.dependencies import Plots, get_document_store
from healthycropping_api.errors import ApiError
from healthycropping_api.rate_limit import NDVI_LIMIT, RateLimitedUser, limiter
from healthycropping_api.schemas import ErrorResponse
from healthycropping_api.services.ndvi import (
    ATTRIBUTION,
    COLLECTION,
    MIN_CLEAR_FRACTION,
    MonthlyNdvi,
    NdviMonth,
    NdviNotConfiguredError,
    NdviProvider,
    NdviResponse,
    NdviUnavailableError,
    PlotGeometry,
    last_months,
    month_status,
    plot_geometry,
)
from healthycropping_api.services.ndvi_cache import (
    DailyQuota,
    NdviCache,
    geometry_key,
    is_cacheable,
)
from healthycropping_api.store import DocumentStore

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


def _compute(
    request: Request, provider: NdviProvider, geometry: PlotGeometry, months: list[str]
) -> list[MonthlyNdvi]:
    if not months:
        return []
    quota: DailyQuota = request.app.state.ndvi_quota
    if not quota.try_acquire():
        raise ApiError(
            503,
            "ndvi_quota_exceeded",
            "The daily satellite quota is used up; try again tomorrow.",
            headers={"Retry-After": str(quota.seconds_until_reset())},
        )
    return provider.monthly(geometry, months)


def _not_configured() -> ApiError:
    return ApiError(503, "ndvi_not_configured", "Satellite NDVI is not configured on this server.")


@router.get("/{plot_id}/ndvi")
@limiter.limit(NDVI_LIMIT)
def get_plot_ndvi(
    plot_id: UUID4,
    user: RateLimitedUser,
    request: Request,
    plots: Plots,
    store: Annotated[DocumentStore, Depends(get_document_store)],
) -> NdviResponse:
    """NDVI of the last 12 complete months over the plot boundary, or around its point.

    Settled months come from the Firestore cache (#81); only the others reach Earth Engine.
    """
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
    today = datetime.now(UTC).date()
    months = last_months(today)
    cache = NdviCache(store)
    key = geometry_key(geometry)
    cached = {
        month: entry
        for month in months
        if (entry := cache.get(user.uid, str(plot_id), month, key)) is not None
    }
    missing = [month for month in months if month not in cached]
    try:
        fresh = _compute(request, provider, geometry, missing)
    except NdviNotConfiguredError as exc:
        raise _not_configured() from exc
    except NdviUnavailableError as exc:
        logger.warning("Earth Engine unavailable for plot NDVI: %s", exc)
        raise ApiError(
            503, "ndvi_unavailable", "Satellite data is not available right now."
        ) from exc
    for entry in fresh:
        if is_cacheable(entry, today):
            cache.put(user.uid, str(plot_id), key, entry)
    by_month = {**{entry.month: entry for entry in fresh}, **cached}
    series = [by_month[month] for month in months if month in by_month]
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
                cached=entry.month in cached,
            )
            for entry in series
        ],
        attribution=ATTRIBUTION,
    )
