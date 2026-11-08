"""CRUD /farms and /plots for a single user."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import InMemoryDocumentStore, bearer


def new_id() -> str:
    return str(uuid.uuid4())


def create_farm(client: TestClient, **overrides: Any) -> dict[str, Any]:
    body = {"id": new_id(), "name": "La Esperanza", "region": "Tarrazu", "altitude_m": 1650}
    response = client.post("/farms", json={**body, **overrides}, headers=bearer())
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


def create_plot(client: TestClient, farm_id: str, **overrides: Any) -> dict[str, Any]:
    body = {"id": new_id(), "farm_id": farm_id, "name": "Lote 1", "crop": "coffee", "area_ha": 2.5}
    response = client.post("/plots", json={**body, **overrides}, headers=bearer())
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


def test_farm_lifecycle(client: TestClient, store: InMemoryDocumentStore) -> None:
    farm = create_farm(client)
    assert farm["name"] == "La Esperanza"
    assert farm["created_at"] == farm["updated_at"]
    assert store.collections["farms"][farm["id"]]["ownerUid"] == "user-a"

    assert client.get(f"/farms/{farm['id']}", headers=bearer()).json() == farm
    assert client.get("/farms", headers=bearer()).json() == [farm]

    patched = client.patch(
        f"/farms/{farm['id']}", json={"name": "El Roble", "altitude_m": None}, headers=bearer()
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "El Roble"
    assert patched.json()["region"] == "Tarrazu"
    assert patched.json()["altitude_m"] is None

    assert client.delete(f"/farms/{farm['id']}", headers=bearer()).status_code == 204
    assert client.get(f"/farms/{farm['id']}", headers=bearer()).status_code == 404
    assert client.get("/farms", headers=bearer()).json() == []
    # Soft delete keeps a tombstone so offline clients can sync the removal.
    assert store.collections["farms"][farm["id"]]["deleted_at"] is not None


def test_plot_lifecycle(client: TestClient) -> None:
    farm = create_farm(client)
    plot = create_plot(client, farm["id"])
    assert plot["farm_id"] == farm["id"]

    assert client.get(f"/plots/{plot['id']}", headers=bearer()).json() == plot
    patched = client.patch(f"/plots/{plot['id']}", json={"crop": "cacao"}, headers=bearer())
    assert patched.json()["crop"] == "cacao"

    assert client.delete(f"/plots/{plot['id']}", headers=bearer()).status_code == 204
    assert client.get(f"/plots/{plot['id']}", headers=bearer()).status_code == 404


def test_list_plots_filters_by_farm(client: TestClient) -> None:
    farm_1, farm_2 = create_farm(client), create_farm(client)
    plot_1 = create_plot(client, farm_1["id"])
    plot_2 = create_plot(client, farm_2["id"])

    all_ids = {plot["id"] for plot in client.get("/plots", headers=bearer()).json()}
    farm_1_plots = client.get("/plots", params={"farm_id": farm_1["id"]}, headers=bearer()).json()

    assert all_ids == {plot_1["id"], plot_2["id"]}
    assert farm_1_plots == [plot_1]


def test_plot_can_move_to_another_own_farm(client: TestClient) -> None:
    farm_1, farm_2 = create_farm(client), create_farm(client)
    plot = create_plot(client, farm_1["id"])

    response = client.patch(
        f"/plots/{plot['id']}", json={"farm_id": farm_2["id"]}, headers=bearer()
    )

    assert response.json()["farm_id"] == farm_2["id"]


def test_deleting_farm_deletes_its_plots(client: TestClient) -> None:
    farm, other_farm = create_farm(client), create_farm(client)
    plot = create_plot(client, farm["id"])
    kept = create_plot(client, other_farm["id"])

    client.delete(f"/farms/{farm['id']}", headers=bearer())

    assert client.get(f"/plots/{plot['id']}", headers=bearer()).status_code == 404
    assert client.get("/plots", headers=bearer()).json() == [kept]


def test_plot_requires_existing_farm(client: TestClient) -> None:
    body = {"id": new_id(), "farm_id": new_id(), "name": "Lote 1", "crop": "coffee"}

    response = client.post("/plots", json=body, headers=bearer())

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "farm_not_found"


def test_plot_cannot_move_to_missing_farm(client: TestClient) -> None:
    plot = create_plot(client, create_farm(client)["id"])

    response = client.patch(f"/plots/{plot['id']}", json={"farm_id": new_id()}, headers=bearer())

    assert response.json()["error"]["code"] == "farm_not_found"


def test_duplicate_ids_conflict(client: TestClient) -> None:
    farm = create_farm(client)
    plot = create_plot(client, farm["id"])

    farm_again = client.post(
        "/farms", json={"id": farm["id"], "name": "Copy", "region": "Naranjo"}, headers=bearer()
    )
    plot_again = client.post(
        "/plots",
        json={"id": plot["id"], "farm_id": farm["id"], "name": "Copy", "crop": "banana"},
        headers=bearer(),
    )

    assert farm_again.status_code == 409
    assert farm_again.json()["error"]["code"] == "farm_exists"
    assert plot_again.status_code == 409
    assert plot_again.json()["error"]["code"] == "plot_exists"


@pytest.mark.parametrize(
    "body",
    [
        {"name": "No id", "region": "Tarrazu"},
        {"id": "not-a-uuid", "name": "Bad id", "region": "Tarrazu"},
        {"id": "00000000-0000-1000-8000-000000000000", "name": "UUID v1", "region": "Tarrazu"},
        {"id": new_id(), "name": "", "region": "Tarrazu"},
        {"id": new_id(), "name": "Too high", "region": "Tarrazu", "altitude_m": 9000},
        {"id": new_id(), "name": "Spoofed", "region": "Tarrazu", "ownerUid": "user-b"},
    ],
    ids=["missing-id", "bad-uuid", "not-v4", "empty-name", "altitude", "owner-field"],
)
def test_invalid_farm_is_rejected(client: TestClient, body: dict[str, Any]) -> None:
    response = client.post("/farms", json=body, headers=bearer())

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_patch_cannot_null_required_fields(client: TestClient) -> None:
    farm = create_farm(client)
    plot = create_plot(client, farm["id"])

    farm_response = client.patch(f"/farms/{farm['id']}", json={"name": None}, headers=bearer())
    plot_response = client.patch(f"/plots/{plot['id']}", json={"crop": None}, headers=bearer())

    assert farm_response.status_code == 422
    assert plot_response.status_code == 422


def test_plot_crop_must_be_supported(client: TestClient) -> None:
    farm = create_farm(client)
    body = {"id": new_id(), "farm_id": farm["id"], "name": "Lote 1", "crop": "rice"}

    assert client.post("/plots", json=body, headers=bearer()).status_code == 422


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/farms"), ("post", "/farms"), ("get", "/plots"), ("delete", f"/plots/{new_id()}")],
)
def test_routes_require_token(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path)

    assert response.status_code == 401
