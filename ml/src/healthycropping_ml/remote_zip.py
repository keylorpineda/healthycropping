"""Selective extraction of entries from large remote ZIP archives via HTTP Range requests.

Reads only the End Of Central Directory record and the Central Directory, then fetches
contiguous batches of entries, so a handful of requests yields hundreds of images from a
multi-gigabyte archive without downloading it.
"""

from __future__ import annotations

import struct
import zlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass

RangeFetcher = Callable[[int, int], bytes]
"""Returns the bytes in the inclusive range `[start, end]` of the remote file."""

EOCD_MAGIC = b"PK\x05\x06"
ZIP64_EOCD_LOCATOR_MAGIC = b"PK\x06\x07"
ZIP64_EOCD_MAGIC = b"PK\x06\x06"
CENTRAL_HEADER_MAGIC = b"PK\x01\x02"
LOCAL_HEADER_MAGIC = b"PK\x03\x04"
LOCAL_HEADER_SIZE = 30
CENTRAL_HEADER_SIZE = 46
EOCD_SEARCH_BYTES = 65_536 + 22
ZIP64_EXTRA_ID = 0x0001
UINT32_MAX = 0xFFFFFFFF
METHOD_STORED = 0
METHOD_DEFLATED = 8


class RemoteZipError(RuntimeError):
    """Raised when a remote ZIP structure is malformed or an entry fails verification."""


@dataclass(frozen=True)
class ZipEntry:
    """A file entry parsed from the ZIP Central Directory."""

    name: str
    method: int
    crc32: int
    compressed_size: int
    uncompressed_size: int
    local_header_offset: int

    @property
    def is_dir(self) -> bool:
        return self.name.endswith("/")


def _parse_zip64_extra(
    extra: bytes,
    uncompressed: int,
    compressed: int,
    offset: int,
) -> tuple[int, int, int]:
    """Replace 0xFFFFFFFF placeholders with ZIP64 extra-field values."""
    pos = 0
    while pos + 4 <= len(extra):
        header_id, size = struct.unpack_from("<HH", extra, pos)
        body = extra[pos + 4 : pos + 4 + size]
        pos += 4 + size
        if header_id != ZIP64_EXTRA_ID:
            continue
        cursor = 0
        if uncompressed == UINT32_MAX:
            (uncompressed,) = struct.unpack_from("<Q", body, cursor)
            cursor += 8
        if compressed == UINT32_MAX:
            (compressed,) = struct.unpack_from("<Q", body, cursor)
            cursor += 8
        if offset == UINT32_MAX:
            (offset,) = struct.unpack_from("<Q", body, cursor)
        break
    return uncompressed, compressed, offset


def parse_central_directory(data: bytes) -> list[ZipEntry]:
    """Parse all Central Directory file headers in `data`."""
    entries: list[ZipEntry] = []
    pos = 0
    while pos + CENTRAL_HEADER_SIZE <= len(data):
        if data[pos : pos + 4] != CENTRAL_HEADER_MAGIC:
            break
        (method,) = struct.unpack_from("<H", data, pos + 10)
        crc, compressed, uncompressed = struct.unpack_from("<III", data, pos + 16)
        name_len, extra_len, comment_len = struct.unpack_from("<HHH", data, pos + 28)
        (offset,) = struct.unpack_from("<I", data, pos + 42)
        name_start = pos + CENTRAL_HEADER_SIZE
        name = data[name_start : name_start + name_len].decode("utf-8", errors="replace")
        extra = data[name_start + name_len : name_start + name_len + extra_len]
        uncompressed, compressed, offset = _parse_zip64_extra(
            extra, uncompressed, compressed, offset
        )
        entries.append(
            ZipEntry(
                name=name,
                method=method,
                crc32=crc,
                compressed_size=compressed,
                uncompressed_size=uncompressed,
                local_header_offset=offset,
            )
        )
        pos = name_start + name_len + extra_len + comment_len
    return entries


def locate_central_directory(tail: bytes, tail_start: int) -> tuple[int, int]:
    """Return `(offset, size)` of the Central Directory from the archive tail bytes."""
    eocd = tail.rfind(EOCD_MAGIC)
    if eocd < 0:
        raise RemoteZipError("End Of Central Directory record not found")
    cd_size, cd_offset = struct.unpack_from("<II", tail, eocd + 12)

    locator = tail.rfind(ZIP64_EOCD_LOCATOR_MAGIC, 0, eocd)
    if locator >= 0 and (cd_offset == UINT32_MAX or cd_size == UINT32_MAX):
        (zip64_eocd_offset,) = struct.unpack_from("<Q", tail, locator + 8)
        rel = zip64_eocd_offset - tail_start
        if rel < 0 or tail[rel : rel + 4] != ZIP64_EOCD_MAGIC:
            raise RemoteZipError("ZIP64 End Of Central Directory record not found in tail")
        cd_size, cd_offset = struct.unpack_from("<QQ", tail, rel + 40)
    return cd_offset, cd_size


def read_remote_entries(fetch: RangeFetcher, total_size: int) -> list[ZipEntry]:
    """Read the Central Directory of a remote archive with two range requests."""
    tail_start = max(0, total_size - EOCD_SEARCH_BYTES)
    tail = fetch(tail_start, total_size - 1)
    cd_offset, cd_size = locate_central_directory(tail, tail_start)
    if cd_offset >= tail_start:
        rel = cd_offset - tail_start
        directory = tail[rel : rel + cd_size]
    else:
        directory = fetch(cd_offset, cd_offset + cd_size - 1)
    return parse_central_directory(directory)


def plan_contiguous_batches(
    entries: Sequence[ZipEntry],
    max_batch_bytes: int,
) -> list[list[ZipEntry]]:
    """Group entries (sorted by offset) into batches whose spans stay under `max_batch_bytes`.

    Consecutive entries are only batched together when no other archive entry lies between
    them, so each batch maps to a single contiguous byte range.
    """
    ordered = sorted(entries, key=lambda e: e.local_header_offset)
    batches: list[list[ZipEntry]] = []
    current: list[ZipEntry] = []
    for entry in ordered:
        if current:
            span = (
                entry.local_header_offset + entry.compressed_size - (current[0].local_header_offset)
            )
            if span > max_batch_bytes:
                batches.append(current)
                current = []
        current.append(entry)
    if current:
        batches.append(current)
    return batches


def batch_byte_range(batch: Sequence[ZipEntry], slack: int = 1024) -> tuple[int, int]:
    """Inclusive byte range covering every entry of a batch, with room for local headers."""
    start = batch[0].local_header_offset
    last = batch[-1]
    end = last.local_header_offset + LOCAL_HEADER_SIZE + slack + last.compressed_size
    return start, end


def extract_entry(blob: bytes, blob_start: int, entry: ZipEntry) -> bytes:
    """Decompress and CRC-verify `entry` from a blob that starts at archive offset `blob_start`."""
    pos = entry.local_header_offset - blob_start
    if pos < 0 or blob[pos : pos + 4] != LOCAL_HEADER_MAGIC:
        raise RemoteZipError(f"Local file header not found for '{entry.name}'")
    name_len, extra_len = struct.unpack_from("<HH", blob, pos + 26)
    data_start = pos + LOCAL_HEADER_SIZE + name_len + extra_len
    raw = blob[data_start : data_start + entry.compressed_size]
    if len(raw) != entry.compressed_size:
        raise RemoteZipError(f"Truncated data for '{entry.name}'")

    if entry.method == METHOD_STORED:
        payload = raw
    elif entry.method == METHOD_DEFLATED:
        payload = zlib.decompressobj(-zlib.MAX_WBITS).decompress(raw)
    else:
        raise RemoteZipError(f"Unsupported compression method {entry.method} for '{entry.name}'")

    if zlib.crc32(payload) & UINT32_MAX != entry.crc32:
        raise RemoteZipError(f"CRC-32 mismatch for '{entry.name}'")
    return payload
