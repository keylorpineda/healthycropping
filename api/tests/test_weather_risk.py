"""Unit and endpoint tests for rule-based weather disease risk."""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from healthycropping_api.services.weather import (
    DailyWeather,
    HourlyWeather,
    Microclimate,
    WeatherService,
    WeatherUnavailableError,
)
from healthycropping_api.services.weather_risk import (
    CAPUCHO_2013,
    CATIE_2021,
    CORBANA_2011,
    DEW_POINT_SPREAD_C,
    DISCLAIMER,
    HIGH_FROM_DAYS,
    MODERATE_FROM_DAYS,
    MONILIA_MIN_HOURS,
    WET_RAIN_HOURS,
    WINDOW_DAYS,
    Day,
    assess,
    coffee_rust_favourable,
    is_wet,
    level_for,
    monilia_favourable,
    split_days,
)
from tests.conftest import (
    USER_B_TOKEN,
    VALID_TOKEN,
    FakeTokenVerifier,
    InMemoryDocumentStore,
    bearer,
)

FETCHED_AT = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
HourTuple = tuple[float | None, float | None, float | None]


def flat_hours(
    temp: float | None = 20.0, rh: float | None = 70.0, dew: float | None = 14.0
) -> list[HourTuple]:
    return [(temp, rh, dew) for _ in range(24)]


@dataclass(frozen=True)
class DaySpec:
    date: str
    temperature_mean_c: float | None = 20.0
    humidity_mean_pct: float | None = 70.0
    precipitation_hours: float | None = 0.0
    hours: list[HourTuple] = field(default_factory=flat_hours)


def make_day(
    temperature_mean_c: float | None = 20.0,
    humidity_mean_pct: float | None = 70.0,
    precipitation_hours: float | None = 0.0,
    hours: list[HourTuple] | None = None,
) -> Day:
    return Day(
        date="2026-11-01",
        temperature_mean_c=temperature_mean_c,
        humidity_mean_pct=humidity_mean_pct,
        precipitation_hours=precipitation_hours,
        hours=hours if hours is not None else flat_hours(),
    )


def climate(days: list[DaySpec]) -> Microclimate:
    times = [f"{d.date}T{h:02d}:00" for d in days for h in range(len(d.hours))]
    temps = [temp for d in days for temp, _, _ in d.hours]
    rhs = [rh for d in days for _, rh, _ in d.hours]
    dews = [dew for d in days for _, _, dew in d.hours]
    return Microclimate(
        latitude=10.27,
        longitude=-83.66,
        grid_latitude=10.27,
        grid_longitude=-83.66,
        elevation_m=120.0,
        timezone="America/Costa_Rica",
        past_days=WINDOW_DAYS,
        forecast_days=WINDOW_DAYS,
        fetched_at=FETCHED_AT,
        hourly=HourlyWeather(
            time=times,
            temperature_c=temps,
            relative_humidity_pct=rhs,
            precipitation_mm=[0.0 for _ in times],
            dew_point_c=dews,
        ),
        daily=DailyWeather(
            date=[d.date for d in days],
            temperature_max_c=[d.temperature_mean_c for d in days],
            temperature_min_c=[d.temperature_mean_c for d in days],
            temperature_mean_c=[d.temperature_mean_c for d in days],
            precipitation_sum_mm=[0.0 for _ in days],
            precipitation_hours=[d.precipitation_hours for d in days],
            relative_humidity_mean_pct=[d.humidity_mean_pct for d in days],
            relative_humidity_max_pct=[d.humidity_mean_pct for d in days],
            relative_humidity_min_pct=[d.humidity_mean_pct for d in days],
        ),
    )


def test_level_for_thresholds() -> None:
    assert (MODERATE_FROM_DAYS, HIGH_FROM_DAYS) == (1, 3)
    assert level_for(0) == "low"
    assert level_for(1) == "moderate"
    assert level_for(2) == "moderate"
    assert level_for(3) == "high"
    assert level_for(7) == "high"


def test_is_wet_rain_dew_and_nones() -> None:
    assert (WET_RAIN_HOURS, DEW_POINT_SPREAD_C) == (1.0, 1.0)
    assert is_wet(make_day(precipitation_hours=1.0, hours=flat_hours(20.0, 70.0, 10.0))) is True
    assert is_wet(make_day(precipitation_hours=2.5, hours=flat_hours(20.0, 70.0, 10.0))) is True

    dew_hours = flat_hours(20.0, 70.0, 10.0)
    dew_hours[5] = (20.0, 85.0, 19.0)
    assert is_wet(make_day(precipitation_hours=0.0, hours=dew_hours)) is True

    dry_hours = flat_hours(20.0, 70.0, 18.9)
    assert is_wet(make_day(precipitation_hours=0.5, hours=dry_hours)) is False

    none_hours: list[HourTuple] = [(None, 80.0, 19.5), (20.0, None, None), (None, None, None)]
    assert is_wet(make_day(precipitation_hours=None, hours=none_hours)) is False


def test_coffee_rust_favourable_boundaries() -> None:
    assert coffee_rust_favourable(make_day(22.0, 85.0, 1.0)) is True
    assert coffee_rust_favourable(make_day(21.6, 85.0, 1.0)) is True
    assert coffee_rust_favourable(make_day(23.6, 85.0, 1.0)) is True
    assert coffee_rust_favourable(make_day(21.5, 85.0, 1.0)) is False
    assert coffee_rust_favourable(make_day(23.7, 85.0, 1.0)) is False
    assert coffee_rust_favourable(make_day(22.0, 80.0, 1.0)) is False
    assert coffee_rust_favourable(make_day(22.0, 85.0, 0.0)) is False
    assert coffee_rust_favourable(make_day(None, 85.0, 1.0)) is False


def test_monilia_favourable_hour_counts_and_boundaries() -> None:
    assert MONILIA_MIN_HOURS == 6
    six_hours: list[HourTuple] = [
        (24.1, 80.1, 20.0) if h < 6 else (20.0, 70.0, 15.0) for h in range(24)
    ]
    assert monilia_favourable(make_day(hours=six_hours)) is True

    five_hours: list[HourTuple] = [
        (25.0, 85.0, 20.0) if h < 5 else (20.0, 70.0, 15.0) for h in range(24)
    ]
    assert monilia_favourable(make_day(hours=five_hours)) is False

    boundary_hours = list(five_hours)
    boundary_hours[5] = (24.0, 85.0, 20.0)
    boundary_hours[6] = (25.0, 80.0, 20.0)
    boundary_hours[7] = (None, 90.0, 20.0)
    boundary_hours[8] = (26.0, None, 20.0)
    assert monilia_favourable(make_day(hours=boundary_hours)) is False


def test_assess_coffee_and_cacao_windows_levels_and_thresholds() -> None:
    dates = [f"2026-11-{d:02d}" for d in range(1, 15)]
    today = dates[7]  # 8th date: 7 past (< today), 7 upcoming (>= today)

    coffee_fav = {dates[1], dates[8], dates[10], dates[12]}
    coffee_specs = [
        DaySpec(
            date=d,
            temperature_mean_c=22.5 if d in coffee_fav else 19.0,
            humidity_mean_pct=85.0,
            precipitation_hours=2.0,
        )
        for d in dates
    ]
    [coffee_risk] = assess("coffee", climate(coffee_specs), today)
    assert (coffee_risk.crop, coffee_risk.disease_class) == ("coffee", "leaf_rust")
    assert coffee_risk.status == "evaluated"
    assert coffee_risk.disclaimer == DISCLAIMER
    assert coffee_risk.recent is not None and coffee_risk.upcoming is not None
    assert (coffee_risk.recent.days, coffee_risk.recent.favourable_dates) == (7, [dates[1]])
    assert coffee_risk.recent.level == "moderate"
    assert (coffee_risk.upcoming.days, coffee_risk.upcoming.favourable_dates) == (
        7,
        [dates[8], dates[10], dates[12]],
    )
    assert coffee_risk.upcoming.level == "high"
    assert coffee_risk.level == "high"
    assert any(
        t.basis == "source" and t.source is not None and t.source.url == CAPUCHO_2013.url
        for t in coffee_risk.thresholds
    )
    assert any(
        t.name == "window_levels" and t.basis == "provisional" for t in coffee_risk.thresholds
    )

    warm_humid_hours: list[HourTuple] = [
        (25.0, 85.0, 21.0) if h < 6 else (20.0, 70.0, 15.0) for h in range(24)
    ]
    cacao_fav = {dates[7], dates[9], dates[11]}
    cacao_specs = [
        DaySpec(date=d, hours=warm_humid_hours if d in cacao_fav else flat_hours()) for d in dates
    ]
    [cacao_risk] = assess("cacao", climate(cacao_specs), today)
    assert (cacao_risk.crop, cacao_risk.disease_class) == ("cacao", "monilia")
    assert cacao_risk.status == "evaluated"
    assert cacao_risk.recent is not None and cacao_risk.upcoming is not None
    assert (cacao_risk.recent.favourable_dates, cacao_risk.recent.level) == ([], "low")
    assert cacao_risk.upcoming.favourable_dates == [dates[7], dates[9], dates[11]]
    assert (cacao_risk.upcoming.level, cacao_risk.level) == ("high", "high")
    assert any(
        t.basis == "source" and t.source is not None and t.source.url == CATIE_2021.url
        for t in cacao_risk.thresholds
    )
    assert any(
        t.name == "window_levels" and t.basis == "provisional" for t in cacao_risk.thresholds
    )


def test_assess_banana_returns_insufficient_evidence() -> None:
    [risk] = assess("banana", climate([DaySpec(date="2026-11-01")]), "2026-11-01")
    assert (risk.crop, risk.disease_class) == ("banana", "black_sigatoka")
    assert risk.status == "insufficient_evidence"
    assert (risk.level, risk.recent, risk.upcoming) == (None, None, None)
    assert len(risk.thresholds) == 1
    assert risk.thresholds[0].source is not None
    assert risk.thresholds[0].source.url == CORBANA_2011.url


def test_assess_unknown_crop_returns_empty_list() -> None:
    assert assess("pineapple", climate([DaySpec(date="2026-11-01")]), "2026-11-01") == []


def test_split_days_groups_hourly_values_by_date_prefix() -> None:
    mc = Microclimate(
        latitude=10.0,
        longitude=-84.0,
        grid_latitude=10.0,
        grid_longitude=-84.0,
        elevation_m=100.0,
        timezone="America/Costa_Rica",
        past_days=1,
        forecast_days=1,
        fetched_at=FETCHED_AT,
        hourly=HourlyWeather(
            time=["2026-11-01T00:00", "2026-11-01T01:00", "2026-11-02T00:00"],
            temperature_c=[21.0, 22.0, 25.0],
            relative_humidity_pct=[80.0, 82.0, 90.0],
            precipitation_mm=[0.0, 0.0, 1.0],
            dew_point_c=[18.0, 19.0, 23.0],
        ),
        daily=DailyWeather(
            date=["2026-11-01", "2026-11-02"],
            temperature_max_c=[24.0, 26.0],
            temperature_min_c=[18.0, 20.0],
            temperature_mean_c=[21.5, 25.0],
            precipitation_sum_mm=[0.0, 1.0],
            precipitation_hours=[0.0, 2.0],
            relative_humidity_mean_pct=[81.0, 90.0],
            relative_humidity_max_pct=[85.0, 95.0],
            relative_humidity_min_pct=[75.0, 85.0],
        ),
    )
    days = split_days(mc)
    assert len(days) == 2
    assert (days[0].date, days[0].hours) == ("2026-11-01", [(21.0, 80.0, 18.0), (22.0, 82.0, 19.0)])
    assert (days[1].date, days[1].hours) == ("2026-11-02", [(25.0, 90.0, 23.0)])


def open_meteo_payload() -> dict[str, object]:
    """14 daily + 336 hourly values where cacao monilia is favourable on days 1, 8, 9."""
    dates = [f"2026-11-{d + 1:02d}" for d in range(14)]
    fav_day_indices = {1, 8, 9}
    times = [f"{date}T{h:02d}:00" for date in dates for h in range(24)]
    temps = [
        26.0 if d_idx in fav_day_indices and h < 8 else 21.0
        for d_idx in range(14)
        for h in range(24)
    ]
    rhs = [
        88.0 if d_idx in fav_day_indices and h < 8 else 72.0
        for d_idx in range(14)
        for h in range(24)
    ]
    return {
        "latitude": 10.27,
        "longitude": -83.66,
        "elevation": 85.0,
        "timezone": "America/Costa_Rica",
        "hourly": {
            "time": times,
            "temperature_2m": temps,
            "relative_humidity_2m": rhs,
            "precipitation": [0.0 for _ in times],
            "dew_point_2m": [18.0 for _ in times],
        },
        "daily": {
            "time": dates,
            "temperature_2m_max": [28.0 for _ in dates],
            "temperature_2m_min": [19.0 for _ in dates],
            "temperature_2m_mean": [23.0 for _ in dates],
            "precipitation_sum": [2.0 for _ in dates],
            "precipitation_hours": [1.0 for _ in dates],
            "relative_humidity_2m_mean": [80.0 for _ in dates],
            "relative_humidity_2m_max": [92.0 for _ in dates],
            "relative_humidity_2m_min": [68.0 for _ in dates],
        },
    }


class FakeProvider:
    def __init__(
        self,
        data: dict[str, object] | None = None,
        error: WeatherUnavailableError | None = None,
    ) -> None:
        self.data: dict[str, object] = data if data is not None else open_meteo_payload()
        self.error = error
        self.calls: list[tuple[float, float, int, int]] = []

    def fetch(
        self, latitude: float, longitude: float, past_days: int, forecast_days: int
    ) -> dict[str, object]:
        self.calls.append((latitude, longitude, past_days, forecast_days))
        if self.error is not None:
            raise self.error
        return self.data


def client_for(provider: FakeProvider) -> TestClient:
    service = WeatherService(provider, now=lambda: FETCHED_AT)
    app = create_app(Settings(), FakeTokenVerifier(), InMemoryDocumentStore(), None, service)
    return TestClient(app)


def create_farm_and_plot(client: TestClient, crop: str = "cacao", token: str = VALID_TOKEN) -> str:
    farm_id, plot_id = str(uuid.uuid4()), str(uuid.uuid4())
    farm_resp = client.post(
        "/farms",
        json={"id": farm_id, "name": "Finca Caribe", "region": "Limon", "altitude_m": 85},
        headers=bearer(token),
    )
    assert farm_resp.status_code == 201, farm_resp.text
    plot_resp = client.post(
        "/plots",
        json={"id": plot_id, "farm_id": farm_id, "name": "Lote Cacao", "crop": crop},
        headers=bearer(token),
    )
    assert plot_resp.status_code == 201, plot_resp.text
    return plot_id


def test_endpoint_returns_cacao_monilia_risk_and_rounds_coordinates() -> None:
    provider = FakeProvider()
    client = client_for(provider)
    plot_id = create_farm_and_plot(client, crop="cacao")

    response = client.get(
        f"/plots/{plot_id}/weather-risk",
        params={"latitude": 10.2712, "longitude": -83.6634},
        headers=bearer(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["plot_id"] == plot_id
    assert (body["latitude"], body["longitude"]) == (10.27, -83.66)
    assert body["stale"] is False
    assert body["attribution"]["license"] == "CC BY 4.0"

    [risk] = body["risks"]
    assert risk["disease_class"] == "monilia"
    assert risk["level"] == "moderate"
    assert risk["recent"]["favourable_dates"] == ["2026-11-02"]
    assert risk["upcoming"]["favourable_dates"] == ["2026-11-09", "2026-11-10"]
    assert provider.calls == [(10.27, -83.66, 7, 7)]


def test_endpoint_returns_404_for_missing_or_other_users_plot() -> None:
    client = client_for(FakeProvider())

    missing = client.get(
        f"/plots/{uuid.uuid4()}/weather-risk",
        params={"latitude": 10.27, "longitude": -83.66},
        headers=bearer(VALID_TOKEN),
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "plot_not_found"

    other_plot_id = create_farm_and_plot(client, crop="cacao", token=USER_B_TOKEN)
    other = client.get(
        f"/plots/{other_plot_id}/weather-risk",
        params={"latitude": 10.27, "longitude": -83.66},
        headers=bearer(VALID_TOKEN),
    )
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "plot_not_found"


@pytest.mark.parametrize(
    "params",
    [
        {"longitude": -83.66},
        {"latitude": 91, "longitude": -83.66},
    ],
)
def test_endpoint_requires_auth_and_validates_coordinates(params: dict[str, float]) -> None:
    client = client_for(FakeProvider())
    plot_id = create_farm_and_plot(client)

    unauth = client.get(
        f"/plots/{plot_id}/weather-risk",
        params={"latitude": 10.27, "longitude": -83.66},
    )
    assert unauth.status_code == 401

    invalid = client.get(
        f"/plots/{plot_id}/weather-risk",
        params=params,
        headers=bearer(),
    )
    assert invalid.status_code == 422


def test_endpoint_returns_503_when_provider_fails_without_cache() -> None:
    provider = FakeProvider(error=WeatherUnavailableError("timeout"))
    client = client_for(provider)
    plot_id = create_farm_and_plot(client)

    response = client.get(
        f"/plots/{plot_id}/weather-risk",
        params={"latitude": 10.27, "longitude": -83.66},
        headers=bearer(),
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "weather_unavailable"
