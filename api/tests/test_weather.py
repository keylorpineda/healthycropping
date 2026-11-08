"""Tests for Open-Meteo client, microclimate parser, caching service, and /weather/microclimate."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx2
import pytest
from fastapi.testclient import TestClient

from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from healthycropping_api.services.weather import (
    DAILY_VARIABLES,
    DEFAULT_FORECAST_DAYS,
    DEFAULT_PAST_DAYS,
    HOURLY_VARIABLES,
    OPEN_METEO_FORECAST_URL,
    TIMEZONE,
    OpenMeteoClient,
    WeatherService,
    WeatherUnavailableError,
    parse_microclimate,
)
from tests.conftest import (
    USER_B_TOKEN,
    VALID_TOKEN,
    FakeTokenVerifier,
    InMemoryDocumentStore,
    bearer,
)

FETCHED_AT = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)


def payload(hours: int = 48, days: int = 3) -> dict[str, Any]:
    return {
        "latitude": 9.947276,
        "longitude": -84.09448,
        "elevation": 1161.0,
        "timezone": "America/Costa_Rica",
        "hourly": {
            "time": [f"2026-11-01T{h % 24:02d}:00" for h in range(hours)],
            "temperature_2m": [20.5 if h % 2 == 0 else 21 for h in range(hours)],
            "relative_humidity_2m": [None if h == 0 else 85.0 for h in range(hours)],
            "precipitation": [0.0 if h % 3 else 1.2 for h in range(hours)],
            "dew_point_2m": [17.8 for _ in range(hours)],
        },
        "daily": {
            "time": [f"2026-11-{d + 1:02d}" for d in range(days)],
            "temperature_2m_max": [26.4 for _ in range(days)],
            "temperature_2m_min": [16.1 for _ in range(days)],
            "temperature_2m_mean": [20.8 for _ in range(days)],
            "precipitation_sum": [5.4 for _ in range(days)],
            "precipitation_hours": [4 for _ in range(days)],
            "relative_humidity_2m_mean": [84.0 for _ in range(days)],
            "relative_humidity_2m_max": [96.0 for _ in range(days)],
            "relative_humidity_2m_min": [68.0 for _ in range(days)],
        },
    }


class FakeProvider:
    def __init__(
        self,
        data: dict[str, Any] | None = None,
        error: WeatherUnavailableError | None = None,
    ) -> None:
        self.data = data or payload()
        self.error = error
        self.calls: list[tuple[float, float, int, int]] = []

    def fetch(
        self, latitude: float, longitude: float, past_days: int, forecast_days: int
    ) -> dict[str, Any]:
        self.calls.append((latitude, longitude, past_days, forecast_days))
        if self.error is not None:
            raise self.error
        return self.data


def client_for(provider: FakeProvider) -> TestClient:
    service = WeatherService(provider, now=lambda: FETCHED_AT)
    app = create_app(Settings(), FakeTokenVerifier(), InMemoryDocumentStore(), None, service)
    return TestClient(app)


def test_open_meteo_client_fetches_forecast_with_expected_params() -> None:
    seen: list[httpx2.Request] = []
    expected = payload(hours=2, days=1)

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, json=expected)

    client = OpenMeteoClient(httpx2.Client(transport=httpx2.MockTransport(handler)))
    result = client.fetch(9.93, -84.09, 14, 7)

    assert result == expected
    [req] = seen
    assert str(req.url).startswith(OPEN_METEO_FORECAST_URL)
    assert dict(req.url.params) == {
        "latitude": "9.93",
        "longitude": "-84.09",
        "hourly": ",".join(HOURLY_VARIABLES),
        "daily": ",".join(DAILY_VARIABLES),
        "past_days": "14",
        "forecast_days": "7",
        "timezone": TIMEZONE,
    }


def test_open_meteo_client_raises_on_http_and_transport_errors() -> None:
    def bad_request(_: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(400, json={"error": True, "reason": "Latitude must be in range"})

    client_400 = OpenMeteoClient(httpx2.Client(transport=httpx2.MockTransport(bad_request)))
    with pytest.raises(WeatherUnavailableError, match="Latitude must be in range"):
        client_400.fetch(9.93, -84.09, 14, 7)

    def bad_gateway(_: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(502, text="<html>Bad Gateway</html>")

    client_502 = OpenMeteoClient(httpx2.Client(transport=httpx2.MockTransport(bad_gateway)))
    with pytest.raises(WeatherUnavailableError):
        client_502.fetch(9.93, -84.09, 14, 7)

    def connect_error(_: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("boom")

    client_err = OpenMeteoClient(httpx2.Client(transport=httpx2.MockTransport(connect_error)))
    with pytest.raises(WeatherUnavailableError, match="boom"):
        client_err.fetch(9.93, -84.09, 14, 7)


def test_parse_microclimate_maps_series_keeps_none_and_converts_ints() -> None:
    raw = payload(hours=2, days=1)
    result = parse_microclimate(raw, 9.93, -84.09, 14, 7, FETCHED_AT)

    assert (result.latitude, result.longitude) == (9.93, -84.09)
    assert (result.grid_latitude, result.grid_longitude) == (9.947276, -84.09448)
    assert result.elevation_m == 1161.0
    assert result.timezone == "America/Costa_Rica"
    assert (result.past_days, result.forecast_days) == (14, 7)
    assert result.fetched_at == FETCHED_AT
    assert result.stale is False

    assert result.hourly.time == ["2026-11-01T00:00", "2026-11-01T01:00"]
    assert result.hourly.temperature_c == [20.5, 21.0]
    assert all(isinstance(v, float) for v in result.hourly.temperature_c)
    assert result.hourly.relative_humidity_pct == [None, 85.0]
    assert result.hourly.precipitation_mm == [1.2, 0.0]
    assert result.hourly.dew_point_c == [17.8, 17.8]

    assert result.daily.date == ["2026-11-01"]
    assert result.daily.temperature_max_c == [26.4]
    assert result.daily.temperature_min_c == [16.1]
    assert result.daily.temperature_mean_c == [20.8]
    assert result.daily.precipitation_sum_mm == [5.4]
    assert result.daily.precipitation_hours == [4.0]
    assert isinstance(result.daily.precipitation_hours[0], float)
    assert result.daily.relative_humidity_mean_pct == [84.0]
    assert result.daily.relative_humidity_max_pct == [96.0]
    assert result.daily.relative_humidity_min_pct == [68.0]

    assert "CC BY 4.0" in result.attribution.text
    assert result.attribution.url == "https://open-meteo.com/"


@pytest.mark.parametrize(
    "mutator",
    [
        lambda d: d.pop("hourly"),
        lambda d: d["hourly"]["temperature_2m"].pop(),
        lambda d: d["hourly"]["temperature_2m"].__setitem__(0, "hot"),
        lambda d: d["hourly"]["temperature_2m"].__setitem__(0, True),
        lambda d: d.pop("latitude"),
    ],
)
def test_parse_microclimate_rejects_malformed_payloads(mutator: Any) -> None:
    bad = payload(hours=2, days=1)
    mutator(bad)
    with pytest.raises(WeatherUnavailableError):
        parse_microclimate(bad, 9.93, -84.09, 14, 7, FETCHED_AT)


def test_weather_service_rounds_coordinates_to_two_decimals() -> None:
    provider = FakeProvider()
    service = WeatherService(provider, now=lambda: FETCHED_AT)

    result = service.microclimate(9.93312, -84.08791)

    assert provider.calls == [(9.93, -84.09, DEFAULT_PAST_DAYS, DEFAULT_FORECAST_DAYS)]
    assert (result.latitude, result.longitude) == (9.93, -84.09)


def test_weather_service_caches_within_ttl_and_refetches_after_expiry() -> None:
    t = [100.0]
    provider = FakeProvider()
    service = WeatherService(
        provider, ttl_seconds=60.0, stale_ttl_seconds=120.0, clock=lambda: t[0]
    )

    first = service.microclimate(9.93312, -84.08791)
    t[0] += 30.0
    second = service.microclimate(9.93499, -84.08501)

    assert first == second
    assert len(provider.calls) == 1

    t[0] += 31.0
    service.microclimate(9.93, -84.09)
    assert len(provider.calls) == 2


def test_weather_service_serves_stale_within_stale_ttl_and_propagates_otherwise() -> None:
    t = [100.0]
    provider = FakeProvider()
    service = WeatherService(
        provider, ttl_seconds=60.0, stale_ttl_seconds=120.0, clock=lambda: t[0]
    )

    fresh = service.microclimate(9.93, -84.09)
    assert fresh.stale is False

    provider.error = WeatherUnavailableError("upstream down")
    t[0] = 180.0
    stale = service.microclimate(9.93, -84.09)
    assert stale.stale is True
    assert stale.hourly == fresh.hourly

    t[0] = 250.0
    with pytest.raises(WeatherUnavailableError):
        service.microclimate(9.93, -84.09)

    with pytest.raises(WeatherUnavailableError):
        service.microclimate(10.0, -84.0)


def test_weather_service_separates_cache_keys_by_day_windows() -> None:
    provider = FakeProvider()
    service = WeatherService(provider)

    service.microclimate(9.93, -84.09, past_days=7, forecast_days=3)
    service.microclimate(9.93, -84.09, past_days=14, forecast_days=3)
    service.microclimate(9.93, -84.09, past_days=7, forecast_days=7)

    assert len(provider.calls) == 3


def test_weather_service_evicts_least_recently_used_entry() -> None:
    provider = FakeProvider()
    service = WeatherService(provider, max_entries=2)

    service.microclimate(9.91, -84.01)
    service.microclimate(9.92, -84.02)
    # Touch (9.91, -84.01) so (9.92, -84.02) becomes the LRU entry.
    service.microclimate(9.91, -84.01)
    service.microclimate(9.93, -84.03)

    assert len(provider.calls) == 3
    service.microclimate(9.91, -84.01)
    assert len(provider.calls) == 3
    service.microclimate(9.92, -84.02)
    assert len(provider.calls) == 4


def test_weather_service_validates_arguments_and_constructor() -> None:
    service = WeatherService(FakeProvider())

    for lat, lon, past, forecast in [
        (-90.1, -84.0, 14, 7),
        (90.1, -84.0, 14, 7),
        (9.9, -180.1, 14, 7),
        (9.9, 180.1, 14, 7),
        (9.9, -84.0, -1, 7),
        (9.9, -84.0, 93, 7),
        (9.9, -84.0, 14, 0),
        (9.9, -84.0, 14, 17),
    ]:
        with pytest.raises(ValueError):
            service.microclimate(lat, lon, past, forecast)

    with pytest.raises(ValueError):
        WeatherService(FakeProvider(), max_entries=0)
    with pytest.raises(ValueError):
        WeatherService(FakeProvider(), ttl_seconds=100.0, stale_ttl_seconds=50.0)


def test_endpoint_returns_microclimate_and_forwards_default_days() -> None:
    provider = FakeProvider()
    response = client_for(provider).get(
        "/weather/microclimate",
        params={"latitude": 9.93312, "longitude": -84.08791},
        headers=bearer(),
    )

    assert response.status_code == 200
    data = response.json()
    assert (data["latitude"], data["longitude"]) == (9.93, -84.09)
    assert len(data["hourly"]["relative_humidity_pct"]) == 48
    assert len(data["daily"]["date"]) == 3
    assert data["attribution"]["license"] == "CC BY 4.0"
    assert data["stale"] is False
    assert provider.calls == [(9.93, -84.09, 14, 7)]


@pytest.mark.parametrize(
    "params",
    [
        {"latitude": 91, "longitude": -84.09},
        {"latitude": 9.93, "longitude": -181},
        {"latitude": 9.93, "longitude": -84.09, "past_days": 93},
        {"latitude": 9.93, "longitude": -84.09, "forecast_days": 0},
        {"longitude": -84.09},
    ],
)
def test_endpoint_requires_auth_and_validates_query_params(params: dict[str, Any]) -> None:
    client = client_for(FakeProvider())
    unauth = client.get("/weather/microclimate", params={"latitude": 9.93, "longitude": -84.09})
    assert unauth.status_code == 401

    bad = client.get("/weather/microclimate", params=params, headers=bearer())
    assert bad.status_code == 422


def test_endpoint_returns_503_when_provider_fails_without_cache() -> None:
    provider = FakeProvider(error=WeatherUnavailableError("down"))
    response = client_for(provider).get(
        "/weather/microclimate",
        params={"latitude": 9.93, "longitude": -84.09},
        headers=bearer(),
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "weather_unavailable"


def test_endpoint_enforces_per_user_sixty_per_hour_rate_limit() -> None:
    client = client_for(FakeProvider())
    params = {"latitude": 9.93, "longitude": -84.09}

    for _ in range(60):
        resp = client.get("/weather/microclimate", params=params, headers=bearer(VALID_TOKEN))
        assert resp.status_code == 200

    limited = client.get("/weather/microclimate", params=params, headers=bearer(VALID_TOKEN))
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"

    other_user = client.get("/weather/microclimate", params=params, headers=bearer(USER_B_TOKEN))
    assert other_user.status_code == 200


@pytest.mark.parametrize(
    ("lat", "lon"),
    [
        (9.9355555, -84.0833333),
        (10.123456, -83.987654),
        (8.005, -82.999),
        (9.1, -84.0),
    ],
)
def test_endpoint_never_sends_more_than_two_decimals_to_provider(lat: float, lon: float) -> None:
    provider = FakeProvider()
    response = client_for(provider).get(
        "/weather/microclimate",
        params={"latitude": lat, "longitude": lon},
        headers=bearer(),
    )

    assert response.status_code == 200
    [(sent_lat, sent_lon, _, _)] = provider.calls
    assert -int(Decimal(str(sent_lat)).as_tuple().exponent) <= 2
    assert -int(Decimal(str(sent_lon)).as_tuple().exponent) <= 2
