"""Section-aware chunking and citation metadata, on synthetic page text."""

import itertools

import pytest

from healthycropping_api.rag.chunking import (
    SectionNotFoundError,
    build_chunks,
    clean_lines,
    fold,
    reflow,
    section_text,
    slugify,
    split_text,
)
from healthycropping_api.rag.sources import SectionSpec, SourceSpec

HEADER = r"^GU[IÍ]A T[EÉ]CNICA$"
PAGE_NUMBER = r"^\d{1,3}$"


def make_source(crop: str, sections: tuple[SectionSpec, ...]) -> SourceSpec:
    return SourceSpec(
        id=f"{crop}-guide",
        crop=crop,
        title=f"Guía de {crop}",
        publisher="Institución pública",
        year=2024,
        language="es",
        url=f"https://example.org/{crop}.pdf",
        sha256=None,
        drop_lines=(HEADER, PAGE_NUMBER),
        sections=sections,
    )


def test_fold_keeps_length_and_ignores_accents_and_case() -> None:
    text = "Arañita ROJA\tÁcaro"
    assert fold(text) == "aranita roja acaro"
    assert len(fold(text)) == len(text)
    assert slugify("Minador de la hoja; Arañita roja") == "minador-de-la-hoja-aranita-roja"


def test_clean_lines_drops_running_headers_and_page_numbers() -> None:
    page = "53\nGUÍA TÉCNICA\n  Roya   del Cafeto \n\nEs una enfermedad."
    assert clean_lines(page, (HEADER, PAGE_NUMBER)) == ["Roya del Cafeto", "Es una enfermedad."]


def test_reflow_joins_wrapped_lines_and_keeps_list_items() -> None:
    lines = [
        "Es una enfermedad que está presente en",
        "todo el país.",
        "Recomendaciones:",
        "1. Podar las plantas",
        "agotadas.",
        "2. Deshijar dos veces",
        "deficiencias de nitrógeno-",
        "magnesio",
    ]
    assert reflow(lines) == [
        "Es una enfermedad que está presente en todo el país.",
        "Recomendaciones:",
        "1. Podar las plantas agotadas.",
        "2. Deshijar dos veces deficiencias de nitrógeno-magnesio",
    ]


def test_reflow_removes_soft_hyphens_only_when_enabled() -> None:
    lines = [
        "la mazorca negra afecta de manera ge-",
        "neral y el inver -",
        "nadero.",
        "Phillips-",
        "Mora.",
    ]
    assert reflow(lines, soft_hyphens=True) == [
        "la mazorca negra afecta de manera general y el invernadero.",
        "Phillips-Mora.",
    ]
    assert reflow(lines[:3]) == ["la mazorca negra afecta de manera ge-neral y el inver -nadero."]


def test_section_text_removes_spaces_before_punctuation() -> None:
    section = SectionSpec("Moniliasis", ("monilia",), 1, 1)
    spec = make_source("cacao", (section,))
    assert section_text(["Desrosiers y Suárez 1974) . El éxito ,"], spec, section) == (
        "Desrosiers y Suárez 1974). El éxito,"
    )


def test_section_text_uses_page_range_and_accent_insensitive_markers() -> None:
    pages = [
        "1\nIntroducción general.",
        "2\nEl minador de la hoja daña las hojas.\nLa arañita roja es un ácaro.",
        "3\nPicudo come bordes de hojas.",
    ]
    miner = SectionSpec(
        heading="Minador",
        disease_classes=("leaf_miner",),
        first_page=2,
        last_page=2,
        start="el minador",
        end="LA ARANITA ROJA",
    )
    mite = SectionSpec(
        heading="Arañita",
        disease_classes=("red_spider_mite",),
        first_page=2,
        last_page=3,
        start="la aranita roja",
        end="Picudo",
    )
    spec = make_source("coffee", (miner, mite))
    assert section_text(pages, spec, miner) == "El minador de la hoja daña las hojas."
    assert section_text(pages, spec, mite) == "La arañita roja es un ácaro."


def test_section_text_removes_excluded_blocks() -> None:
    page = "Combate con deshoje. Azofeifa, D. 2007. Efecto. CORBANA 33. Monitoreo semanal."
    section = SectionSpec(
        "Sigatoka", ("black_sigatoka",), 1, 1, exclude=(("azofeifa, d", "Monitoreo"),)
    )
    spec = make_source("banana", (section,))
    assert section_text([page], spec, section) == "Combate con deshoje.\nMonitoreo semanal."

    stale = SectionSpec("Sigatoka", ("black_sigatoka",), 1, 1, exclude=(("Stover", "Monitoreo"),))
    with pytest.raises(SectionNotFoundError, match="exclude markers"):
        section_text([page], make_source("banana", (stale,)), stale)


def test_section_text_reports_missing_pages_and_markers() -> None:
    missing_page = SectionSpec("Roya", ("leaf_rust",), 5, 6)
    missing_marker = SectionSpec("Roya", ("leaf_rust",), 1, 1, start="hemileia")
    spec = make_source("coffee", (missing_page,))
    with pytest.raises(SectionNotFoundError, match="page 6"):
        section_text(["a"], spec, missing_page)
    with pytest.raises(SectionNotFoundError, match="start marker"):
        section_text(["Roya del cafeto."], spec, missing_marker)


def test_split_text_respects_size_and_overlaps_sentences() -> None:
    sentences = [f"Frase número {i} sobre manejo integrado del cultivo." for i in range(30)]
    chunks = split_text(" ".join(sentences), max_chars=300, overlap_chars=80)

    assert len(chunks) > 1
    assert all(len(chunk) <= 300 for chunk in chunks)
    for previous, current in itertools.pairwise(chunks):
        last_sentence = previous.rsplit(". ", 1)[-1]
        assert current.startswith(last_sentence.split(" sobre")[0])
    assert "Frase número 29" in chunks[-1]


def test_split_text_wraps_a_single_oversized_sentence() -> None:
    chunks = split_text("palabra " * 100, max_chars=120, overlap_chars=0)
    assert all(len(chunk) <= 120 for chunk in chunks)
    assert " ".join(chunks).split() == ["palabra"] * 100


def test_split_text_rejects_overlap_as_large_as_the_chunk() -> None:
    with pytest.raises(ValueError, match="overlap"):
        split_text("texto", max_chars=100, overlap_chars=100)


@pytest.mark.parametrize(
    ("crop", "classes", "page"),
    [
        ("coffee", ("leaf_rust",), "Roya del cafeto. Manchas amarillas y polvo anaranjado."),
        ("cacao", ("monilia", "black_pod"), "Moniliasis y mazorca negra. Retirar frutos enfermos."),
        ("banana", ("black_sigatoka",), "Sigatoka negra. Deshoje sanitario semanal."),
    ],
)
def test_build_chunks_carries_citation_metadata(
    crop: str, classes: tuple[str, ...], page: str
) -> None:
    section = SectionSpec(
        heading="Enfermedades", disease_classes=classes, first_page=2, last_page=2
    )
    spec = make_source(crop, (section,))

    [chunk] = build_chunks(spec, ["1\nPortada", f"2\n{page}"])

    assert chunk.id == f"{crop}-guide:enfermedades:0"
    assert chunk.crop == crop
    assert chunk.disease_classes == classes
    assert (chunk.source_title, chunk.section_heading) == (f"Guía de {crop}", "Enfermedades")
    assert (chunk.first_page, chunk.last_page) == (2, 2)
    assert chunk.text == page
    assert chunk.to_dict()["disease_classes"] == list(classes)


def test_build_chunks_rejects_an_empty_section() -> None:
    section = SectionSpec(
        heading="Vacía", disease_classes=("leaf_rust",), first_page=1, last_page=1
    )
    with pytest.raises(SectionNotFoundError, match="empty"):
        build_chunks(make_source("coffee", (section,)), ["12\nGUÍA TÉCNICA"])
