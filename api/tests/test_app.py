"""App factory: settings, CORS, structured errors, and the Firestore rules file."""

import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from healthycropping_api.config import Settings
from tests.conftest import TEST_ORIGIN

FIRESTORE_RULES = Path(__file__).resolve().parents[2] / "firestore.rules"


def test_settings_parse_environment() -> None:
    settings = Settings.from_env(
        {
            "ENV": "production",
            "CORS_ORIGINS": " http://a.test , ,http://b.test",
            "FIREBASE_PROJECT_ID": "demo-project",
        }
    )

    assert settings == Settings(
        env="production",
        cors_origins=("http://a.test", "http://b.test"),
        firebase_project_id="demo-project",
    )


def test_settings_defaults_without_environment() -> None:
    assert Settings.from_env({}) == Settings()


def test_cors_preflight_allows_configured_origin(client: TestClient) -> None:
    response = client.options(
        "/me",
        headers={
            "Origin": TEST_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == TEST_ORIGIN


def test_cors_preflight_rejects_unknown_origin(client: TestClient) -> None:
    response = client.options(
        "/me",
        headers={"Origin": "http://evil.test", "Access-Control-Request-Method": "GET"},
    )

    assert "access-control-allow-origin" not in response.headers


def test_unknown_route_uses_error_shape(client: TestClient) -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Not Found"}}


def test_validation_error_uses_error_shape(app: FastAPI) -> None:
    @app.get("/echo")
    def echo(count: int) -> int:
        return count

    response = TestClient(app).get("/echo", params={"count": "many"})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"][0]["loc"] == ["query", "count"]


def test_unexpected_error_hides_internals(app: FastAPI) -> None:
    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    response = TestClient(app, raise_server_exceptions=False).get("/boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "An unexpected error occurred."}
    }


def test_firestore_rules_deny_all_client_access() -> None:
    rules = FIRESTORE_RULES.read_text(encoding="utf-8")
    allow_statements = re.findall(r"^\s*allow\s+[^;]+;", rules, flags=re.MULTILINE)

    assert "match /{document=**}" in rules
    assert [s.strip() for s in allow_statements] == ["allow read, write: if false;"]
