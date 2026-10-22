"""POST /scans/sync and GET /scans for a single user."""

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.conftest import VALID_TOKEN, InMemoryDocumentStore, bearer
from tests.test_farms_plots import create_farm, create_plot, new_id

T0 = "2026-10-01T12:00:00Z"
T1 = "2026-10-02T12:00:00Z"
T2 = "2026-10-03T12:00:00Z"


def scan_body(**overrides: Any) -> dict[str, Any]:
    body = {
        "id": new_id(),
        "farm_id": None,
        "plot_id": None,
        "crop": "coffee",
        "predicted_class": "coffee_rust",
        "severity": "watch",
        "confidence": 0.91,
        "threshold": 0.6,
        "is_low_confidence": False,
        "model_version": "coffee-v1.0.0",
        "cloudinary_public_id": None,
        "scanned_at": T0,
        "updated_at": T0,
        "deleted_at": None,
    }
    return {**body, **overrides}


def sync(client: TestClient, *scans: dict[str, Any], token: str = VALID_TOKEN) -> httpx.Response:
    response: httpx.Response = client.post(
        "/scans/sync", json={"scans": list(scans)}, headers=bearer(token)
    )
    return response


def results(response: httpx.Response) -> list[dict[str, Any]]:
    assert response.status_code == 200, response.text
    body: list[dict[str, Any]] = response.json()["results"]
    return body


def statuses(response: httpx.Response) -> list[str]:
    return [result["status"] for result in results(response)]


def list_scans(client: TestClient, token: str = VALID_TOKEN, **params: str) -> list[Any]:
    response = client.get("/scans", params=params, headers=bearer(token))
    assert response.status_code == 200, response.text
    body: list[Any] = response.json()
    return body


def test_replaying_a_batch_is_idempotent(client: TestClient, store: InMemoryDocumentStore) -> None:
    farm = create_farm(client)
    plot = create_plot(client, farm["id"])
    photo_id = new_id()
    batch = [
        scan_body(),
        scan_body(farm_id=farm["id"], plot_id=plot["id"]),
        scan_body(id=photo_id, cloudinary_public_id=f"users/user-a/scans/{photo_id}"),
    ]

    first = sync(client, *batch)
    snapshot = store.get("scans", batch[1]["id"])
    second = sync(client, *batch)
    third = sync(client, *batch)

    assert statuses(first) == ["created"] * 3
    assert statuses(second) == ["unchanged"] * 3
    assert statuses(third) == ["unchanged"] * 3
    assert sorted(store.collections["scans"]) == sorted(scan["id"] for scan in batch)
    assert store.get("scans", batch[1]["id"]) == snapshot
    assert store.collections["scans"][photo_id]["ownerUid"] == "user-a"
    assert len(list_scans(client)) == 3


def test_last_write_wins_on_updated_at(client: TestClient) -> None:
    scan = scan_body()
    sync(client, scan)

    newer = sync(client, {**scan, "severity": "actNow", "updated_at": T2})
    older = sync(client, {**scan, "severity": "healthy", "updated_at": T1})
    same = sync(client, {**scan, "severity": "healthy", "updated_at": T2})

    assert statuses(newer) == ["updated"]
    assert statuses(older) == ["unchanged"]
    assert statuses(same) == ["unchanged"]
    [listed] = list_scans(client)
    assert listed["severity"] == "actNow"


def test_timestamps_compare_as_instants_across_offsets(client: TestClient) -> None:
    scan = scan_body(updated_at="2026-10-02T12:00:00Z")
    sync(client, scan)

    # 07:00-06:00 is 13:00 UTC: newer, although it sorts lower as a string.
    response = sync(
        client, {**scan, "severity": "actNow", "updated_at": "2026-10-02T07:00:00-06:00"}
    )

    assert statuses(response) == ["updated"]


def test_tombstone_hides_scan(client: TestClient, store: InMemoryDocumentStore) -> None:
    scan = scan_body()
    sync(client, scan)

    response = sync(client, {**scan, "updated_at": T1, "deleted_at": T1})

    assert statuses(response) == ["updated"]
    assert list_scans(client) == []
    assert store.collections["scans"][scan["id"]]["deleted_at"] is not None


def test_one_bad_item_does_not_fail_the_batch(client: TestClient) -> None:
    good, orphan, foreign_photo, also_good = (
        scan_body(),
        scan_body(farm_id=new_id()),
        scan_body(cloudinary_public_id="users/user-b/scans/x"),
        scan_body(),
    )

    response = sync(client, good, orphan, foreign_photo, also_good)

    assert results(response) == [
        {"id": good["id"], "status": "created"},
        {"id": orphan["id"], "status": "rejected", "code": "farm_not_found"},
        {"id": foreign_photo["id"], "status": "rejected", "code": "invalid_public_id"},
        {"id": also_good["id"], "status": "created"},
    ]
    assert {scan["id"] for scan in list_scans(client)} == {good["id"], also_good["id"]}


def test_rejects_unknown_plot_and_deleted_farm(client: TestClient) -> None:
    farm = create_farm(client)
    client.delete(f"/farms/{farm['id']}", headers=bearer())

    response = sync(client, scan_body(plot_id=new_id()), scan_body(farm_id=farm["id"]))

    assert [result.get("code") for result in results(response)] == [
        "plot_not_found",
        "farm_not_found",
    ]


def test_list_filters_and_sorts_by_scanned_at(client: TestClient) -> None:
    farm = create_farm(client)
    plot = create_plot(client, farm["id"])
    late = scan_body(farm_id=farm["id"], plot_id=plot["id"], scanned_at=T2)
    early = scan_body(farm_id=farm["id"], scanned_at=T0)
    cacao = scan_body(crop="cacao", predicted_class="black_pod", scanned_at=T1)
    sync(client, late, early, cacao)

    def ids(**params: str) -> list[str]:
        return [scan["id"] for scan in list_scans(client, **params)]

    assert ids() == [early["id"], cacao["id"], late["id"]]
    assert ids(farm_id=farm["id"]) == [early["id"], late["id"]]
    assert ids(plot_id=plot["id"]) == [late["id"]]
    assert ids(crop="cacao") == [cacao["id"]]
    assert "ownerUid" not in list_scans(client)[0]


@pytest.mark.parametrize(
    "scans",
    [
        pytest.param([], id="empty"),
        pytest.param([scan_body() for _ in range(101)], id="over-100"),
        pytest.param([scan_body(id="0b6f8f9e-5d7c-4c1e-9a43-2f8f2d1e7a10")] * 2, id="duplicate-id"),
        pytest.param([scan_body(severity="critical")], id="bad-severity"),
        pytest.param([scan_body(ownerUid="user-b")], id="owner-uid"),
        pytest.param([scan_body(confidence=1.5)], id="confidence-range"),
        pytest.param([scan_body(updated_at="2026-10-01T12:00:00")], id="naive-datetime"),
        pytest.param([scan_body(local_photo_uri="file:///x.jpg")], id="device-only-field"),
    ],
)
def test_sync_validation(client: TestClient, scans: list[dict[str, Any]]) -> None:
    response = client.post("/scans/sync", json={"scans": scans}, headers=bearer())

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_accepts_a_full_batch(client: TestClient) -> None:
    assert statuses(sync(client, *(scan_body() for _ in range(100)))) == ["created"] * 100


def test_scans_require_auth(client: TestClient) -> None:
    assert client.get("/scans").status_code == 401
    assert client.post("/scans/sync", json={"scans": [scan_body()]}).status_code == 401
