"""POST /explanations allows 20 requests per user per hour; request 21 gets 429."""

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from healthycropping_api.rate_limit import EXPLANATIONS_LIMIT, uid_key
from tests.conftest import USER_B_TOKEN, bearer
from tests.test_explanations import BODY, FakeModel, client_for, covered, post

LIMIT = 20


def exhaust(client: TestClient) -> None:
    for attempt in range(1, LIMIT + 1):
        response = post(client)
        assert response.status_code == 200, f"request {attempt} was refused"


def test_limit_is_twenty_per_hour() -> None:
    assert EXPLANATIONS_LIMIT == "20/hour"


def test_request_21_within_the_hour_returns_429() -> None:
    client = client_for(FakeModel(covered("P1")))
    exhaust(client)

    response = post(client)

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    retry_after = int(response.headers["Retry-After"])
    assert 1 <= retry_after <= 3600


def test_cache_hits_still_count_toward_the_limit() -> None:
    model = FakeModel(covered("P1"))
    client = client_for(model)
    exhaust(client)

    assert post(client).status_code == 429
    assert len(model.calls) == 1


def test_limit_is_per_user() -> None:
    client = client_for(FakeModel(covered("P1")))
    exhaust(client)

    response = client.post("/explanations", json=BODY, headers=bearer(USER_B_TOKEN))

    assert response.status_code == 200


def test_limit_ignores_the_client_ip() -> None:
    client = client_for(FakeModel(covered("P1")))
    exhaust(client)

    headers = {**bearer(), "X-Forwarded-For": "203.0.113.7"}
    response = client.post("/explanations", json=BODY, headers=headers)

    assert response.status_code == 429


def test_unauthenticated_and_invalid_requests_do_not_spend_quota() -> None:
    client = client_for(FakeModel(covered("P1")))
    for _ in range(LIMIT + 5):
        assert post(client, token=None).status_code == 401
        assert post(client, {**BODY, "email": "a@example.com"}).status_code == 422

    exhaust(client)


def test_key_function_refuses_requests_without_a_resolved_user() -> None:
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    with pytest.raises(RuntimeError):
        uid_key(request)
