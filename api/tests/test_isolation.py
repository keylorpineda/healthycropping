"""Multi-tenant isolation: user B can never read, change, or delete user A's data."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import USER_B_TOKEN, InMemoryDocumentStore, bearer
from tests.test_farms_plots import create_farm, create_plot, new_id
from tests.test_scans import T2, list_scans, results, scan_body, sync

B = bearer(USER_B_TOKEN)


@pytest.fixture
def a_data(client: TestClient) -> tuple[dict[str, str], dict[str, str]]:
    farm = create_farm(client)
    plot = create_plot(client, farm["id"])
    return farm, plot


def test_user_b_lists_nothing_of_user_a(
    client: TestClient, a_data: tuple[dict[str, str], dict[str, str]]
) -> None:
    farm, _ = a_data

    assert client.get("/farms", headers=B).json() == []
    assert client.get("/plots", headers=B).json() == []
    assert client.get("/plots", params={"farm_id": farm["id"]}, headers=B).json() == []


def test_user_b_cannot_read_user_a_records(
    client: TestClient, a_data: tuple[dict[str, str], dict[str, str]]
) -> None:
    farm, plot = a_data

    farm_response = client.get(f"/farms/{farm['id']}", headers=B)
    plot_response = client.get(f"/plots/{plot['id']}", headers=B)

    # Reported as missing, not forbidden, so IDs cannot be probed.
    assert farm_response.status_code == 404
    assert plot_response.status_code == 404


def test_user_b_cannot_modify_user_a_records(
    client: TestClient,
    store: InMemoryDocumentStore,
    a_data: tuple[dict[str, str], dict[str, str]],
) -> None:
    farm, plot = a_data
    before = store.get("farms", farm["id"]), store.get("plots", plot["id"])

    farm_response = client.patch(f"/farms/{farm['id']}", json={"name": "Taken"}, headers=B)
    plot_response = client.patch(f"/plots/{plot['id']}", json={"name": "Taken"}, headers=B)

    assert farm_response.status_code == 404
    assert plot_response.status_code == 404
    assert (store.get("farms", farm["id"]), store.get("plots", plot["id"])) == before


def test_user_b_cannot_delete_user_a_records(
    client: TestClient, a_data: tuple[dict[str, str], dict[str, str]]
) -> None:
    farm, plot = a_data

    assert client.delete(f"/plots/{plot['id']}", headers=B).status_code == 404
    assert client.delete(f"/farms/{farm['id']}", headers=B).status_code == 404
    assert client.get(f"/farms/{farm['id']}", headers=bearer()).status_code == 200
    assert client.get(f"/plots/{plot['id']}", headers=bearer()).status_code == 200


def test_user_b_cannot_attach_plots_to_user_a_farm(
    client: TestClient, a_data: tuple[dict[str, str], dict[str, str]]
) -> None:
    farm, _ = a_data
    b_farm = client.post(
        "/farms", json={"id": new_id(), "name": "B farm", "region": "Turrialba"}, headers=B
    ).json()
    b_plot = client.post(
        "/plots",
        json={"id": new_id(), "farm_id": b_farm["id"], "name": "B plot", "crop": "cacao"},
        headers=B,
    ).json()

    create_response = client.post(
        "/plots",
        json={"id": new_id(), "farm_id": farm["id"], "name": "Intruder", "crop": "cacao"},
        headers=B,
    )
    move_response = client.patch(f"/plots/{b_plot['id']}", json={"farm_id": farm["id"]}, headers=B)

    assert create_response.json()["error"]["code"] == "farm_not_found"
    assert move_response.json()["error"]["code"] == "farm_not_found"
    assert client.get("/plots", params={"farm_id": farm["id"]}, headers=bearer()).json() == [
        a_data[1]
    ]


def test_user_b_cannot_reuse_user_a_ids(
    client: TestClient, store: InMemoryDocumentStore, a_data: tuple[dict[str, str], dict[str, str]]
) -> None:
    farm, _ = a_data

    response = client.post(
        "/farms", json={"id": farm["id"], "name": "Hijack", "region": "Naranjo"}, headers=B
    )

    assert response.status_code == 409
    assert store.collections["farms"][farm["id"]]["ownerUid"] == "user-a"


def test_user_b_lists_none_of_user_a_scans(
    client: TestClient, a_data: tuple[dict[str, str], dict[str, str]]
) -> None:
    farm, plot = a_data
    sync(client, scan_body(farm_id=farm["id"], plot_id=plot["id"]))

    assert list_scans(client, USER_B_TOKEN) == []
    assert list_scans(client, USER_B_TOKEN, farm_id=farm["id"]) == []
    assert len(list_scans(client)) == 1


def test_user_b_cannot_overwrite_user_a_scans(
    client: TestClient, store: InMemoryDocumentStore
) -> None:
    scan = scan_body()
    sync(client, scan)
    before = store.get("scans", scan["id"])

    response = sync(
        client,
        {**scan, "severity": "actNow", "updated_at": T2, "deleted_at": T2},
        token=USER_B_TOKEN,
    )

    assert results(response) == [{"id": scan["id"], "status": "rejected", "code": "id_conflict"}]
    assert store.get("scans", scan["id"]) == before
    assert list_scans(client, USER_B_TOKEN) == []


def test_user_b_cannot_attach_scans_to_user_a_farm_or_plot(
    client: TestClient,
    store: InMemoryDocumentStore,
    a_data: tuple[dict[str, str], dict[str, str]],
) -> None:
    farm, plot = a_data

    response = sync(
        client, scan_body(farm_id=farm["id"]), scan_body(plot_id=plot["id"]), token=USER_B_TOKEN
    )

    assert [result.get("code") for result in results(response)] == [
        "farm_not_found",
        "plot_not_found",
    ]
    assert "scans" not in store.collections


def test_user_b_cannot_claim_user_a_photos(client: TestClient) -> None:
    photo_id = new_id()
    scan = scan_body(id=photo_id, cloudinary_public_id=f"users/user-a/scans/{photo_id}")

    response = sync(client, scan, token=USER_B_TOKEN)

    assert results(response)[0] == {
        "id": photo_id,
        "status": "rejected",
        "code": "invalid_public_id",
    }
