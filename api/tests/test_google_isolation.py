"""Google-authenticated users (#80) get the same `ownerUid` isolation as password users."""

from fastapi.testclient import TestClient

from tests.conftest import GOOGLE_TOKEN, bearer
from tests.test_farms_plots import create_farm, create_plot, new_id
from tests.test_scans import list_scans, scan_body, statuses, sync

G = bearer(GOOGLE_TOKEN)


def test_me_reports_the_google_provider(client: TestClient) -> None:
    response = client.get("/me", headers=G)

    assert response.status_code == 200
    assert response.json() == {
        "uid": "user-g",
        "email": "g@gmail.com",
        "sign_in_provider": "google.com",
    }


def test_google_user_syncs_its_own_farms_plots_and_scans(client: TestClient) -> None:
    farm = {"id": new_id(), "name": "Finca G", "region": "Naranjo"}
    assert client.post("/farms", json=farm, headers=G).status_code == 201
    plot = {"id": new_id(), "farm_id": farm["id"], "name": "Lote G", "crop": "coffee"}
    assert client.post("/plots", json=plot, headers=G).status_code == 201
    scan = scan_body(farm_id=farm["id"], plot_id=plot["id"])

    assert statuses(sync(client, scan, token=GOOGLE_TOKEN)) == ["created"]
    assert [item["id"] for item in client.get("/farms", headers=G).json()] == [farm["id"]]
    assert [item["id"] for item in list_scans(client, token=GOOGLE_TOKEN)] == [scan["id"]]


def test_password_and_google_users_never_see_each_other(client: TestClient) -> None:
    a_farm = create_farm(client)
    a_plot = create_plot(client, a_farm["id"])
    sync(client, scan_body(farm_id=a_farm["id"], plot_id=a_plot["id"]))
    g_farm = {"id": new_id(), "name": "Finca G", "region": "Naranjo"}
    client.post("/farms", json=g_farm, headers=G)

    assert [item["id"] for item in client.get("/farms", headers=G).json()] == [g_farm["id"]]
    assert list_scans(client, token=GOOGLE_TOKEN) == []
    assert client.get(f"/farms/{a_farm['id']}", headers=G).status_code == 404
    assert client.get(f"/plots/{a_plot['id']}", headers=G).status_code == 404
    assert client.get(f"/farms/{g_farm['id']}", headers=bearer()).status_code == 404


def test_google_user_cannot_take_over_password_user_ids(client: TestClient) -> None:
    a_farm = create_farm(client)
    hijack = {"id": a_farm["id"], "name": "Mine now", "region": "Naranjo"}

    assert client.post("/farms", json=hijack, headers=G).status_code == 409
    assert client.patch(f"/farms/{a_farm['id']}", json={"name": "x"}, headers=G).status_code == 404
    assert client.delete(f"/farms/{a_farm['id']}", headers=G).status_code == 404
    assert client.get(f"/farms/{a_farm['id']}", headers=bearer()).json()["name"] == a_farm["name"]
