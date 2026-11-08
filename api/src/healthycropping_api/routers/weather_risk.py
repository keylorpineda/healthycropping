"""GET /plots/{plot_id}/weather-risk: rule-based disease risk from the plot's weather."""

import logging
from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import UUID4

from healthycropping_api.dependencies import Plots
from healthycropping_api.errors import ApiError
from healthycropping_api.rate_limit import WEATHER_LIMIT, RateLimitedUser, limiter
from healthycropping_api.schemas import ErrorResponse
from healthycropping_api.services.weather import WeatherService, WeatherUnavailableError
from healthycropping_api.services.weather_risk import (
    WINDOW_DAYS,
    WeatherRiskResponse,
    assess,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/plots",
    tags=["weather"],
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)


@router.get("/{plot_id}/weather-risk")
@limiter.limit(WEATHER_LIMIT)
def get_weather_risk(
    plot_id: UUID4,
    user: RateLimitedUser,
    request: Request,
    plots: Plots,
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
) -> WeatherRiskResponse:
    """Risk level, contributing days and cited thresholds for the plot's crop.

    Plots do not store coordinates yet (the map editor is #41), so the app sends
    them; they are rounded to 2 decimals before reaching Open-Meteo.
    """
    plot = plots.get(user.uid, str(plot_id))
    if plot is None:
        raise ApiError(404, "plot_not_found", "Plot not found.")
    service: WeatherService = request.app.state.weather_service
    try:
        climate = service.microclimate(
            latitude, longitude, past_days=WINDOW_DAYS, forecast_days=WINDOW_DAYS
        )
    except WeatherUnavailableError as exc:
        logger.warning("Weather unavailable for risk: %s", exc)
        raise ApiError(
            503, "weather_unavailable", "Weather data is not available right now."
        ) from exc
    # With past_days=7 the daily series starts 7 days before the local today.
    dates = climate.daily.date
    today = dates[WINDOW_DAYS] if len(dates) > WINDOW_DAYS else (dates[-1] if dates else "")
    return WeatherRiskResponse(
        plot_id=str(plot_id),
        latitude=climate.latitude,
        longitude=climate.longitude,
        stale=climate.stale,
        risks=assess(str(plot["crop"]), climate, today),
        attribution=climate.attribution,
    )
