"""NDVI Firestore cache and daily Earth Engine budget (#81)."""

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from healthycropping_api.services.ndvi import MonthlyNdvi, PlotGeometry, last_months
from healthycropping_api.services.ndvi_cache import (
    NDVI_CACHE_COLLECTION,
    DailyQuota,
    NdviCache,
    geometry_key,
    is_cacheable,
    is_settled,
)
from tests.conftest import FakeTokenVerifier, InMemoryDocumentStore, bearer
from tests.test_ndvi import FakeNdviProvider, create_farm_and_plot

SQUARE = [
    {"latitude": 9.66, "longitude": -84.023},
    {"latitude": 9.66, "longitude": -84.022},
    {"latitude": 9.661, "longitude": -84.022},
]


def client_with(
    fake: FakeNdviProvider, store: InMemoryDocumentStore, quota: DailyQuota | None = None
) -> TestClient:
    app = create_app(Settings(), FakeTokenVerifier(), store, ndvi_provider=fake, ndvi_quota=quota)
    return TestClient(app)


def unsettled(months: list[str]) -> list[str]:
    today = datetime.now(UTC).date()
    return [month for month in months if not is_settled(month, today)]


def test_geometry_key_is_stable_and_changes_with_the_shape() -> None:
    ring = PlotGeometry(ring=((-84.023, 9.66), (-84.022, 9.66), (-84.022, 9.661)))
    same = PlotGeometry(ring=((-84.0230000001, 9.66), (-84.022, 9.66), (-84.022, 9.661)))
    moved = PlotGeometry(ring=((-84.024, 9.66), (-84.022, 9.66), (-84.022, 9.661)))

    assert geometry_key(ring) == geometry_key(same)
    assert geometry_key(ring) != geometry_key(moved)
    assert geometry_key(ring) != geometry_key(PlotGeometry(point=(-84.023, 9.66)))


def test_months_settle_ten_days_after_they_end() -> None:
    assert not is_settled("2026-10", date(2026, 11, 10))
    assert is_settled("2026-10", date(2026, 11, 11))
    assert is_settled("2025-12", date(2026, 1, 11))
    assert not is_settled("2025-12", date(2026, 1, 5))


def test_only_settled_months_with_scenes_are_cacheable() -> None:
    today = date(2026, 11, 17)
    assert is_cacheable(MonthlyNdvi("2026-09", 0.6, 0.8, 3), today)
    assert is_cacheable(MonthlyNdvi("2026-09", None, 0.05, 3), today)
    assert not is_cacheable(MonthlyNdvi("2026-09", None, 0.0, 0), today)
    assert not is_cacheable(MonthlyNdvi("2026-11", 0.6, 0.8, 3), today)


def test_cache_round_trips_and_ignores_another_geometry() -> None:
    cache = NdviCache(InMemoryDocumentStore())
    entry = MonthlyNdvi("2026-09", 0.61, 0.8, 3)

    cache.put("user-a", "plot-1", "key-1", entry)
    cache.put("user-a", "plot-1", "key-1", MonthlyNdvi("2026-09", 0.62, 0.9, 4))

    assert cache.get("user-a", "plot-1", "2026-09", "key-1") == MonthlyNdvi("2026-09", 0.62, 0.9, 4)
    assert cache.get("user-a", "plot-1", "2026-09", "key-2") is None
    assert cache.get("user-b", "plot-1", "2026-09", "key-1") is None


def test_repeated_requests_reuse_cached_months_without_earth_engine() -> None:
    store = InMemoryDocumentStore()
    fake = FakeNdviProvider()
    client = client_with(fake, store)
    plot_id = create_farm_and_plot(client, boundary=SQUARE)

    first = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())
    second = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert first.status_code == second.status_code == 200
    months = last_months(datetime.now(UTC).date())
    assert fake.calls[0][1] == months
    expected_second = unsettled(months)
    assert len(fake.calls) == (2 if expected_second else 1)
    if expected_second:
        assert fake.calls[1][1] == expected_second
    body = second.json()
    assert [month["month"] for month in body["months"]] == months
    assert [m["cached"] for m in body["months"]] == [m not in expected_second for m in months]
    assert all(not month["cached"] for month in first.json()["months"])
    assert len(store.collections[NDVI_CACHE_COLLECTION]) == len(months) - len(expected_second)


def test_months_without_scenes_are_not_cached() -> None:
    store = InMemoryDocumentStore()
    months = last_months(datetime.now(UTC).date())
    series = [MonthlyNdvi(month, None, 0.0, 0) for month in months]
    client = client_with(FakeNdviProvider(series=series), store)
    plot_id = create_farm_and_plot(client, latitude=9.66, longitude=-84.023)

    response = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert response.status_code == 200
    assert {month["status"] for month in response.json()["months"]} == {"no_data"}
    assert store.collections.get(NDVI_CACHE_COLLECTION, {}) == {}


def test_redrawn_boundary_recomputes_every_month() -> None:
    store = InMemoryDocumentStore()
    fake = FakeNdviProvider()
    client = client_with(fake, store)
    plot_id = create_farm_and_plot(client, boundary=SQUARE)
    client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    moved = [{**point, "longitude": point["longitude"] - 0.001} for point in SQUARE]
    client.patch(f"/plots/{plot_id}", json={"boundary": moved}, headers=bearer())
    client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert fake.calls[-1][1] == last_months(datetime.now(UTC).date())


def test_daily_quota_limits_and_resets_at_utc_midnight() -> None:
    days = iter([date(2026, 11, 17)] * 3 + [date(2026, 11, 18)])
    quota = DailyQuota(limit=2, today=lambda: next(days))

    assert [quota.try_acquire() for _ in range(3)] == [True, True, False]
    assert quota.try_acquire() is True
    assert quota.seconds_until_reset(datetime(2026, 11, 17, 23, 0, tzinfo=UTC)) == 3600


def test_exhausted_quota_answers_503_with_retry_after() -> None:
    quota = DailyQuota(limit=0)
    client = client_with(FakeNdviProvider(), InMemoryDocumentStore(), quota)
    plot_id = create_farm_and_plot(client, latitude=9.66, longitude=-84.023)

    response = client.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ndvi_quota_exceeded"
    assert int(response.headers["Retry-After"]) >= 1


def test_fully_cached_answer_needs_no_quota() -> None:
    store = InMemoryDocumentStore()
    fake = FakeNdviProvider()
    client = client_with(fake, store)
    plot_id = create_farm_and_plot(client, boundary=SQUARE)
    client.get(f"/plots/{plot_id}/ndvi", headers=bearer())
    if unsettled(last_months(datetime.now(UTC).date())):
        return  # Early in the month the latest month is never cached.

    exhausted = client_with(fake, store, DailyQuota(limit=0))
    response = exhausted.get(f"/plots/{plot_id}/ndvi", headers=bearer())

    assert response.status_code == 200
    assert all(month["cached"] for month in response.json()["months"])
