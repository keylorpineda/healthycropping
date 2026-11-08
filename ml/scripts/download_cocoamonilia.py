"""Download and verify the CocoaMoniliaDataSet cacao pod dataset (Zenodo record 17156051)."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from healthycropping_ml.download import (
    DEFAULT_TIMEOUT,
    USER_AGENT,
    DatasetDownloadError,
    FileSpec,
    download_files_concurrently,
    extract_archive_safe,
    format_manual_instructions,
)

ZENODO_RECORD_ID = "17156051"
COCOAMONILIA_DOI_URL = f"https://doi.org/10.5281/zenodo.{ZENODO_RECORD_ID}"
ZENODO_API_URL = f"https://zenodo.org/api/records/{ZENODO_RECORD_ID}"
DEFAULT_TARGET_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "cocoamonilia"


@dataclass(frozen=True)
class ZenodoDatasetMetadata:
    """Parsed metadata from the Zenodo public API."""

    record_id: str
    title: str
    doi: str
    license_id: str
    files: tuple[FileSpec, ...]


def fetch_zenodo_metadata(
    record_id: str = ZENODO_RECORD_ID,
    timeout: httpx.Timeout = DEFAULT_TIMEOUT,
) -> ZenodoDatasetMetadata:
    """Fetch and parse dataset metadata and file URLs from the Zenodo API."""
    url = f"https://zenodo.org/api/records/{record_id}"
    with httpx.Client(
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as client:
        resp = client.get(url)
        resp.raise_for_status()
        data = resp.json()

    metadata = data.get("metadata", {})
    license_obj = metadata.get("license", {})
    license_id = license_obj.get("id", "").lower() if isinstance(license_obj, dict) else ""
    if license_id != "cc-by-4.0":
        raise DatasetDownloadError(
            f"Expected CC BY 4.0 license for CocoaMoniliaDataSet, got '{license_id}'"
        )

    files_list = data.get("files", [])
    specs: list[FileSpec] = []
    for f in files_list:
        fname = str(f.get("key", ""))
        self_url = str(f.get("links", {}).get("self", ""))
        size = int(f.get("size", 0))
        checksum = str(f.get("checksum", ""))
        # Zenodo provides checksums like "md5:..."
        specs.append(
            FileSpec(
                filename=fname,
                url=self_url,
                sha256=checksum,
                size_bytes=size,
            )
        )

    return ZenodoDatasetMetadata(
        record_id=str(record_id),
        title=str(metadata.get("title", "CocoaMoniliaDataSet")),
        doi=str(data.get("doi", COCOAMONILIA_DOI_URL)),
        license_id=license_id,
        files=tuple(specs),
    )


def validate_cocoamonilia_dir(target_dir: Path) -> dict[str, Any]:
    """Validate that the extracted CocoaMonilia directory contains valid pod images."""
    images_dir = target_dir / "CocoaMoniliaDataSet" / "cocoapods_images"
    if not images_dir.is_dir():
        # Check alternative folder structures
        alt = target_dir / "cocoapods_images"
        if alt.is_dir():
            images_dir = alt
        else:
            return {"valid": False, "reason": f"Images directory not found at {images_dir}"}

    classes = ["h0", "m1", "m2", "m3"]
    counts: dict[str, int] = {}
    for c in classes:
        cls_dir = images_dir / c
        if not cls_dir.is_dir():
            return {"valid": False, "reason": f"Class directory missing: {cls_dir}"}
        jpgs = list(cls_dir.glob("*.jpg")) + list(cls_dir.glob("*.jpeg"))
        counts[c] = len(jpgs)

    total = sum(counts.values())
    if total == 0:
        return {"valid": False, "reason": "No images found in class directories"}

    return {
        "valid": True,
        "images_dir": str(images_dir),
        "counts": counts,
        "total_images": total,
    }


def main() -> int:
    """CLI entrypoint for downloading and verifying CocoaMoniliaDataSet."""
    parser = argparse.ArgumentParser(
        description="Download and verify CocoaMoniliaDataSet (Zenodo 17156051)"
    )
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=DEFAULT_TARGET_DIR,
        help="Target directory for raw dataset",
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Print manual download instructions instead of downloading",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate existing directory without downloading",
    )
    args = parser.parse_args()

    target_dir: Path = args.target_dir

    if args.validate_only:
        val = validate_cocoamonilia_dir(target_dir)
        print(f"Validation result: {val}")
        return 0 if val["valid"] else 1

    try:
        metadata = fetch_zenodo_metadata()
    except Exception as exc:
        print(f"Could not reach Zenodo API: {exc}", file=sys.stderr)
        metadata = None

    if args.manual or metadata is None:
        instructions = format_manual_instructions(
            dataset_name="CocoaMoniliaDataSet",
            doi_url=COCOAMONILIA_DOI_URL,
            target_dir=target_dir,
            steps=[
                f"1. Navigate to Zenodo record: {COCOAMONILIA_DOI_URL}",
                (
                    "2. Download CocoaMoniliaDataSet.zip and annotation files "
                    "(train.txt, val.txt, test.txt)."
                ),
                f"3. Place and extract CocoaMoniliaDataSet.zip into {target_dir}.",
                (
                    f"4. Verify that {target_dir}/CocoaMoniliaDataSet/cocoapods_images "
                    "contains h0, m1, m2, m3."
                ),
            ],
        )
        print(instructions)
        return 0

    print(f"Verified Zenodo record: {metadata.title} (License: {metadata.license_id})")
    print(f"Files to download: {len(metadata.files)}")
    target_dir.mkdir(parents=True, exist_ok=True)

    # Download files
    download_files_concurrently(list(metadata.files), target_dir)

    # Extract zip if present
    zip_path = target_dir / "CocoaMoniliaDataSet.zip"
    if zip_path.is_file():
        print(f"Extracting {zip_path.name}...")
        extract_archive_safe(zip_path, target_dir)

    val = validate_cocoamonilia_dir(target_dir)
    print(f"Dataset validation: {val}")
    return 0 if val["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
