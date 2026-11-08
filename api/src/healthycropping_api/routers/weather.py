"""GET /weather/microclimate: plot weather from Open-Meteo, cached, with attribution."""

import logging
from typing import Annotated

from fastapi import APIRouter, Query, Request

from healthycropping_api.errors import ApiError
from healthycropping_api.rate_limit import WEATHER_LIMIT, RateLimitedUser, limiter
from healthycropping_api.schemas import ErrorResponse
from healthycropping_api.services.weather import (
    DEFAULT_FORECAST_DAYS,
    DEFAULT_PAST_DAYS,
    MAX_FORECAST_DAYS,
    MAX_PAST_DAYS,
    Microclimate,
    WeatherService,
    WeatherUnavailableError,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/weather",
    tags=["weather"],
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)

UNAVAILABLE = ApiError(503, "weather_unavailable", "Weather data is not available right now.")


def _service(request: Request) -> WeatherService:
    service: WeatherService = request.app.state.weather_service
    return service


@router.get("/microclimate")
@limiter.limit(WEATHER_LIMIT)
def get_microclimate(
    user: RateLimitedUser,
    request: Request,
    latitude: Annotated[float, Query(ge=-90, le=90)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
    past_days: Annotated[int, Query(ge=0, le=MAX_PAST_DAYS)] = DEFAULT_PAST_DAYS,
    forecast_days: Annotated[int, Query(ge=1, le=MAX_FORECAST_DAYS)] = DEFAULT_FORECAST_DAYS,
) -> Microclimate:
    """Hourly and daily temperature, humidity, rain and dew point for a plot.

    Coordinates are rounded to 2 decimals before calling Open-Meteo; the response
    echoes the rounded values. Display `attribution` wherever the data is shown.
    """
    try:
        return _service(request).microclimate(latitude, longitude, past_days, forecast_days)
    except WeatherUnavailableError as exc:
        logger.warning("Weather unavailable: %s", exc)
        raise UNAVAILABLE from exc
