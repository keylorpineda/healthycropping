"""POST /uploads/scan-signature: signed Cloudinary upload parameters."""

import hashlib
import time

import pytest
from fastapi.testclient import TestClient

from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from tests.conftest import USER_B_TOKEN, FakeTokenVerifier, InMemoryDocumentStore, bearer
from tests.test_farms_plots import new_id

API_SECRET = "test-api-secret"


@pytest.fixture
def signing_client() -> TestClient:
    settings = Settings(
        cloudinary_cloud_name="demo-cloud",
        cloudinary_api_key="123456789012345",
        cloudinary_api_secret=API_SECRET,
    )
    return TestClient(create_app(settings, FakeTokenVerifier(), InMemoryDocumentStore()))


def expected_signature(params: dict[str, object], secret: str) -> str:
    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params))
    return hashlib.sha1((to_sign + secret).encode()).hexdigest()


def test_signature_matches_cloudinary_algorithm(signing_client: TestClient) -> None:
    scan_id = new_id()

    response = signing_client.post(
        "/uploads/scan-signature", json={"scan_id": scan_id}, headers=bearer()
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cloud_name"] == "demo-cloud"
    assert body["api_key"] == "123456789012345"
    assert body["folder"] == "users/user-a/scans"
    assert body["public_id"] == scan_id
    assert body["transformation"] == "c_limit,w_1280,h_1280"
    assert body["upload_url"] == "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
    assert abs(body["timestamp"] - time.time()) < 60
    signed = {key: body[key] for key in ("folder", "public_id", "timestamp", "transformation")}
    assert body["signature"] == expected_signature(signed, API_SECRET)
    assert API_SECRET not in response.text
    assert "api_secret" not in body


def test_each_user_signs_into_their_own_folder(signing_client: TestClient) -> None:
    response = signing_client.post(
        "/uploads/scan-signature", json={"scan_id": new_id()}, headers=bearer(USER_B_TOKEN)
    )

    assert response.json()["folder"] == "users/user-b/scans"


def test_unavailable_when_cloudinary_is_not_configured(client: TestClient) -> None:
    response = client.post("/uploads/scan-signature", json={"scan_id": new_id()}, headers=bearer())

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "uploads_unavailable"


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"scan_id": "not-a-uuid"}, id="bad-id"),
        pytest.param({"scan_id": new_id(), "folder": "users/user-b/scans"}, id="extra-field"),
    ],
)
def test_signature_validation(signing_client: TestClient, body: dict[str, str]) -> None:
    response = signing_client.post("/uploads/scan-signature", json=body, headers=bearer())

    assert response.status_code == 422


def test_signature_requires_auth(signing_client: TestClient) -> None:
    response = signing_client.post("/uploads/scan-signature", json={"scan_id": new_id()})

    assert response.status_code == 401
