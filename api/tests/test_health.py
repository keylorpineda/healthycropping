"""GET /health is public and reports the API version."""

from fastapi.testclient import TestClient

from healthycropping_api import __version__


def test_health_returns_ok_without_auth(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}
