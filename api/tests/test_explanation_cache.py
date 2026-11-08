"""Explanation cache: one Gemini call per (crop, class, severity, language)."""

import threading
import time

import pytest

from healthycropping_api.rag.cache import ExplanationCache, cache_key
from healthycropping_api.rag.explain import ExplanationService, ExplanationUnavailableError
from healthycropping_api.rag.index import RagIndex, build_index
from healthycropping_api.schemas import ExplanationRequest, ExplanationResponse
from tests.conftest import USER_B_TOKEN, bearer
from tests.test_explanations import BODY, FakeModel, client_for, covered, post
from tests.test_rag_index import CORPUS


def response_for(request: ExplanationRequest, summary: str = "ok") -> ExplanationResponse:
    return ExplanationResponse(
        crop=request.crop,
        disease_class=request.disease_class,
        severity=request.severity,
        language=request.language,
        covered=True,
        summary=summary,
        next_steps=[],
        citations=[],
    )


REQUEST = ExplanationRequest.model_validate(BODY)


def test_key_is_the_diagnosis_only() -> None:
    assert cache_key(REQUEST) == ("coffee", "leaf_rust", "actNow", "es")


def test_get_or_create_stores_and_reuses_the_value() -> None:
    cache = ExplanationCache()
    calls: list[int] = []

    def create() -> ExplanationResponse:
        calls.append(1)
        return response_for(REQUEST)

    first = cache.get_or_create(cache_key(REQUEST), create, lambda _: True)
    second = cache.get_or_create(cache_key(REQUEST), create, lambda _: True)

    assert first is second
    assert len(calls) == 1
    assert len(cache) == 1


def test_values_rejected_by_should_store_are_not_kept() -> None:
    cache = ExplanationCache()
    cache.get_or_create(cache_key(REQUEST), lambda: response_for(REQUEST), lambda _: False)
    assert cache.get(cache_key(REQUEST)) is None


def test_failures_are_not_cached() -> None:
    cache = ExplanationCache()

    def fail() -> ExplanationResponse:
        raise RuntimeError("model down")

    with pytest.raises(RuntimeError):
        cache.get_or_create(cache_key(REQUEST), fail, lambda _: True)
    assert len(cache) == 0


def test_evicts_the_least_recently_used_entry() -> None:
    cache = ExplanationCache(max_entries=2)
    keys = [("coffee", "leaf_rust", severity, "es") for severity in ("watch", "actNow")]
    for key in keys:
        cache.put(key, response_for(REQUEST))
    cache.get(keys[0])
    cache.put(("coffee", "leaf_rust", "watch", "en"), response_for(REQUEST))

    assert cache.get(keys[0]) is not None
    assert cache.get(keys[1]) is None


def test_rejects_an_empty_capacity() -> None:
    with pytest.raises(ValueError):
        ExplanationCache(max_entries=0)


def test_concurrent_misses_compute_once() -> None:
    cache = ExplanationCache()
    calls: list[int] = []
    results: list[ExplanationResponse] = []

    def create() -> ExplanationResponse:
        calls.append(1)
        time.sleep(0.05)
        return response_for(REQUEST)

    def worker() -> None:
        results.append(cache.get_or_create(cache_key(REQUEST), create, lambda _: True))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(calls) == 1
    assert len(results) == 8
    assert all(result is results[0] for result in results)


def test_cache_hit_skips_gemini_and_returns_the_same_body() -> None:
    model = FakeModel(covered("P1"))
    client = client_for(model)

    first = post(client)
    second = post(client)

    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()
    assert len(model.calls) == 1


def test_cache_is_shared_between_users_because_the_key_has_no_user_data() -> None:
    model = FakeModel(covered("P1"))
    client = client_for(model)

    post(client)
    response = client.post("/explanations", json=BODY, headers=bearer(USER_B_TOKEN))

    assert response.status_code == 200
    assert len(model.calls) == 1


@pytest.mark.parametrize(
    "change",
    [
        {"language": "en"},
        {"severity": "watch"},
        {"disease_class": "leaf_miner"},
        {"crop": "cacao", "disease_class": "monilia"},
    ],
)
def test_each_key_field_separates_entries(change: dict[str, str]) -> None:
    model = FakeModel(covered("P1"))
    client = client_for(model)

    post(client)
    post(client, {**BODY, **change})

    assert len(model.calls) == 2


def test_model_failures_are_retried_on_the_next_request() -> None:
    model = FakeModel(error=ExplanationUnavailableError("quota"))
    client = client_for(model)
    assert post(client).status_code == 503

    model.error = None
    model.answer = covered("P1")
    assert post(client).json()["covered"] is True
    assert post(client).json()["covered"] is True
    assert len(model.calls) == 2


def test_model_refusals_are_not_cached() -> None:
    model = FakeModel({"covered": False, "summary": "", "next_steps": [], "cited_passages": []})
    client = client_for(model)

    assert post(client).json()["declined_reason"] == "not_covered"
    post(client)

    assert len(model.calls) == 2


def test_service_uses_an_injected_cache() -> None:
    cache = ExplanationCache()
    model = FakeModel(covered("P1"))
    service = ExplanationService(lambda: RagIndex(build_index(CORPUS)), model, cache)

    service.explain(REQUEST)

    assert cache.get(cache_key(REQUEST)) is not None
