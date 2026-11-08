"""Tokenizer, diagnosis queries, deterministic index build, and top-k retrieval."""

import json
from pathlib import Path
from typing import Any

import pytest

from healthycropping_api.rag.index import (
    IndexFormatError,
    RagIndex,
    build_index,
    write_index,
)
from healthycropping_api.rag.queries import DISEASE_TERMS, SEVERITY_TERMS, build_query
from healthycropping_api.rag.taxonomy import CROP_CLASSES, disease_classes
from healthycropping_api.rag.text import tokenize


def chunk(
    chunk_id: str, crop: str, classes: list[str], text: str, language: str = "es"
) -> dict[str, Any]:
    source_id, section, index = chunk_id.split(":")
    return {
        "id": chunk_id,
        "source_id": source_id,
        "crop": crop,
        "disease_classes": classes,
        "source_title": f"Guía {source_id}",
        "publisher": "Institución",
        "year": 2021,
        "url": f"https://example.org/{source_id}.pdf",
        "language": language,
        "section_heading": section.replace("-", " ").title(),
        "first_page": 1,
        "last_page": 2,
        "chunk_index": int(index),
        "text": text,
    }


CORPUS = [
    chunk(
        "icafe:roya:0",
        "coffee",
        ["leaf_rust"],
        "Síntomas de la roya: manchas amarillas en el haz y polvo anaranjado en el envés "
        "de las hojas. Las lesiones viejas se ven negras.",
    ),
    chunk(
        "icafe:roya:1",
        "coffee",
        ["leaf_rust"],
        "Control de la roya: aplicar fungicida sistémico en las dosis recomendadas, "
        "combate químico preventivo según el sistema de alerta.",
    ),
    chunk(
        "icafe:variedades:0",
        "coffee",
        ["leaf_rust"],
        "La variedad Obatá fue introducida al país por su tolerancia y productividad.",
    ),
    chunk(
        "icafe:minador:0",
        "coffee",
        ["leaf_miner", "red_spider_mite"],
        "El minador de la hoja forma galerías; la arañita roja es un ácaro que broncea las hojas.",
    ),
    chunk(
        "catie:moniliasis:0",
        "cacao",
        ["monilia"],
        "Moniliasis: gibas y mancha chocolate en mazorcas jóvenes, luego esporulación blanca.",
    ),
    chunk(
        "catie:manejo:0",
        "cacao",
        ["monilia", "black_pod"],
        "Manejo integrado: eliminar frutos enfermos cada semana, regular la sombra y "
        "aplicar fungicida cúprico para el control.",
    ),
    chunk(
        "catie:mazorca:0",
        "cacao",
        ["black_pod"],
        "Mazorca negra causada por Phytophthora: mancha parda, micelio blanco y "
        "zoosporas que se dispersan con el agua.",
    ),
    chunk(
        "corbana:sigatoka:0",
        "banana",
        ["black_sigatoka"],
        "La Sigatoka negra (Mycosphaerella fijiensis) causa lesiones en las hojas; "
        "el deshoje sanitario reduce el inóculo.",
    ),
    chunk(
        "fao:symptoms:0",
        "banana",
        ["fusarium_wilt"],
        "Fusarium wilt symptoms: yellowing of older leaves, splitting of the pseudostem "
        "and vascular discoloration.",
        language="en",
    ),
    chunk(
        "fao:eradication:0",
        "banana",
        ["fusarium_wilt"],
        "Eradication and management of TR4 outbreaks: quarantine the area, destroy "
        "infected plants and control movement of soil.",
        language="en",
    ),
]


@pytest.fixture
def index() -> RagIndex:
    return RagIndex(build_index(CORPUS))


def test_tokenize_folds_accents_plurals_and_stopwords() -> None:
    assert tokenize("Las hojas MÁS viejas del cafeto, 2020") == ["hoja", "vieja", "cafeto"]
    assert tokenize("lesiones y galerías") == ["lesion", "galeria"]


@pytest.mark.parametrize("crop", sorted(CROP_CLASSES))
def test_every_disease_class_has_query_terms(crop: str) -> None:
    for name in disease_classes(crop):
        for severity in SEVERITY_TERMS:
            parts = build_query(crop, name, severity)
            assert all(tokenize(text) and weight > 0 for text, weight in parts)
    assert {key for key in DISEASE_TERMS if key[0] == crop} == {
        (crop, name) for name in disease_classes(crop)
    }


def test_build_is_deterministic_and_order_independent(tmp_path: Path) -> None:
    first, second = tmp_path / "a.json", tmp_path / "b.json"
    write_index(build_index(CORPUS), first)
    write_index(build_index(list(reversed(CORPUS))), second)

    assert first.read_bytes() == second.read_bytes()
    loaded = RagIndex.load(first)
    assert len(loaded.chunks) == len(CORPUS)
    assert json.loads(first.read_text(encoding="utf-8"))["format_version"] == 1


@pytest.mark.parametrize(
    ("crop", "disease_class", "severity", "expected_top"),
    [
        ("coffee", "leaf_rust", "actNow", "icafe:roya:1"),
        ("coffee", "leaf_rust", "watch", "icafe:roya:0"),
        ("coffee", "red_spider_mite", "watch", "icafe:minador:0"),
        ("cacao", "monilia", "watch", "catie:moniliasis:0"),
        ("cacao", "monilia", "actNow", "catie:manejo:0"),
        ("cacao", "black_pod", "watch", "catie:mazorca:0"),
        ("banana", "black_sigatoka", "actNow", "corbana:sigatoka:0"),
        ("banana", "fusarium_wilt", "watch", "fao:symptoms:0"),
        ("banana", "fusarium_wilt", "actNow", "fao:eradication:0"),
    ],
)
def test_top1_matches_the_expected_passage(
    index: RagIndex, crop: str, disease_class: str, severity: str, expected_top: str
) -> None:
    results = index.retrieve(crop, disease_class, build_query(crop, disease_class, severity))
    assert results[0].chunk.id == expected_top
    assert results[0].score > 0


def test_retrieval_only_returns_the_requested_crop_and_class(index: RagIndex) -> None:
    results = index.retrieve(
        "cacao", "black_pod", build_query("cacao", "black_pod", "actNow"), k=10
    )

    assert {result.chunk.id for result in results} == {"catie:mazorca:0", "catie:manejo:0"}
    assert all(result.chunk.crop == "cacao" for result in results)
    assert index.retrieve("coffee", "monilia", "moniliasis") == []


def test_results_keep_citation_metadata_and_respect_k(index: RagIndex) -> None:
    results = index.retrieve("coffee", "leaf_rust", build_query("coffee", "leaf_rust", "watch"), 2)

    assert len(results) == 2
    top = results[0].chunk
    assert (top.source_title, top.section_heading, top.url) == (
        "Guía icafe",
        "Roya",
        "https://example.org/icafe.pdf",
    )
    assert results[0].score >= results[1].score
    with pytest.raises(ValueError, match="k must be"):
        index.retrieve("coffee", "leaf_rust", "roya", k=0)


def test_ties_are_broken_by_chunk_id(index: RagIndex) -> None:
    results = index.retrieve("coffee", "leaf_rust", "palabra inexistente", k=3)
    assert [result.score for result in results] == [0.0, 0.0, 0.0]
    assert [result.chunk.id for result in results] == sorted(result.chunk.id for result in results)


def test_rejects_duplicate_ids_missing_fields_and_unknown_versions() -> None:
    with pytest.raises(IndexFormatError, match="unique"):
        build_index([CORPUS[0], CORPUS[0]])
    broken = dict(CORPUS[0])
    del broken["url"]
    with pytest.raises(IndexFormatError, match="missing"):
        build_index([broken])
    with pytest.raises(IndexFormatError, match="unsupported"):
        RagIndex({**build_index(CORPUS), "format_version": 99})
    with pytest.raises(IndexFormatError, match="malformed"):
        RagIndex({"format_version": 1, "idf": {}, "chunks": [{"id": "x"}]})
