"""Turn configured document sections into citable text chunks.

Everything here is pure (text in, chunks out) so it can be tested without PDFs.
"""

import re
import unicodedata
from dataclasses import asdict, dataclass
from typing import Any

from healthycropping_api.rag.sources import SectionSpec, SourceSpec

DEFAULT_MAX_CHARS = 900
DEFAULT_OVERLAP_CHARS = 150

# Numbered items ("1.", "2)"), lettered items ("a)"), and bullet, middle dot, en dash, hyphen.
_BULLETS = "".join(chr(code) for code in (0x2022, 0x00B7, 0x2013)) + "-"
_LIST_ITEM = re.compile(r"^(?:\d{1,2}[.)]|[a-z]\)|[" + _BULLETS + r"])\s")
_SENTENCE_END = re.compile(r"[.:!?;]$")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?:;])\s+")


class SectionNotFoundError(ValueError):
    """Raised when a section's pages or start marker are missing from a document."""


@dataclass(frozen=True)
class Chunk:
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

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["disease_classes"] = list(self.disease_classes)
        return data


def fold(text: str) -> str:
    """Lowercase and strip accents, keeping one output character per input character."""
    return "".join(
        unicodedata.normalize("NFD", char)[0].lower() if char.strip() else " " for char in text
    )


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", fold(text)).strip("-")


def clean_lines(page_text: str, drop_patterns: tuple[str, ...]) -> list[str]:
    """Strip each line and drop empty lines and running headers/page numbers."""
    compiled = [re.compile(pattern) for pattern in drop_patterns]
    lines: list[str] = []
    for raw in page_text.splitlines():
        line = " ".join(raw.split())
        if line and not any(pattern.search(line) for pattern in compiled):
            lines.append(line)
    return lines


def reflow(lines: list[str]) -> list[str]:
    """Join wrapped PDF lines into paragraphs.

    A paragraph ends after a line that closes a sentence; list items always start
    a new paragraph. A line ending in a hyphen is joined without a space.
    """
    paragraphs: list[str] = []
    current = ""
    for line in lines:
        if current and _LIST_ITEM.match(line):
            paragraphs.append(current)
            current = ""
        if not current:
            current = line
        elif current.endswith("-"):
            current += line
        else:
            current = f"{current} {line}"
        if _SENTENCE_END.search(current):
            paragraphs.append(current)
            current = ""
    if current:
        paragraphs.append(current)
    return paragraphs


def section_text(pages: list[str], source: SourceSpec, section: SectionSpec) -> str:
    """Text of one section: its page range, cut at the optional start/end markers."""
    if section.last_page > len(pages):
        raise SectionNotFoundError(
            f"{source.id}: '{section.heading}' needs page {section.last_page}, "
            f"document has {len(pages)}"
        )
    lines: list[str] = []
    for page in pages[section.first_page - 1 : section.last_page]:
        lines.extend(clean_lines(page, source.drop_lines))
    text = "\n".join(reflow(lines))

    folded = fold(text)
    start = 0
    if section.start:
        start = folded.find(" ".join(fold(section.start).split()))
        if start < 0:
            raise SectionNotFoundError(
                f"{source.id}: start marker {section.start!r} not found for '{section.heading}'"
            )
    end = len(text)
    if section.end:
        found = folded.find(" ".join(fold(section.end).split()), start + 1)
        if found >= 0:
            end = found
    return text[start:end].strip()


def split_text(
    text: str,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[str]:
    """Split on paragraph and sentence boundaries into chunks of at most `max_chars`.

    Consecutive chunks repeat up to `overlap_chars` of trailing sentences so a
    retrieved chunk keeps its context. A single sentence longer than `max_chars`
    is hard-wrapped on word boundaries.
    """
    if overlap_chars >= max_chars:
        raise ValueError("overlap_chars must be smaller than max_chars")
    sentences: list[str] = []
    for paragraph in text.split("\n"):
        for sentence in _SENTENCE_SPLIT.split(paragraph.strip()):
            if not sentence:
                continue
            while len(sentence) > max_chars:
                cut = sentence.rfind(" ", 0, max_chars)
                cut = cut if cut > 0 else max_chars
                sentences.append(sentence[:cut].strip())
                sentence = sentence[cut:].strip()
            sentences.append(sentence)

    chunks: list[str] = []
    current: list[str] = []
    for sentence in sentences:
        candidate = " ".join([*current, sentence])
        if current and len(candidate) > max_chars:
            chunks.append(" ".join(current))
            tail: list[str] = []
            for previous in reversed(current):
                if len(" ".join([previous, *tail, sentence])) > max_chars:
                    break
                if len(" ".join([previous, *tail])) > overlap_chars:
                    break
                tail.insert(0, previous)
            current = [*tail, sentence]
        else:
            current.append(sentence)
    if current:
        chunks.append(" ".join(current))
    return chunks


def build_chunks(
    source: SourceSpec,
    pages: list[str],
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[Chunk]:
    """Chunk every configured section of one document."""
    chunks: list[Chunk] = []
    for section in source.sections:
        text = section_text(pages, source, section)
        if not text:
            raise SectionNotFoundError(f"{source.id}: section '{section.heading}' is empty")
        for index, piece in enumerate(split_text(text, max_chars, overlap_chars)):
            chunks.append(
                Chunk(
                    id=f"{source.id}:{slugify(section.heading)}:{index}",
                    source_id=source.id,
                    crop=source.crop,
                    disease_classes=section.disease_classes,
                    source_title=source.title,
                    publisher=source.publisher,
                    year=source.year,
                    url=source.url,
                    language=source.language,
                    section_heading=section.heading,
                    first_page=section.first_page,
                    last_page=section.last_page,
                    chunk_index=index,
                    text=piece,
                )
            )
    return chunks
