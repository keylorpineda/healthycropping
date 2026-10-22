"""Shared fixtures: an app wired to a fake token verifier and an in-memory store."""

import copy
from collections.abc import Mapping
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from healthycropping_api.auth import AuthenticatedUser, InvalidTokenError, VerifierUnavailableError
from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from healthycropping_api.store import DocumentAlreadyExistsError

VALID_TOKEN = "valid-token"
USER_B_TOKEN = "user-b-token"
EXPIRED_TOKEN = "expired-token"
UNAVAILABLE_TOKEN = "unavailable-token"
TEST_ORIGIN = "http://localhost:8081"


class FakeTokenVerifier:
    """`VALID_TOKEN` is user A, `USER_B_TOKEN` is user B; other sentinels fail."""

    def verify(self, id_token: str) -> AuthenticatedUser:
        if id_token == VALID_TOKEN:
            return AuthenticatedUser(uid="user-a", email="a@example.com")
        if id_token == USER_B_TOKEN:
            return AuthenticatedUser(uid="user-b", email="b@example.com")
        if id_token == EXPIRED_TOKEN:
            raise InvalidTokenError("expired")
        if id_token == UNAVAILABLE_TOKEN:
            raise VerifierUnavailableError()
        raise InvalidTokenError("invalid")


class InMemoryDocumentStore:
    """`DocumentStore` over nested dicts; returns copies like a real database would."""

    def __init__(self) -> None:
        self.collections: dict[str, dict[str, dict[str, Any]]] = {}

    def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        document = self.collections.get(collection, {}).get(doc_id)
        return copy.deepcopy(document)

    def create(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        documents = self.collections.setdefault(collection, {})
        if doc_id in documents:
            raise DocumentAlreadyExistsError(doc_id)
        documents[doc_id] = copy.deepcopy(data)

    def update(self, collection: str, doc_id: str, changes: dict[str, Any]) -> None:
        self.collections[collection][doc_id].update(copy.deepcopy(changes))

    def query(self, collection: str, equals: Mapping[str, Any]) -> list[dict[str, Any]]:
        return [
            copy.deepcopy(document)
            for document in self.collections.get(collection, {}).values()
            if all(document.get(field) == value for field, value in equals.items())
        ]


def bearer(token: str = VALID_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def store() -> InMemoryDocumentStore:
    return InMemoryDocumentStore()


@pytest.fixture
def app(store: InMemoryDocumentStore) -> FastAPI:
    return create_app(Settings(cors_origins=(TEST_ORIGIN,)), FakeTokenVerifier(), store)


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)
