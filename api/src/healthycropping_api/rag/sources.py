"""Load and validate the agronomic source list (`api/rag_sources.toml`)."""

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from healthycropping_api.rag.taxonomy import CROP_CLASSES, HEALTHY_CLASS

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
SOURCE_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class SourceConfigError(ValueError):
    """Raised when `rag_sources.toml` is malformed."""


@dataclass(frozen=True)
class SectionSpec:
    heading: str
    disease_classes: tuple[str, ...]
    first_page: int
    last_page: int
    start: str | None = None
    end: str | None = None
    exclude: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class SourceSpec:
    id: str
    crop: str
    title: str
    publisher: str
    year: int
    language: str
    url: str
    sha256: str | None
    drop_lines: tuple[str, ...]
    sections: tuple[SectionSpec, ...]
    soft_hyphens: bool = False

    @property
    def filename(self) -> str:
        suffix = Path(self.url.split("?", 1)[0]).suffix.lower() or ".pdf"
        return f"{self.id}{suffix}"


def _require(table: dict[str, Any], key: str, kind: type, where: str) -> Any:
    value = table.get(key)
    if not isinstance(value, kind) or isinstance(value, bool) != (kind is bool):
        raise SourceConfigError(f"{where}: '{key}' must be a {kind.__name__}")
    return value


def _optional_str(table: dict[str, Any], key: str, where: str) -> str | None:
    value = table.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise SourceConfigError(f"{where}: '{key}' must be a non-empty string")
    return value


def _parse_section(raw: dict[str, Any], crop: str, where: str) -> SectionSpec:
    heading = _require(raw, "heading", str, where)
    classes = raw.get("disease_classes")
    if not isinstance(classes, list) or not classes or not all(isinstance(c, str) for c in classes):
        raise SourceConfigError(f"{where}: 'disease_classes' must be a non-empty list of strings")
    unknown = [c for c in classes if c not in CROP_CLASSES[crop] or c == HEALTHY_CLASS]
    if unknown:
        raise SourceConfigError(f"{where}: unknown {crop} disease classes {unknown}")
    pages = raw.get("pages")
    if (
        not isinstance(pages, list)
        or len(pages) != 2
        or not all(isinstance(p, int) and not isinstance(p, bool) for p in pages)
        or pages[0] < 1
        or pages[1] < pages[0]
    ):
        raise SourceConfigError(f"{where}: 'pages' must be [first, last] with 1 <= first <= last")
    raw_exclude = raw.get("exclude", [])
    if not isinstance(raw_exclude, list) or not all(
        isinstance(pair, list)
        and len(pair) == 2
        and all(isinstance(marker, str) and marker.strip() for marker in pair)
        for pair in raw_exclude
    ):
        raise SourceConfigError(f"{where}: 'exclude' must be a list of [from, to] phrases")
    return SectionSpec(
        heading=heading,
        disease_classes=tuple(classes),
        first_page=pages[0],
        last_page=pages[1],
        start=_optional_str(raw, "start", where),
        end=_optional_str(raw, "end", where),
        exclude=tuple((pair[0], pair[1]) for pair in raw_exclude),
    )


def _parse_source(raw: dict[str, Any], index: int) -> SourceSpec:
    where = f"sources[{index}]"
    source_id = _require(raw, "id", str, where)
    if not SOURCE_ID_PATTERN.match(source_id):
        raise SourceConfigError(f"{where}: 'id' must be lowercase kebab-case")
    where = f"source '{source_id}'"
    crop = _require(raw, "crop", str, where)
    if crop not in CROP_CLASSES:
        raise SourceConfigError(f"{where}: unknown crop '{crop}'")
    url = _require(raw, "url", str, where)
    if not url.startswith("https://"):
        raise SourceConfigError(f"{where}: 'url' must use https")
    sha256 = _optional_str(raw, "sha256", where)
    if sha256 is not None and not SHA256_PATTERN.match(sha256):
        raise SourceConfigError(f"{where}: 'sha256' must be 64 lowercase hex characters")
    drop_lines = raw.get("drop_lines", [])
    if not isinstance(drop_lines, list) or not all(isinstance(p, str) for p in drop_lines):
        raise SourceConfigError(f"{where}: 'drop_lines' must be a list of regular expressions")
    for pattern in drop_lines:
        try:
            re.compile(pattern)
        except re.error as exc:
            raise SourceConfigError(f"{where}: invalid drop_lines pattern {pattern!r}") from exc
    soft_hyphens = raw.get("soft_hyphens", False)
    if not isinstance(soft_hyphens, bool):
        raise SourceConfigError(f"{where}: 'soft_hyphens' must be true or false")
    raw_sections = raw.get("sections")
    if not isinstance(raw_sections, list) or not raw_sections:
        raise SourceConfigError(f"{where}: at least one [[sources.sections]] is required")
    sections = tuple(
        _parse_section(section, crop, f"{where} section {i}")
        for i, section in enumerate(raw_sections)
    )
    return SourceSpec(
        id=source_id,
        crop=crop,
        title=_require(raw, "title", str, where),
        publisher=_require(raw, "publisher", str, where),
        year=_require(raw, "year", int, where),
        language=_require(raw, "language", str, where),
        url=url,
        sha256=sha256,
        drop_lines=tuple(drop_lines),
        sections=sections,
        soft_hyphens=soft_hyphens,
    )


def parse_sources(data: dict[str, Any]) -> list[SourceSpec]:
    raw_sources = data.get("sources")
    if not isinstance(raw_sources, list) or not raw_sources:
        raise SourceConfigError("at least one [[sources]] entry is required")
    sources = [_parse_source(raw, i) for i, raw in enumerate(raw_sources)]
    ids = [source.id for source in sources]
    duplicates = sorted({source_id for source_id in ids if ids.count(source_id) > 1})
    if duplicates:
        raise SourceConfigError(f"duplicate source ids: {duplicates}")
    return sources


def load_sources(path: Path) -> list[SourceSpec]:
    with path.open("rb") as handle:
        return parse_sources(tomllib.load(handle))
