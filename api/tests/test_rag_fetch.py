"""Cached, checksum-verified document downloads (no network)."""

import hashlib
import io
import urllib.request
from pathlib import Path
from typing import BinaryIO

import pytest

from healthycropping_api.rag.fetch import USER_AGENT, ChecksumMismatchError, fetch_document
from healthycropping_api.rag.sources import SectionSpec, SourceSpec

CONTENT = b"%PDF-1.4 fake manual"


def spec(sha256: str | None) -> SourceSpec:
    return SourceSpec(
        id="demo-guide",
        crop="coffee",
        title="Guía",
        publisher="ICAFE",
        year=2020,
        language="es",
        url="https://example.org/files/guide.pdf?download=1",
        sha256=sha256,
        drop_lines=(),
        sections=(SectionSpec("Roya", ("leaf_rust",), 1, 1),),
    )


class FakeOpener:
    def __init__(self, content: bytes) -> None:
        self.content = content
        self.requests: list[urllib.request.Request] = []

    def __call__(self, request: urllib.request.Request) -> BinaryIO:
        self.requests.append(request)
        return io.BytesIO(self.content)


def test_downloads_once_and_reuses_the_verified_cache(tmp_path: Path) -> None:
    digest = hashlib.sha256(CONTENT).hexdigest()
    opener = FakeOpener(CONTENT)

    path, first = fetch_document(spec(digest), tmp_path, opener)
    again, second = fetch_document(spec(digest), tmp_path, opener)

    assert path == again == tmp_path / "demo-guide.pdf"
    assert path.read_bytes() == CONTENT
    assert first == second == digest
    assert len(opener.requests) == 1
    assert opener.requests[0].get_header("User-agent") == USER_AGENT


def test_rejects_and_deletes_a_download_with_the_wrong_checksum(tmp_path: Path) -> None:
    with pytest.raises(ChecksumMismatchError, match="expected sha256"):
        fetch_document(spec("0" * 64), tmp_path, FakeOpener(CONTENT))
    assert list(tmp_path.iterdir()) == []


def test_redownloads_a_cached_file_that_no_longer_matches(tmp_path: Path) -> None:
    digest = hashlib.sha256(CONTENT).hexdigest()
    (tmp_path / "demo-guide.pdf").write_bytes(b"corrupted")
    opener = FakeOpener(CONTENT)

    path, _ = fetch_document(spec(digest), tmp_path, opener)

    assert path.read_bytes() == CONTENT
    assert len(opener.requests) == 1


def test_reports_the_digest_when_no_checksum_is_pinned(tmp_path: Path) -> None:
    _, digest = fetch_document(spec(None), tmp_path, FakeOpener(CONTENT))
    assert digest == hashlib.sha256(CONTENT).hexdigest()
