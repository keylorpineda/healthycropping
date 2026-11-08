"""rag_sources.toml parsing and the class taxonomy shared with the app."""

import json
from pathlib import Path
from typing import Any

import pytest

from healthycropping_api.rag.sources import SourceConfigError, load_sources, parse_sources
from healthycropping_api.rag.taxonomy import CROP_CLASSES, disease_classes

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCES_PATH = REPO_ROOT / "api" / "rag_sources.toml"


def source(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "demo-guide",
        "crop": "coffee",
        "title": "Guía",
        "publisher": "ICAFE",
        "year": 2020,
        "language": "es",
        "url": "https://example.org/guide.pdf",
        "sections": [{"heading": "Roya", "disease_classes": ["leaf_rust"], "pages": [3, 4]}],
    }
    return {**base, **overrides}


@pytest.mark.parametrize("crop", sorted(CROP_CLASSES))
def test_taxonomy_matches_app_model_registry(crop: str) -> None:
    registry_path = REPO_ROOT / "app" / "src" / "ml" / "models" / crop / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    assert tuple(registry["labels"]) == CROP_CLASSES[crop]
    assert "healthy" not in disease_classes(crop)


def test_repository_source_list_is_valid() -> None:
    sources = load_sources(SOURCES_PATH)
    assert sources
    for spec in sources:
        assert spec.sha256 is not None, f"{spec.id} must pin a sha256"
        assert spec.url.startswith("https://")


@pytest.mark.parametrize("crop", sorted(CROP_CLASSES))
def test_every_disease_class_has_a_configured_section(crop: str) -> None:
    covered = {
        name
        for spec in load_sources(SOURCES_PATH)
        if spec.crop == crop
        for section in spec.sections
        for name in section.disease_classes
    }
    assert covered == set(disease_classes(crop))


def test_parses_sections_and_derives_the_cache_filename() -> None:
    [spec] = parse_sources({"sources": [source(sha256="a" * 64)]})
    assert spec.filename == "demo-guide.pdf"
    [section] = spec.sections
    assert (section.first_page, section.last_page) == (3, 4)
    assert section.disease_classes == ("leaf_rust",)
    assert section.start is None
    assert spec.soft_hyphens is False


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"crop": "tomato"}, "unknown crop"),
        ({"id": "Demo Guide"}, "kebab-case"),
        ({"url": "http://example.org/guide.pdf"}, "https"),
        ({"sha256": "ABC"}, "sha256"),
        ({"year": "2020"}, "'year' must be a int"),
        ({"drop_lines": ["("]}, "invalid drop_lines"),
        ({"soft_hyphens": "yes"}, "soft_hyphens"),
        (
            {
                "sections": [
                    {
                        "heading": "X",
                        "disease_classes": ["leaf_rust"],
                        "pages": [1, 1],
                        "exclude": [["only one"]],
                    }
                ]
            },
            "'exclude'",
        ),
        ({"sections": []}, "at least one"),
        (
            {"sections": [{"heading": "X", "disease_classes": ["monilia"], "pages": [1, 1]}]},
            "unknown coffee disease classes",
        ),
        (
            {"sections": [{"heading": "X", "disease_classes": ["healthy"], "pages": [1, 1]}]},
            "unknown coffee disease classes",
        ),
        (
            {"sections": [{"heading": "X", "disease_classes": ["leaf_rust"], "pages": [4, 3]}]},
            "'pages'",
        ),
    ],
)
def test_rejects_invalid_entries(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(SourceConfigError, match=message):
        parse_sources({"sources": [source(**overrides)]})


def test_rejects_duplicate_ids() -> None:
    with pytest.raises(SourceConfigError, match="duplicate"):
        parse_sources({"sources": [source(), source()]})
