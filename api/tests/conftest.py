"""Shared fixtures: an app wired to a fake token verifier (no Firebase calls)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from healthycropping_api.auth import AuthenticatedUser, InvalidTokenError, VerifierUnavailableError
from healthycropping_api.config import Settings
from healthycropping_api.main import create_app

VALID_TOKEN = "valid-token"
EXPIRED_TOKEN = "expired-token"
UNAVAILABLE_TOKEN = "unavailable-token"
TEST_ORIGIN = "http://localhost:8081"


class FakeTokenVerifier:
    """Accepts only `VALID_TOKEN`; maps the other sentinels to verifier failures."""

    def verify(self, id_token: str) -> AuthenticatedUser:
        if id_token == VALID_TOKEN:
            return AuthenticatedUser(uid="user-a", email="a@example.com")
        if id_token == EXPIRED_TOKEN:
            raise InvalidTokenError("expired")
        if id_token == UNAVAILABLE_TOKEN:
            raise VerifierUnavailableError()
        raise InvalidTokenError("invalid")


@pytest.fixture
def app() -> FastAPI:
    return create_app(Settings(cors_origins=(TEST_ORIGIN,)), FakeTokenVerifier())


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)
