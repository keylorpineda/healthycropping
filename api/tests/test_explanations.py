"""POST /explanations with a fake LLM: citations, refusal, validation, and failures."""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.genai import errors, types

from healthycropping_api.config import Settings
from healthycropping_api.main import create_app
from healthycropping_api.rag.explain import (
    RESPONSE_SCHEMA,
    SYSTEM_INSTRUCTION,
    ExplanationService,
    ExplanationUnavailableError,
)
from healthycropping_api.rag.gemini import GeminiExplanationModel
from healthycropping_api.rag.index import RagIndex, build_index
from healthycropping_api.routers.explanations import IndexLoader
from tests.conftest import FakeTokenVerifier, InMemoryDocumentStore, bearer
from tests.test_rag_index import CORPUS

BODY = {"crop": "coffee", "disease_class": "leaf_rust", "severity": "actNow", "language": "es"}


class FakeModel:
    def __init__(self, answer: Any = None, error: Exception | None = None) -> None:
        self.answer = answer
        self.error = error
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    def generate(self, system_instruction: str, prompt: str, schema: dict[str, Any]) -> str:
        self.calls.append((system_instruction, prompt, schema))
        if self.error:
            raise self.error
        return self.answer if isinstance(self.answer, str) else json.dumps(self.answer)


def covered(*cited: str) -> dict[str, Any]:
    return {
        "covered": True,
        "summary": "La roya avanza y puede botar las hojas.",
        "next_steps": ["Aplique el fungicida recomendado.", "  ", "Consulte a un agrónomo."],
        "cited_passages": list(cited),
    }


def client_for(model: FakeModel, index: RagIndex | None = None) -> TestClient:
    service = ExplanationService(lambda: index or RagIndex(build_index(CORPUS)), model)
    app = create_app(Settings(), FakeTokenVerifier(), InMemoryDocumentStore(), service)
    return TestClient(app)


def post(client: TestClient, body: dict[str, Any] = BODY, token: str | None = "valid-token") -> Any:
    headers = bearer(token) if token else {}
    return client.post("/explanations", json=body, headers=headers)


def test_returns_a_grounded_explanation_with_citations() -> None:
    model = FakeModel(covered("P1", "P2", "P1", "P9"))
    response = post(client_for(model))

    assert response.status_code == 200
    data = response.json()
    assert data["covered"] is True
    assert data["declined_reason"] is None
    assert data["summary"] == "La roya avanza y puede botar las hojas."
    assert data["next_steps"] == ["Aplique el fungicida recomendado.", "Consulte a un agrónomo."]
    # P1 and P2 are two chunks of the same section; P9 does not exist.
    assert data["citations"] == [
        {
            "source_title": "Guía icafe",
            "publisher": "Institución",
            "year": 2021,
            "section": "Roya",
            "first_page": 1,
            "last_page": 2,
            "url": "https://example.org/icafe.pdf",
        }
    ]


def test_prompt_holds_only_the_diagnosis_and_numbered_passages() -> None:
    model = FakeModel(covered("P1"))
    post(client_for(model), {**BODY, "language": "en"})

    [(system, prompt, schema)] = model.calls
    assert system == SYSTEM_INSTRUCTION
    assert schema == RESPONSE_SCHEMA
    assert "Answer language: English." in prompt
    assert "Crop: coffee." in prompt
    assert "Diagnosed problem (model class): leaf_rust." in prompt
    assert "[P1] Guía icafe — Roya" in prompt
    assert "fungicida" in prompt
    # Only leaf_rust passages are sent, never other crops or classes.
    assert "Moniliasis" not in prompt and "minador" not in prompt


@pytest.mark.parametrize(
    "answer",
    [
        {"covered": False, "summary": "", "next_steps": [], "cited_passages": []},
        covered(),
        covered("P7"),
        {**covered("P1"), "summary": "   "},
    ],
)
def test_declines_answers_without_coverage_or_valid_citations(answer: dict[str, Any]) -> None:
    data = post(client_for(FakeModel(answer))).json()
    assert data["covered"] is False
    assert data["declined_reason"] == "not_covered"
    assert data["summary"] is None
    assert data["citations"] == [] and data["next_steps"] == []


def test_healthy_diagnosis_does_not_call_the_model() -> None:
    model = FakeModel(covered("P1"))
    data = post(
        client_for(model), {**BODY, "disease_class": "healthy", "severity": "healthy"}
    ).json()

    assert data["declined_reason"] == "healthy"
    assert model.calls == []


def test_declines_without_passages_and_does_not_call_the_model() -> None:
    model = FakeModel(covered("P1"))
    data = post(client_for(model), {**BODY, "disease_class": "cercospora"}).json()

    assert (data["covered"], data["declined_reason"]) == (False, "no_sources")
    assert model.calls == []


@pytest.mark.parametrize(
    "body",
    [
        {**BODY, "disease_class": "monilia"},
        {**BODY, "email": "ana@finca.cr"},
        {**BODY, "latitude": 9.93, "longitude": -84.08},
        {**BODY, "farm_name": "Finca La Esperanza"},
        {**BODY, "language": "fr"},
        {key: value for key, value in BODY.items() if key != "severity"},
    ],
)
def test_rejects_unknown_classes_and_any_extra_field(body: dict[str, Any]) -> None:
    model = FakeModel(covered("P1"))
    response = post(client_for(model), body)

    assert response.status_code == 422
    assert model.calls == []


def test_requires_authentication() -> None:
    assert post(client_for(FakeModel(covered("P1"))), token=None).status_code == 401


@pytest.mark.parametrize(
    "model",
    [FakeModel(error=ExplanationUnavailableError("down")), FakeModel("not json"), FakeModel("[1]")],
)
def test_model_failures_return_503(model: FakeModel) -> None:
    response = post(client_for(model))
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "explanations_unavailable"


def test_returns_503_when_gemini_is_not_configured() -> None:
    app = create_app(Settings(), FakeTokenVerifier(), InMemoryDocumentStore())
    response = post(TestClient(app))
    assert response.status_code == 503


def test_returns_503_when_the_index_was_not_built(tmp_path: Path) -> None:
    loader = IndexLoader(tmp_path / "missing.json")
    service = ExplanationService(loader, FakeModel(covered("P1")))
    app = create_app(Settings(), FakeTokenVerifier(), InMemoryDocumentStore(), service)
    assert post(TestClient(app)).status_code == 503


class FakeModels:
    def __init__(self, text: str | None = None, error: Exception | None = None) -> None:
        self.text = text
        self.error = error
        self.kwargs: dict[str, Any] = {}

    def generate_content(self, **kwargs: Any) -> types.GenerateContentResponse:
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return types.GenerateContentResponse(
            candidates=[
                types.Candidate(
                    content=types.Content(role="model", parts=[types.Part(text=self.text)])
                )
            ]
        )


class FakeClient:
    def __init__(self, models: FakeModels) -> None:
        self.models = models


def test_gemini_adapter_requests_json_with_the_schema() -> None:
    models = FakeModels(text='{"covered": false}')
    adapter = GeminiExplanationModel("key", "gemini-test", client=FakeClient(models))  # type: ignore[arg-type]

    assert adapter.generate("system", "prompt", RESPONSE_SCHEMA) == '{"covered": false}'
    config = models.kwargs["config"]
    assert models.kwargs["model"] == "gemini-test"
    assert models.kwargs["contents"] == "prompt"
    assert config.system_instruction == "system"
    assert config.response_mime_type == "application/json"
    assert config.response_json_schema == RESPONSE_SCHEMA


@pytest.mark.parametrize(
    "models",
    [
        FakeModels(error=errors.ClientError(429, {"error": {"message": "quota"}})),
        FakeModels(text=None),
    ],
)
def test_gemini_adapter_maps_failures(models: FakeModels) -> None:
    adapter = GeminiExplanationModel("key", "gemini-test", client=FakeClient(models))  # type: ignore[arg-type]
    with pytest.raises(ExplanationUnavailableError):
        adapter.generate("system", "prompt", RESPONSE_SCHEMA)
