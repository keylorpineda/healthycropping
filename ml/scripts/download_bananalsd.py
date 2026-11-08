"""Download and verify the BananaLSD banana leaf spot dataset (Mendeley Data 9tb7k297ff)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from healthycropping_ml.download import (
    FileSpec,
    download_file_verified,
    extract_archive_safe,
    format_manual_instructions,
    verify_license_allowed,
)

DATASET_ID = "9tb7k297ff"
BANANALSD_DOI_URL = "https://doi.org/10.17632/9tb7k297ff.1"
BANANALSD_LICENSE = "CC BY 4.0"
ARCHIVE_SPEC = FileSpec(
    filename="BananaLSD.zip",
    url=f"https://data.mendeley.com/public-api/zip/{DATASET_ID}/download/1",
    sha256="md5:4d55d992086ca5f335904a736b682c36",
    size_bytes=54_468_587,
)
ORIGINAL_SET_DIR = "OriginalSet"
DEFAULT_TARGET_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "bananalsd"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def find_original_set(target_dir: Path) -> Path | None:
    """Locate the `OriginalSet` directory (the pre-augmented `AugmentedSet` is never used)."""
    for candidate in sorted(target_dir.rglob(ORIGINAL_SET_DIR)):
        if candidate.is_dir():
            return candidate
    return None


def validate_bananalsd_dir(target_dir: Path) -> dict[str, Any]:
    """Validate the extracted BananaLSD layout and count images per `OriginalSet` class."""
    original = find_original_set(target_dir)
    if original is None:
        return {"valid": False, "reason": f"'{ORIGINAL_SET_DIR}' not found under {target_dir}"}

    counts: dict[str, int] = {}
    for class_dir in sorted(p for p in original.iterdir() if p.is_dir()):
        counts[class_dir.name] = sum(
            1 for p in class_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        )
    total = sum(counts.values())
    if total == 0:
        return {"valid": False, "reason": f"No images found in {original}"}
    return {"valid": True, "original_set": str(original), "counts": counts, "total_images": total}


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for downloading and verifying BananaLSD."""
    parser = argparse.ArgumentParser(description="Download and verify BananaLSD (Mendeley)")
    parser.add_argument("--target-dir", type=Path, default=DEFAULT_TARGET_DIR)
    parser.add_argument("--manual", action="store_true", help="Print manual instructions")
    parser.add_argument("--validate-only", action="store_true", help="Only validate the layout")
    args = parser.parse_args(argv)
    target_dir: Path = args.target_dir

    if args.manual:
        print(
            format_manual_instructions(
                dataset_name="BananaLSD",
                doi_url=BANANALSD_DOI_URL,
                target_dir=target_dir,
                steps=[
                    f"Open {BANANALSD_DOI_URL} and click 'Download All'.",
                    f"Save the archive as {target_dir / ARCHIVE_SPEC.filename}.",
                    "Re-run this script to verify the MD5 checksum and extract it.",
                ],
            )
        )
        return 0

    if not args.validate_only:
        verify_license_allowed(BANANALSD_LICENSE)
        archive = download_file_verified(ARCHIVE_SPEC, target_dir)
        print(f"Verified {archive.name} ({BANANALSD_LICENSE}); extracting...")
        extract_archive_safe(archive, target_dir)

    result = validate_bananalsd_dir(target_dir)
    print(f"Validation result: {result}")
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
