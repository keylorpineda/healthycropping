"""Grounded explanations: retrieve passages, ask the LLM, keep only cited answers.

The prompt carries only `(crop, disease_class, severity, language)` and passages
from official manuals. The service refuses classes outside the model taxonomy, so
free text (names, emails, coordinates) can never reach the prompt. The model
must answer from those passages, cite them by id, and set `covered` to false
when they do not answer the question. Answers without a valid citation are
treated as declined, so nothing ungrounded reaches the farmer.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Final, Protocol

from healthycropping_api.rag.cache import ExplanationCache, cache_key
from healthycropping_api.rag.index import RagIndex, RetrievedChunk
from healthycropping_api.rag.queries import build_query
from healthycropping_api.rag.taxonomy import CROP_CLASSES, HEALTHY_CLASS
from healthycropping_api.schemas import (
    Citation,
    DeclineReason,
    ExplanationRequest,
    ExplanationResponse,
)

TOP_K: Final = 4
# Below this cosine score a passage shares almost no vocabulary with the query.
MIN_SCORE: Final = 0.02
MAX_STEPS: Final = 6

CROP_NAMES: Final[dict[str, dict[str, str]]] = {
    "es": {"coffee": "café", "cacao": "cacao", "banana": "banano"},
    "en": {"coffee": "coffee", "cacao": "cacao", "banana": "banana"},
}
SEVERITY_NAMES: Final[dict[str, dict[str, str]]] = {
    "es": {"watch": "vigilar (síntomas iniciales)", "actNow": "actuar ya (daño avanzado)"},
    "en": {"watch": "watch (early symptoms)", "actNow": "act now (advanced damage)"},
}
LANGUAGE_NAMES: Final = {"es": "Spanish (Costa Rica)", "en": "English"}

SYSTEM_INSTRUCTION: Final = """You help smallholder farmers in Costa Rica understand an \
on-device crop disease diagnosis. Rules:
1. Use ONLY the numbered passages from official agronomic manuals in the user message. \
Do not add facts, products, doses or timings that are not in the passages.
2. Write in plain, short sentences in the requested language, for a farmer, not a scientist. \
Translate passages that are in another language.
3. `summary`: 2-3 sentences on what the problem is and why it matters at this severity.
4. `next_steps`: 2-6 concrete actions taken from the passages, most urgent first.
5. `cited_passages`: the ids (for example "P1") of every passage you used.
6. If the passages do not describe this disease or give no usable guidance, set `covered` \
to false, leave `summary` empty and `next_steps` empty.
7. Never ask for or mention personal data. Recommend consulting an agronomist before \
applying agrochemicals."""

RESPONSE_SCHEMA: Final[dict[str, Any]] = {
    "type": "object",
    "properties": {
        "covered": {"type": "boolean"},
        "summary": {"type": "string"},
        "next_steps": {"type": "array", "items": {"type": "string"}},
        "cited_passages": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["covered", "summary", "next_steps", "cited_passages"],
}


class ExplanationModel(Protocol):
    """A text generator that returns a JSON string matching `RESPONSE_SCHEMA`."""

    def generate(self, system_instruction: str, prompt: str, schema: dict[str, Any]) -> str: ...


class ExplanationUnavailableError(RuntimeError):
    """The model failed or returned something that is not valid JSON."""


class UnsupportedClassError(ValueError):
    """The class is not one of the crop's model classes."""


@dataclass(frozen=True)
class Passage:
    label: str
    retrieved: RetrievedChunk


def passage_label(position: int) -> str:
    return f"P{position}"


def build_prompt(request: ExplanationRequest, passages: list[Passage]) -> str:
    """User message: the diagnosis (no personal data) plus the numbered passages."""
    language = request.language
    lines = [
        f"Answer language: {LANGUAGE_NAMES[language]}.",
        f"Crop: {CROP_NAMES[language][request.crop]}.",
        f"Diagnosed problem (model class): {request.disease_class}.",
        f"Severity: {SEVERITY_NAMES[language][request.severity]}.",
        "",
        "Passages:",
    ]
    for passage in passages:
        chunk = passage.retrieved.chunk
        lines.append(
            f"[{passage.label}] {chunk.source_title} — {chunk.section_heading} "
            f"({chunk.publisher}, {chunk.year}; language: {chunk.language})\n{chunk.text}"
        )
    return "\n".join(lines)


def _declined(request: ExplanationRequest, reason: DeclineReason) -> ExplanationResponse:
    return ExplanationResponse(
        crop=request.crop,
        disease_class=request.disease_class,
        severity=request.severity,
        language=request.language,
        covered=False,
        summary=None,
        next_steps=[],
        citations=[],
        declined_reason=reason,
    )


def _citations(passages: list[Passage], cited: list[str]) -> list[Citation]:
    by_label = {passage.label: passage.retrieved.chunk for passage in passages}
    citations: list[Citation] = []
    seen: set[tuple[str, str]] = set()
    for label in cited:
        chunk = by_label.get(label.strip().strip("[]"))
        if chunk is None or (chunk.source_id, chunk.section_heading) in seen:
            continue
        seen.add((chunk.source_id, chunk.section_heading))
        citations.append(
            Citation(
                source_title=chunk.source_title,
                publisher=chunk.publisher,
                year=chunk.year,
                section=chunk.section_heading,
                first_page=chunk.first_page,
                last_page=chunk.last_page,
                url=chunk.url,
            )
        )
    return citations


def is_supported(crop: str, disease_class: str) -> bool:
    return disease_class in CROP_CLASSES.get(crop, ())


def _is_shareable(response: ExplanationResponse) -> bool:
    """Cache every answer except a model refusal, which a later call may answer."""
    return response.declined_reason != "not_covered"


class ExplanationService:
    def __init__(
        self,
        index_loader: Callable[[], RagIndex],
        model: ExplanationModel,
        cache: ExplanationCache | None = None,
    ) -> None:
        self._index_loader = index_loader
        self._model = model
        self._cache = cache if cache is not None else ExplanationCache()

    def explain(self, request: ExplanationRequest) -> ExplanationResponse:
        if not is_supported(request.crop, request.disease_class):
            raise UnsupportedClassError(request.disease_class)
        return self._cache.get_or_create(
            cache_key(request), lambda: self._explain(request), _is_shareable
        )

    def _explain(self, request: ExplanationRequest) -> ExplanationResponse:
        if request.disease_class == HEALTHY_CLASS or request.severity == "healthy":
            return _declined(request, "healthy")

        index = self._index_loader()
        query = build_query(request.crop, request.disease_class, request.severity)
        retrieved = [
            result
            for result in index.retrieve(request.crop, request.disease_class, query, TOP_K)
            if result.score >= MIN_SCORE
        ]
        if not retrieved:
            return _declined(request, "no_sources")
        passages = [
            Passage(passage_label(position), result)
            for position, result in enumerate(retrieved, start=1)
        ]

        raw = self._model.generate(
            SYSTEM_INSTRUCTION, build_prompt(request, passages), RESPONSE_SCHEMA
        )
        try:
            answer = json.loads(raw)
        except (TypeError, ValueError) as exc:
            raise ExplanationUnavailableError("model returned invalid JSON") from exc
        if not isinstance(answer, dict):
            raise ExplanationUnavailableError("model returned a non-object JSON value")

        summary = answer.get("summary")
        steps = answer.get("next_steps")
        cited = answer.get("cited_passages")
        citations = _citations(passages, cited if isinstance(cited, list) else [])
        if (
            answer.get("covered") is not True
            or not isinstance(summary, str)
            or not summary.strip()
            or not citations
        ):
            return _declined(request, "not_covered")
        next_steps = [
            step.strip()
            for step in (steps if isinstance(steps, list) else [])
            if isinstance(step, str) and step.strip()
        ][:MAX_STEPS]
        return ExplanationResponse(
            crop=request.crop,
            disease_class=request.disease_class,
            severity=request.severity,
            language=request.language,
            covered=True,
            summary=summary.strip(),
            next_steps=next_steps,
            citations=citations,
        )
