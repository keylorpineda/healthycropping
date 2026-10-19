"""Download a subset of the NM-AIST Banana Leaves Imagery dataset (Zenodo record 7670326).

The record holds nine 2-7 GB ZIP archives. Instead of downloading them, this script reads
each archive's Central Directory with HTTP Range requests and fetches contiguous batches of
entries, extracting up to `max_images` CRC-verified images per archive configured in
`ml/configs/banana.yaml`. Zenodo rate-limits clients, so requests are throttled and HTTP 429
responses are retried after `Retry-After`.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote

import httpx

from healthycropping_ml.config import load_crop_config
from healthycropping_ml.download import DEFAULT_TIMEOUT, USER_AGENT, verify_license_allowed
from healthycropping_ml.remote_zip import (
    RangeFetcher,
    ZipEntry,
    batch_byte_range,
    extract_entry,
    plan_contiguous_batches,
    read_remote_entries,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "ml" / "configs" / "banana.yaml"
DEFAULT_TARGET_DIR = REPO_ROOT / "ml" / "data" / "raw" / "banana_nmaist"
NMAIST_DOI_URL = "https://doi.org/10.5281/zenodo.7670326"
NMAIST_LICENSE = "CC BY 4.0"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_BATCH_BYTES = 48 * 1024 * 1024
MIN_REQUEST_INTERVAL_S = 0.5
MAX_RETRIES = 5


def archive_url(record_id: str, archive_name: str) -> str:
    """Zenodo content URL for a file of a record."""
    return f"https://zenodo.org/api/records/{record_id}/files/{quote(archive_name)}/content"


def select_image_entries(entries: list[ZipEntry], max_images: int) -> list[ZipEntry]:
    """Pick the first `max_images` image entries in archive order, skipping macOS metadata."""
    images = [
        e
        for e in sorted(entries, key=lambda e: e.local_header_offset)
        if not e.is_dir
        and not e.name.startswith("__MACOSX/")
        and not PurePosixPath(e.name).name.startswith("._")
        and PurePosixPath(e.name).suffix.lower() in IMAGE_EXTENSIONS
    ]
    return images[:max_images]


def make_range_fetcher(client: httpx.Client, url: str) -> RangeFetcher:
    """Build a throttled, retrying HTTP Range fetcher for `url`."""
    last_request = [0.0]

    def fetch(start: int, end: int) -> bytes:
        for attempt in range(1, MAX_RETRIES + 1):
            wait = MIN_REQUEST_INTERVAL_S - (time.monotonic() - last_request[0])
            if wait > 0:
                time.sleep(wait)
            last_request[0] = time.monotonic()
            try:
                resp = client.get(url, headers={"Range": f"bytes={start}-{end}"})
            except httpx.TransportError:
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(2.0 * attempt)
                continue
            if resp.status_code == 429:
                time.sleep(float(resp.headers.get("Retry-After", "60")))
                continue
            resp.raise_for_status()
            if resp.status_code != 206:
                raise RuntimeError(f"Server ignored the Range header for {url}")
            return resp.content
        raise RuntimeError(f"Exceeded {MAX_RETRIES} retries for range {start}-{end} of {url}")

    return fetch


def download_archive_subset(
    fetch: RangeFetcher,
    archive: dict[str, Any],
    target_dir: Path,
) -> dict[str, int]:
    """Extract up to `archive['max_images']` images of one archive into `target_dir/<label>/`."""
    label = str(archive["label"])
    out_dir = target_dir / label
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = read_remote_entries(fetch, int(archive["size_bytes"]))
    selected = select_image_entries(entries, int(archive["max_images"]))
    pending = [
        e
        for e in selected
        if not (
            (out_dir / PurePosixPath(e.name).name).is_file()
            and (out_dir / PurePosixPath(e.name).name).stat().st_size == e.uncompressed_size
        )
    ]

    for batch in plan_contiguous_batches(pending, MAX_BATCH_BYTES):
        start, end = batch_byte_range(batch)
        blob = fetch(start, min(end, int(archive["size_bytes"]) - 1))
        for entry in batch:
            payload = extract_entry(blob, start, entry)
            (out_dir / PurePosixPath(entry.name).name).write_bytes(payload)

    return {"selected": len(selected), "downloaded": len(pending)}


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for the NM-AIST banana subset download."""
    parser = argparse.ArgumentParser(description="Download NM-AIST banana leaf images subset")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--target-dir", type=Path, default=DEFAULT_TARGET_DIR)
    args = parser.parse_args(argv)

    cfg = load_crop_config(args.config)
    source = cfg.sources["nmaist"]
    record_id = str(source["zenodo_record"])
    verify_license_allowed(NMAIST_LICENSE)
    print(f"NM-AIST Banana Leaves Imagery ({NMAIST_DOI_URL}, {NMAIST_LICENSE})")

    with httpx.Client(
        timeout=DEFAULT_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as client:
        for archive in source["archives"]:
            fetch = make_range_fetcher(client, archive_url(record_id, str(archive["name"])))
            stats = download_archive_subset(fetch, archive, args.target_dir)
            print(f"  {archive['name']}: {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
