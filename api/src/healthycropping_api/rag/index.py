"""Local TF-IDF index over agronomic chunks, with crop/disease filtering.

The index is built offline from `chunks.jsonl` and stored as deterministic JSON.
Retrieval first keeps only chunks of the requested crop that explain the
requested disease class (exact metadata filter), then ranks them by cosine
similarity between L2-normalized TF-IDF vectors.
"""

import json
import math
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from healthycropping_api.rag.text import tokenize

INDEX_FORMAT_VERSION = 1
DEFAULT_TOP_K = 4

CHUNK_FIELDS = (
    "id",
    "source_id",
    "crop",
    "disease_classes",
    "source_title",
    "publisher",
    "year",
    "url",
    "language",
    "section_heading",
    "first_page",
    "last_page",
    "chunk_index",
    "text",
)


class IndexFormatError(ValueError):
    """Raised when an index file is missing fields or has an unknown version."""


@dataclass(frozen=True)
class IndexedChunk:
    id: str
    source_id: str
    crop: str
    disease_classes: tuple[str, ...]
    source_title: str
    publisher: str
    year: int
    url: str
    language: str
    section_heading: str
    first_page: int
    last_page: int
    chunk_index: int
    text: str
    vector: Mapping[str, float]


@dataclass(frozen=True)
class RetrievedChunk:
    chunk: IndexedChunk
    score: float


def _normalize(weights: Mapping[str, float]) -> dict[str, float]:
    norm = math.sqrt(sum(value * value for value in weights.values()))
    if norm == 0:
        return {}
    return {term: round(value / norm, 6) for term, value in sorted(weights.items())}


def _tf_idf(tokens: list[str], idf: Mapping[str, float]) -> dict[str, float]:
    counts = Counter(tokens)
    return _normalize(
        {term: (1 + math.log(count)) * idf[term] for term, count in counts.items() if term in idf}
    )


def build_index(chunks: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    """Build the serializable index; the same chunks always give the same output."""
    records = sorted((dict(chunk) for chunk in chunks), key=lambda chunk: str(chunk["id"]))
    ids = [record["id"] for record in records]
    if len(set(ids)) != len(ids):
        raise IndexFormatError("chunk ids must be unique")
    for record in records:
        missing = [field for field in CHUNK_FIELDS if field not in record]
        if missing:
            raise IndexFormatError(f"chunk {record.get('id')!r} is missing {missing}")

    token_lists = [tokenize(f"{record['section_heading']} {record['text']}") for record in records]
    document_frequency = Counter(term for tokens in token_lists for term in set(tokens))
    total = len(records)
    idf = {
        term: round(math.log((1 + total) / (1 + count)) + 1, 6)
        for term, count in sorted(document_frequency.items())
    }
    return {
        "format_version": INDEX_FORMAT_VERSION,
        "chunk_count": total,
        "idf": idf,
        "chunks": [
            {**{field: record[field] for field in CHUNK_FIELDS}, "vector": _tf_idf(tokens, idf)}
            for record, tokens in zip(records, token_lists, strict=True)
        ],
    }


def write_index(index: Mapping[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(index, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
        newline="\n",
    )


class RagIndex:
    """In-memory retriever over a built index."""

    def __init__(self, data: Mapping[str, Any]) -> None:
        if data.get("format_version") != INDEX_FORMAT_VERSION:
            raise IndexFormatError(f"unsupported index format {data.get('format_version')!r}")
        try:
            self._idf: dict[str, float] = dict(data["idf"])
            self.chunks: tuple[IndexedChunk, ...] = tuple(
                IndexedChunk(
                    **{field: raw[field] for field in CHUNK_FIELDS if field != "disease_classes"},
                    disease_classes=tuple(raw["disease_classes"]),
                    vector=dict(raw["vector"]),
                )
                for raw in data["chunks"]
            )
        except (KeyError, TypeError) as exc:
            raise IndexFormatError(f"malformed index: {exc}") from exc

    @classmethod
    def load(cls, path: Path) -> "RagIndex":
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def candidates(self, crop: str, disease_class: str) -> list[IndexedChunk]:
        return [
            chunk
            for chunk in self.chunks
            if chunk.crop == crop and disease_class in chunk.disease_classes
        ]

    def _query_vector(self, query: str | Sequence[tuple[str, float]]) -> dict[str, float]:
        """TF-IDF vector of a query; weighted parts are normalized, scaled and summed."""
        parts = [(query, 1.0)] if isinstance(query, str) else list(query)
        combined: dict[str, float] = {}
        for text, weight in parts:
            for term, value in _tf_idf(tokenize(text), self._idf).items():
                combined[term] = combined.get(term, 0.0) + weight * value
        return _normalize(combined)

    def retrieve(
        self,
        crop: str,
        disease_class: str,
        query: str | Sequence[tuple[str, float]],
        k: int = DEFAULT_TOP_K,
    ) -> list[RetrievedChunk]:
        """Top-`k` chunks for one crop and disease class, best first.

        `query` is plain text or weighted `(text, weight)` parts (see
        `queries.build_query`). Ties are broken by chunk id so results are stable.
        """
        if k < 1:
            raise ValueError("k must be at least 1")
        query_vector = self._query_vector(query)
        scored = [
            RetrievedChunk(
                chunk=chunk,
                score=round(
                    sum(
                        weight * chunk.vector.get(term, 0.0)
                        for term, weight in query_vector.items()
                    ),
                    6,
                ),
            )
            for chunk in self.candidates(crop, disease_class)
        ]
        scored.sort(key=lambda result: (-result.score, result.chunk.id))
        return scored[:k]
