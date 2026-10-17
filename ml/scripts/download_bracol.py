"""Download and verify the BRACOL Arabica coffee dataset (Mendeley Data yy2k5y8mxg v1)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from healthycrop_ml.download import (
    DatasetDownloadError,
    FileSpec,
    download_file_verified,
    extract_archive_safe,
    fetch_mendeley_metadata,
    format_manual_instructions,
    validate_dataset_dir,
    write_checksum_manifest,
)

BRACOL_DATASET_ID = "yy2k5y8mxg"
BRACOL_DOI_URL = "https://doi.org/10.17632/yy2k5y8mxg.1"
BRACOL_ARCHIVE_NAME = "BRACOL_coffee_leaf_ images_datasets.zip"
BRACOL_EXPECTED_SHA256 = "25a2fc973137f92caa6700b95e645a0eceeb041c3cfc1eaba853f3e1b5fdfc1f"
BRACOL_FALLBACK_URL = (
    "https://data.mendeley.com/public-files/datasets/yy2k5y8mxg/files/"
    "c16b08ee-3ca6-4bf0-8f4e-4285a53a4a24/file_downloaded"
)
BRACOL_REQUIRED_FILES = ("coffee-datasets/coffee-datasets/leaf/dataset.csv",)
BRACOL_MIN_IMAGES = 1400
DEFAULT_TARGET_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "bracol"


def download_bracol(target_dir: Path = DEFAULT_TARGET_DIR, verify_only: bool = False) -> int:
    """Download, checksum-verify, extract, and validate the BRACOL dataset."""
    target_dir.mkdir(parents=True, exist_ok=True)
    extract_marker = target_dir / ".extracted_ok"

    if verify_only:
        count = validate_dataset_dir(
            target_dir,
            required_files=BRACOL_REQUIRED_FILES,
            min_image_count=BRACOL_MIN_IMAGES,
        )
        print(f"[BRACOL] Verified {count} whole-leaf images in {target_dir}")
        return count

    try:
        metadata = fetch_mendeley_metadata(BRACOL_DATASET_ID)
        print(
            f"[BRACOL] License verified: {metadata.license_short_name} "
            f"({metadata.license_url}) | DOI: {metadata.doi}"
        )
        write_checksum_manifest(target_dir, metadata)
        archive_spec = next(
            (f for f in metadata.files if f.filename == BRACOL_ARCHIVE_NAME),
            FileSpec(
                filename=BRACOL_ARCHIVE_NAME,
                url=BRACOL_FALLBACK_URL,
                sha256=BRACOL_EXPECTED_SHA256,
            ),
        )
        if archive_spec.sha256 != BRACOL_EXPECTED_SHA256:
            raise DatasetDownloadError(
                f"Unexpected upstream SHA-256 for {BRACOL_ARCHIVE_NAME}: {archive_spec.sha256}"
            )

        print(f"[BRACOL] Downloading/verifying archive {archive_spec.filename}...")
        archive_path = download_file_verified(archive_spec, target_dir)

        if not extract_marker.is_file():
            print(f"[BRACOL] Extracting {archive_path.name} into {target_dir}...")
            extract_archive_safe(archive_path, target_dir)
            extract_marker.write_text(archive_spec.sha256 + "\n", encoding="utf-8")

        count = validate_dataset_dir(
            target_dir,
            required_files=BRACOL_REQUIRED_FILES,
            min_image_count=BRACOL_MIN_IMAGES,
        )
        print(f"[BRACOL] Ready: {count} whole-leaf images verified in {target_dir}")
        return count
    except DatasetDownloadError as exc:
        manual = format_manual_instructions(
            dataset_name="BRACOL (Arabica Coffee Leaf Dataset)",
            doi_url=BRACOL_DOI_URL,
            target_dir=target_dir,
            steps=[
                f"Open {BRACOL_DOI_URL} in your browser.",
                f"Download '{BRACOL_ARCHIVE_NAME}' (SHA-256: {BRACOL_EXPECTED_SHA256}).",
                f"Place the zip in '{target_dir}' and extract its contents there.",
            ],
        )
        print(f"[BRACOL] ERROR: {exc}\n{manual}", file=sys.stderr)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download and verify the BRACOL coffee dataset.")
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=DEFAULT_TARGET_DIR,
        help="Target directory for raw BRACOL files (default: ml/data/raw/bracol).",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Validate an existing local folder structure without downloading.",
    )
    args = parser.parse_args(argv)
    try:
        download_bracol(target_dir=args.target_dir, verify_only=args.verify_only)
        return 0
    except DatasetDownloadError:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
