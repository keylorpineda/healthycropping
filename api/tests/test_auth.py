"""Protected routes require a valid Firebase ID bearer token."""

import contextlib
from collections.abc import Iterator
from typing import Any

import firebase_admin
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from google.auth.credentials import AnonymousCredentials

from healthycropping_api.auth import (
    FirebaseTokenVerifier,
    InvalidTokenError,
    VerifierUnavailableError,
)
from tests.conftest import EXPIRED_TOKEN, UNAVAILABLE_TOKEN, VALID_TOKEN


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_valid_token_returns_caller_identity(client: TestClient) -> None:
    response = client.get("/me", headers=_bearer(VALID_TOKEN))

    assert response.status_code == 200
    assert response.json() == {"uid": "user-a", "email": "a@example.com"}


@pytest.mark.parametrize(
    ("headers", "code"),
    [
        ({}, "missing_token"),
        ({"Authorization": "Basic dXNlcjpwYXNz"}, "missing_token"),
        ({"Authorization": "Bearer"}, "missing_token"),
        (_bearer("not.a.jwt"), "invalid_token"),
        (_bearer(EXPIRED_TOKEN), "expired_token"),
    ],
    ids=["missing", "wrong-scheme", "empty-bearer", "malformed", "expired"],
)
def test_rejected_tokens_return_401(client: TestClient, headers: dict[str, str], code: str) -> None:
    response = client.get("/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == code


def test_unreachable_verifier_returns_503(client: TestClient) -> None:
    response = client.get("/me", headers=_bearer(UNAVAILABLE_TOKEN))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "auth_unavailable"


def _stub_verify(monkeypatch: pytest.MonkeyPatch, outcome: dict[str, Any] | Exception) -> None:
    def verify_id_token(id_token: str, app: object = None) -> dict[str, Any]:
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(firebase_auth, "verify_id_token", verify_id_token)
    monkeypatch.setattr(FirebaseTokenVerifier, "_get_app", lambda self: None)


def test_firebase_verifier_returns_user_from_claims(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_verify(monkeypatch, {"uid": "user-b", "email": "b@example.com"})

    user = FirebaseTokenVerifier("demo-project").verify("token")

    assert (user.uid, user.email) == ("user-b", "b@example.com")


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (firebase_auth.ExpiredIdTokenError("Token expired", None), "expired"),
        (firebase_auth.RevokedIdTokenError("Token revoked"), "invalid"),
        (firebase_auth.InvalidIdTokenError("Bad signature"), "invalid"),
    ],
)
def test_firebase_verifier_maps_token_errors(
    monkeypatch: pytest.MonkeyPatch, error: Exception, reason: str
) -> None:
    _stub_verify(monkeypatch, error)

    with pytest.raises(InvalidTokenError) as caught:
        FirebaseTokenVerifier("demo-project").verify("token")
    assert caught.value.reason == reason


def test_firebase_verifier_rejects_claims_without_uid(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_verify(monkeypatch, {"email": "b@example.com"})

    with pytest.raises(InvalidTokenError):
        FirebaseTokenVerifier("demo-project").verify("token")


def test_firebase_verifier_maps_certificate_fetch_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_verify(monkeypatch, firebase_auth.CertificateFetchError("offline", None))

    with pytest.raises(VerifierUnavailableError):
        FirebaseTokenVerifier("demo-project").verify("token")


@pytest.fixture
def isolated_firebase_app(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    # Stand-in for Application Default Credentials, which CI does not have.
    anonymous = AnonymousCredentials()  # type: ignore[no-untyped-call]
    monkeypatch.setattr(credentials.ApplicationDefault, "get_credential", lambda self: anonymous)
    yield
    with contextlib.suppress(ValueError):
        firebase_admin.delete_app(firebase_admin.get_app())


@pytest.mark.usefixtures("isolated_firebase_app")
def test_real_firebase_verifier_rejects_malformed_token() -> None:
    # The SDK rejects a token that is not a JWT before fetching any signing keys.
    with pytest.raises(InvalidTokenError) as caught:
        FirebaseTokenVerifier("demo-project").verify("not.a.jwt")
    assert caught.value.reason == "invalid"
