"""Plot microclimate from Open-Meteo (non-commercial use, CC BY 4.0).

Fungal diseases of coffee, cacao and banana follow humidity, temperature and rain,
so later issues turn this series into risk alerts. This module only fetches,
validates and caches it:

- Coordinates are rounded to 2 decimals (about 1.1 km) before they leave the
  server. Open-Meteo's grid is coarser than that, so the data does not change,
  but a farm's exact location is never sent to a third party, and neighbouring
  plots share cache entries.
- Responses are cached for an hour (Open-Meteo updates hourly). When Open-Meteo
  fails, the last copy younger than a day is served with `stale: true` instead of
  an error, which suits farms with intermittent connectivity.
- Every response carries the CC BY 4.0 attribution the license requires.
"""

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Final, Protocol

import httpx2
from pydantic import BaseModel, ConfigDict

OPEN_METEO_FORECAST_URL: Final = "https://api.open-meteo.com/v1/forecast"
TIMEZONE: Final = "America/Costa_Rica"
COORDINATE_DECIMALS: Final = 2
DEFAULT_PAST_DAYS: Final = 14
DEFAULT_FORECAST_DAYS: Final = 7
MAX_PAST_DAYS: Final = 92
MAX_FORECAST_DAYS: Final = 16
CACHE_TTL_SECONDS: Final = 60 * 60
STALE_TTL_SECONDS: Final = 24 * 60 * 60
CACHE_MAX_ENTRIES: Final = 1024
REQUEST_TIMEOUT_SECONDS: Final = 10.0

HOURLY_VARIABLES: Final = (
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "dew_point_2m",
)
DAILY_VARIABLES: Final = (
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "precipitation_sum",
    "precipitation_hours",
    "relative_humidity_2m_mean",
    "relative_humidity_2m_max",
    "relative_humidity_2m_min",
)


class WeatherAttribution(BaseModel):
    provider: str = "Open-Meteo"
    text: str = "Weather data by Open-Meteo.com (CC BY 4.0)"
    url: str = "https://open-meteo.com/"
    license: str = "CC BY 4.0"
    license_url: str = "https://creativecommons.org/licenses/by/4.0/"


class HourlyWeather(BaseModel):
    """Parallel series, one value per hour; `None` where Open-Meteo has no value."""

    time: list[str]
    temperature_c: list[float | None]
    relative_humidity_pct: list[float | None]
    precipitation_mm: list[float | None]
    dew_point_c: list[float | None]


class DailyWeather(BaseModel):
    """Parallel series, one value per local day (`America/Costa_Rica`)."""

    date: list[str]
    temperature_max_c: list[float | None]
    temperature_min_c: list[float | None]
    temperature_mean_c: list[float | None]
    precipitation_sum_mm: list[float | None]
    precipitation_hours: list[float | None]
    relative_humidity_mean_pct: list[float | None]
    relative_humidity_max_pct: list[float | None]
    relative_humidity_min_pct: list[float | None]


class Microclimate(BaseModel):
    model_config = ConfigDict(frozen=True)

    latitude: float
    longitude: float
    grid_latitude: float
    grid_longitude: float
    elevation_m: float | None
    timezone: str
    past_days: int
    forecast_days: int
    fetched_at: datetime
    stale: bool = False
    hourly: HourlyWeather
    daily: DailyWeather
    attribution: WeatherAttribution = WeatherAttribution()


class WeatherUnavailableError(RuntimeError):
    """Open-Meteo could not be reached or answered with something unusable."""


class WeatherProvider(Protocol):
    def fetch(
        self, latitude: float, longitude: float, past_days: int, forecast_days: int
    ) -> dict[str, Any]: ...


def round_coordinate(value: float) -> float:
    return round(value, COORDINATE_DECIMALS)


class OpenMeteoClient:
    """Thin HTTP client; `client` is injectable so tests can use `httpx2.MockTransport`."""

    def __init__(self, client: httpx2.Client | None = None) -> None:
        self._client = client or httpx2.Client(
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={
                "User-Agent": "HealthyCropping (+https://github.com/keylorpineda/healthycropping)"
            },
        )

    def fetch(
        self, latitude: float, longitude: float, past_days: int, forecast_days: int
    ) -> dict[str, Any]:
        params: dict[str, str | int | float] = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": ",".join(HOURLY_VARIABLES),
            "daily": ",".join(DAILY_VARIABLES),
            "past_days": past_days,
            "forecast_days": forecast_days,
            "timezone": TIMEZONE,
        }
        try:
            response = self._client.get(OPEN_METEO_FORECAST_URL, params=params)
        except httpx2.HTTPError as exc:
            raise WeatherUnavailableError(f"Open-Meteo request failed: {exc}") from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise WeatherUnavailableError(
                f"Open-Meteo returned non-JSON ({response.status_code})"
            ) from exc
        if response.status_code != 200 or not isinstance(payload, dict) or payload.get("error"):
            reason = payload.get("reason") if isinstance(payload, dict) else None
            raise WeatherUnavailableError(
                f"Open-Meteo answered {response.status_code}: {reason or 'no reason given'}"
            )
        return payload


def _series(block: dict[str, Any], key: str, length: int) -> list[float | None]:
    values = block.get(key)
    if not isinstance(values, list) or len(values) != length:
        raise WeatherUnavailableError(f"Open-Meteo series '{key}' is missing or misaligned")
    series: list[float | None] = []
    for value in values:
        if value is None:
            series.append(None)
        elif isinstance(value, int | float) and not isinstance(value, bool):
            series.append(float(value))
        else:
            raise WeatherUnavailableError(f"Open-Meteo series '{key}' has a non-numeric value")
    return series


def _times(block: Any, name: str) -> tuple[dict[str, Any], list[str]]:
    if not isinstance(block, dict):
        raise WeatherUnavailableError(f"Open-Meteo response has no '{name}' block")
    times = block.get("time")
    if not isinstance(times, list) or not all(isinstance(t, str) for t in times):
        raise WeatherUnavailableError(f"Open-Meteo '{name}.time' is missing")
    return block, times


def parse_microclimate(
    payload: dict[str, Any],
    latitude: float,
    longitude: float,
    past_days: int,
    forecast_days: int,
    fetched_at: datetime,
) -> Microclimate:
    """Validate Open-Meteo's JSON and rename its variables to explicit units."""
    hourly, hours = _times(payload.get("hourly"), "hourly")
    daily, days = _times(payload.get("daily"), "daily")
    grid_latitude = payload.get("latitude")
    grid_longitude = payload.get("longitude")
    if not isinstance(grid_latitude, int | float) or not isinstance(grid_longitude, int | float):
        raise WeatherUnavailableError("Open-Meteo response has no grid coordinates")
    elevation = payload.get("elevation")
    n, d = len(hours), len(days)
    return Microclimate(
        latitude=latitude,
        longitude=longitude,
        grid_latitude=float(grid_latitude),
        grid_longitude=float(grid_longitude),
        elevation_m=float(elevation) if isinstance(elevation, int | float) else None,
        timezone=str(payload.get("timezone") or TIMEZONE),
        past_days=past_days,
        forecast_days=forecast_days,
        fetched_at=fetched_at,
        hourly=HourlyWeather(
            time=hours,
            temperature_c=_series(hourly, "temperature_2m", n),
            relative_humidity_pct=_series(hourly, "relative_humidity_2m", n),
            precipitation_mm=_series(hourly, "precipitation", n),
            dew_point_c=_series(hourly, "dew_point_2m", n),
        ),
        daily=DailyWeather(
            date=days,
            temperature_max_c=_series(daily, "temperature_2m_max", d),
            temperature_min_c=_series(daily, "temperature_2m_min", d),
            temperature_mean_c=_series(daily, "temperature_2m_mean", d),
            precipitation_sum_mm=_series(daily, "precipitation_sum", d),
            precipitation_hours=_series(daily, "precipitation_hours", d),
            relative_humidity_mean_pct=_series(daily, "relative_humidity_2m_mean", d),
            relative_humidity_max_pct=_series(daily, "relative_humidity_2m_max", d),
            relative_humidity_min_pct=_series(daily, "relative_humidity_2m_min", d),
        ),
    )


CacheKey = tuple[float, float, int, int]


@dataclass(frozen=True)
class _Entry:
    stored_at: float
    value: Microclimate


class WeatherService:
    def __init__(
        self,
        provider: WeatherProvider | None = None,
        *,
        ttl_seconds: float = CACHE_TTL_SECONDS,
        stale_ttl_seconds: float = STALE_TTL_SECONDS,
        max_entries: int = CACHE_MAX_ENTRIES,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        if stale_ttl_seconds < ttl_seconds:
            raise ValueError("stale_ttl_seconds must be >= ttl_seconds")
        self._provider = provider or OpenMeteoClient()
        self._ttl = ttl_seconds
        self._stale_ttl = stale_ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._now = now
        self._entries: OrderedDict[CacheKey, _Entry] = OrderedDict()
        self._lock = threading.Lock()

    def _get(self, key: CacheKey) -> _Entry | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None:
                self._entries.move_to_end(key)
            return entry

    def _put(self, key: CacheKey, value: Microclimate) -> None:
        with self._lock:
            self._entries[key] = _Entry(self._clock(), value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def microclimate(
        self,
        latitude: float,
        longitude: float,
        past_days: int = DEFAULT_PAST_DAYS,
        forecast_days: int = DEFAULT_FORECAST_DAYS,
    ) -> Microclimate:
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ValueError("coordinates out of range")
        if not 0 <= past_days <= MAX_PAST_DAYS or not 1 <= forecast_days <= MAX_FORECAST_DAYS:
            raise ValueError("day range out of bounds")
        lat, lon = round_coordinate(latitude), round_coordinate(longitude)
        key: CacheKey = (lat, lon, past_days, forecast_days)

        entry = self._get(key)
        age = self._clock() - entry.stored_at if entry else None
        if entry is not None and age is not None and age < self._ttl:
            return entry.value

        try:
            payload = self._provider.fetch(lat, lon, past_days, forecast_days)
            value = parse_microclimate(payload, lat, lon, past_days, forecast_days, self._now())
        except WeatherUnavailableError:
            if entry is not None and age is not None and age < self._stale_ttl:
                return entry.value.model_copy(update={"stale": True})
            raise
        self._put(key, value)
        return value
