"""Multi-tenant isolation: user B can never read, change, or delete user A's data."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import USER_B_TOKEN, InMemoryDocumentStore, bearer
from tests.test_farms_plots import create_farm, create_plot, new_id

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
