"""Unit tests for Range-based selective extraction from remote ZIP archives."""

from __future__ import annotations

import io
import zipfile

import pytest

from healthycropping_ml.remote_zip import (
    RemoteZipError,
    ZipEntry,
    batch_byte_range,
    extract_entry,
    plan_contiguous_batches,
    read_remote_entries,
)


def _build_zip(files: dict[str, bytes], compression: int = zipfile.ZIP_DEFLATED) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=compression) as zf:
        zf.writestr("FOLDER/", b"")
        for name, payload in files.items():
            zf.writestr(name, payload)
    return buffer.getvalue()


class _RecordingFetcher:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.calls: list[tuple[int, int]] = []

    def __call__(self, start: int, end: int) -> bytes:
        self.calls.append((start, end))
        return self.data[start : end + 1]


FILES = {f"FOLDER/IMG_{i:03d}.jpg": bytes([i % 251]) * (500 + 37 * i) for i in range(12)}


@pytest.mark.parametrize("compression", [zipfile.ZIP_DEFLATED, zipfile.ZIP_STORED])
def test_reads_central_directory_and_extracts_every_entry(compression: int) -> None:
    archive = _build_zip(FILES, compression)
    fetch = _RecordingFetcher(archive)

    entries = read_remote_entries(fetch, len(archive))
    files = [e for e in entries if not e.is_dir]
    assert {e.name for e in files} == set(FILES)
    assert any(e.is_dir for e in entries)

    for batch in plan_contiguous_batches(files, max_batch_bytes=4_000):
        start, end = batch_byte_range(batch)
        blob = fetch(start, min(end, len(archive) - 1))
        for entry in batch:
            assert extract_entry(blob, start, entry) == FILES[entry.name]


def test_small_archive_needs_a_single_request_for_its_directory() -> None:
    archive = _build_zip(FILES)
    fetch = _RecordingFetcher(archive)
    read_remote_entries(fetch, len(archive))
    assert len(fetch.calls) == 1


def test_batches_respect_byte_budget_and_offset_order() -> None:
    entries = [
        ZipEntry(f"f{i}", 8, 0, compressed_size=100, uncompressed_size=100, local_header_offset=o)
        for i, o in enumerate([400, 0, 200, 600])
    ]
    batches = plan_contiguous_batches(entries, max_batch_bytes=350)
    assert [[e.local_header_offset for e in b] for b in batches] == [[0, 200], [400, 600]]


def test_crc_mismatch_is_detected() -> None:
    archive = _build_zip({"FOLDER/a.jpg": b"leaf" * 100})
    fetch = _RecordingFetcher(archive)
    entry = next(e for e in read_remote_entries(fetch, len(archive)) if not e.is_dir)
    corrupted = ZipEntry(
        entry.name,
        entry.method,
        entry.crc32 ^ 1,
        entry.compressed_size,
        entry.uncompressed_size,
        entry.local_header_offset,
    )
    with pytest.raises(RemoteZipError, match="CRC-32"):
        extract_entry(archive, 0, corrupted)


def test_missing_eocd_raises() -> None:
    with pytest.raises(RemoteZipError, match="End Of Central Directory"):
        read_remote_entries(_RecordingFetcher(b"not a zip" * 10), 90)
