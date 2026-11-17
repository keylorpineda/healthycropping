"""Tests for Sentinel-2 monthly NDVI per plot (#43, #81)."""

from __future__ import annotations

import math
import sys
import types
import uuid
from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from healthycropping_api.services.ndvi import (
    COLLECTION,
    MIN_CLEAR_FRACTION,
    EarthEngineNdviProvider,
    MonthlyNdvi,
    NdviNotConfiguredError,
    NdviUnavailableError,
    PlotGeometry,
    last_months,
    month_status,
    parse_months,
    plot_geometry,
)
from tests.conftest import (
    USER_B_TOKEN,
    VALID_TOKEN,
    FakeTokenVerifier,
    InMemoryDocumentStore,
    bearer,
)

BOUNDARY: list[dict[str, float]] = [
    {"latitude": 9.9, "longitude": -84.1},
    {"latitude": 9.91, "longitude": -84.1},
    {"latitude": 9.91, "longitude": -84.09},
]
EXPECTED_RING: tuple[tuple[float, float], ...] = (
    (-84.1, 9.9),
    (-84.1, 9.91),
    (-84.09, 9.91),
)


class FakeNdviProvider:
    def __init__(
        self,
        series: list[MonthlyNdvi] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.series = series
        self.error = error
        self.calls: list[tuple[PlotGeometry, list[str]]] = []

    def monthly(self, geometry: PlotGeometry, months: list[str]) -> list[MonthlyNdvi]:
        self.calls.append((geometry, list(months)))
        if self.error is not None:
            raise self.error
        if self.series is not None:
            return self.series
        return [
            MonthlyNdvi(month=month, ndvi=0.65, clear_fraction=0.75, images=4) for month in months
        ]


def client_for(fake: FakeNdviProvider | None = None) -> TestClient:
    app = create_app(Settings(), FakeTokenVerifier(), InMemoryDocumentStore(), ndvi_provider=fake)
    return TestClient(app)


def create_farm_and_plot(
    client: TestClient,
    *,
    latitude: float | None = None,
    longitude: float | None = None,
    boundary: list[dict[str, float]] | None = None,
    token: str = VALID_TOKEN,
) -> str:
    farm_id, plot_id = str(uuid.uuid4()), str(uuid.uuid4())
    farm_resp = client.post(
        "/farms",
        json={"id": farm_id, "name": "Finca Central", "region": "Cartago", "altitude_m": 1400},
        headers=bearer(token),
    )
    assert farm_resp.status_code == 201, farm_resp.text
    plot_body: dict[str, Any] = {
        "id": plot_id,
        "farm_id": farm_id,
        "name": "Lote Cafe",
        "crop": "coffee",
    }
    if latitude is not None:
        plot_body["latitude"] = latitude
    if longitude is not None:
        plot_body["longitude"] = longitude
    if boundary is not None:
        plot_body["boundary"] = boundary
    plot_resp = client.post("/plots", json=plot_body, headers=bearer(token))
    assert plot_resp.status_code == 201, plot_resp.text
    return plot_id


def test_last_months_returns_complete_prior_months_in_order() -> None:
    months = last_months(date(2026, 3, 15))
    assert len(months) == 12
    assert months == [
        "2025-03",
        "2025-04",
        "2025-05",
        "2025-06",
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]
    assert last_months(date(2026, 1, 1), 2) == ["2025-11", "2025-12"]


def test_plot_geometry_resolves_boundary_or_point_or_none() -> None:
    with_boundary = plot_geometry({"boundary": BOUNDARY, "latitude": 9.9, "longitude": -84.1})
    assert with_boundary == (PlotGeometry(ring=EXPECTED_RING), "boundary")

    point_only = plot_geometry({"latitude": 9.9, "longitude": -84.1})
    assert point_only == (PlotGeometry(point=(-84.1, 9.9)), "point")

    short_boundary = plot_geometry(
        {
            "boundary": BOUNDARY[:2],
            "latitude": 9.9,
            "longitude": -84.1,
        }
    )
    assert short_boundary == (PlotGeometry(point=(-84.1, 9.9)), "point")

    assert plot_geometry({}) is None


def test_parse_months_normalizes_and_sanitizes_raw_entries() -> None:
    months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]
    raw: list[dict[str, Any]] = [
        {"month": "2026-01-01", "ndvi": 1.4, "clear": 1, "total": 3, "images": 5},
        {"month": "2026-02-01", "ndvi": -1.5, "clear": 15, "total": 10, "images": 2},
        {"month": "2026-03-01", "ndvi": math.nan, "clear": 4, "total": 8, "images": 3},
        {"month": "2026-04-01", "ndvi": "bad", "clear": math.inf, "total": 10, "images": 1},
    ]
    parsed = parse_months(raw, months)
    assert parsed == [
        MonthlyNdvi(month="2026-01", ndvi=1.0, clear_fraction=0.3333, images=5),
        MonthlyNdvi(month="2026-02", ndvi=-1.0, clear_fraction=1.0, images=2),
        MonthlyNdvi(month="2026-03", ndvi=None, clear_fraction=0.5, images=3),
        MonthlyNdvi(month="2026-04", ndvi=None, clear_fraction=0.0, images=1),
        MonthlyNdvi(month="2026-05", ndvi=None, clear_fraction=0.0, images=0),
    ]

    empty = parse_months("not-a-list", ["2026-01", "2026-02"])
    assert empty == [
        MonthlyNdvi(month="2026-01", ndvi=None, clear_fraction=0.0, images=0),
        MonthlyNdvi(month="2026-02", ndvi=None, clear_fraction=0.0, images=0),
    ]


def test_month_status_classifies_no_data_cloudy_and_ok() -> None:
    assert (
        month_status(
            MonthlyNdvi(month="2026-01", ndvi=None, clear_fraction=0.0, images=0),
            MIN_CLEAR_FRACTION,
        )
        == "no_data"
    )
    assert (
        month_status(
            MonthlyNdvi(month="2026-01", ndvi=0.5, clear_fraction=0.1, images=2),
            MIN_CLEAR_FRACTION,
        )
        == "cloudy"
    )
    assert (
        month_status(
            MonthlyNdvi(month="2026-01", ndvi=None, clear_fraction=0.8, images=2),
            MIN_CLEAR_FRACTION,
        )
        == "cloudy"
    )
    assert (
        month_status(
            MonthlyNdvi(month="2026-01", ndvi=0.7, clear_fraction=0.2, images=2),
            MIN_CLEAR_FRACTION,
        )
        == "ok"
    )


def test_endpoint_returns_boundary_ndvi_and_masks_cloudy_months() -> None:
    expected_months = last_months(datetime.now(UTC).date())
    series = [
        MonthlyNdvi(month=expected_months[0], ndvi=0.4, clear_fraction=0.05, images=3),
        *[
            MonthlyNdvi(month=month, ndvi=0.72, clear_fraction=0.8, images=4)
            for month in expected_months[1:]
        ],
    ]
    fake = FakeNdviProvider(series=series)
    client = client_for(fake)
    plot_id = create_farm_and_plot(client, boundary=BOUNDARY)

    response = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert response.status_code == 200
    body = response.json()
    assert body["plot_id"] == plot_id
    assert body["source"] == "boundary"
    assert body["collection"] == COLLECTION == "COPERNICUS/S2_SR_HARMONIZED"
    assert len(body["months"]) == 12
    assert "Copernicus Sentinel" in body["attribution"]
    assert fake.calls == [(PlotGeometry(ring=EXPECTED_RING), expected_months)]

    first, second = body["months"][0], body["months"][1]
    assert first["status"] == "cloudy"
    assert first["ndvi"] is None
    assert second["status"] == "ok"
    assert second["ndvi"] == 0.72


def test_endpoint_uses_point_when_plot_has_no_boundary() -> None:
    fake = FakeNdviProvider()
    client = client_for(fake)
    plot_id = create_farm_and_plot(client, latitude=9.9, longitude=-84.1)

    response = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert response.status_code == 200
    assert response.json()["source"] == "point"
    assert fake.calls[0][0] == PlotGeometry(point=(-84.1, 9.9))


def test_endpoint_returns_404_422_and_401_for_invalid_plot_access() -> None:
    client = client_for(FakeNdviProvider())

    missing = client.get(f"/plots/{uuid.uuid4()}/ndvi", headers=bearer(VALID_TOKEN))
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "plot_not_found"

    other_plot_id = create_farm_and_plot(client, latitude=9.9, longitude=-84.1, token=USER_B_TOKEN)
    other = client.get(f"/plots/{other_plot_id}/ndvi", headers=bearer(VALID_TOKEN))
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "plot_not_found"

    unlocated_plot_id = create_farm_and_plot(client)
    unlocated = client.get(f"/plots/{unlocated_plot_id}/ndvi", headers=bearer(VALID_TOKEN))
    assert unlocated.status_code == 422
    assert unlocated.json()["error"]["code"] == "plot_not_located"

    unauth = client.get(f"/plots/{unlocated_plot_id}/ndvi")
    assert unauth.status_code == 401


def test_endpoint_returns_503_when_not_configured_or_unavailable() -> None:
    store = InMemoryDocumentStore()
    unconfigured_client = TestClient(create_app(Settings(), FakeTokenVerifier(), store))
    plot_id = create_farm_and_plot(unconfigured_client, latitude=9.9, longitude=-84.1)

    resp_none = unconfigured_client.get(f"/plots/{plot_id}/ndvi", headers=bearer())
    assert resp_none.status_code == 503
    assert resp_none.json()["error"]["code"] == "ndvi_not_configured"

    not_cfg_client = client_for(FakeNdviProvider(error=NdviNotConfiguredError()))
    plot_id_2 = create_farm_and_plot(not_cfg_client, latitude=9.9, longitude=-84.1)
    resp_not_cfg = not_cfg_client.get(f"/plots/{plot_id_2}/ndvi", headers=bearer())
    assert resp_not_cfg.status_code == 503
    assert resp_not_cfg.json()["error"]["code"] == "ndvi_not_configured"

    unavail_client = client_for(FakeNdviProvider(error=NdviUnavailableError("down")))
    plot_id_3 = create_farm_and_plot(unavail_client, latitude=9.9, longitude=-84.1)
    resp_unavail = unavail_client.get(f"/plots/{plot_id_3}/ndvi", headers=bearer())
    assert resp_unavail.status_code == 503
    assert resp_unavail.json()["error"]["code"] == "ndvi_unavailable"


def test_rate_limit_blocks_eleventh_request_within_the_hour() -> None:
    client = client_for(FakeNdviProvider())
    plot_id = create_farm_and_plot(client, latitude=9.9, longitude=-84.1)

    for attempt in range(1, 11):
        ok = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())
        assert ok.status_code == 200, f"request {attempt} failed"

    limited = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"


def test_settings_from_env_reads_earthengine_variables() -> None:
    fallback = Settings.from_env(
        {"EARTHENGINE_PROJECT": "p", "GOOGLE_APPLICATION_CREDENTIALS": "sa.json"}
    )
    assert fallback.earthengine_project == "p"
    assert fallback.earthengine_credentials == "sa.json"

    explicit = Settings.from_env(
        {
            "EARTHENGINE_PROJECT": "p",
            "EARTHENGINE_CREDENTIALS": "ee.json",
            "GOOGLE_APPLICATION_CREDENTIALS": "sa.json",
        }
    )
    assert explicit.earthengine_credentials == "ee.json"

    empty = Settings.from_env({"EARTHENGINE_PROJECT": ""})
    assert empty.earthengine_project is None


def test_earthengine_provider_wraps_initialize_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_module = types.ModuleType("ee")

    def fail_init(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("not registered")

    fake_module.__dict__["Initialize"] = fail_init
    monkeypatch.setitem(sys.modules, "ee", fake_module)

    provider = EarthEngineNdviProvider(project="demo-proj", credentials_path=None)
    with pytest.raises(NdviUnavailableError, match="not registered"):
        provider.monthly(PlotGeometry(point=(-84.1, 9.9)), ["2026-01"])
