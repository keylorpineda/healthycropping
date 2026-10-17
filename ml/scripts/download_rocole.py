"""Download and verify the RoCoLe Robusta coffee dataset (Mendeley Data c5yvn32dzg v2)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from healthycrop_ml.download import (
    DatasetDownloadError,
    FileSpec,
    MendeleyDatasetMetadata,
    download_files_concurrently,
    fetch_mendeley_metadata,
    format_manual_instructions,
    validate_dataset_dir,
    write_checksum_manifest,
)

ROCOLE_DATASET_ID = "c5yvn32dzg"
ROCOLE_DOI_URL = "https://doi.org/10.17632/c5yvn32dzg.2"
ROCOLE_EXPECTED_JPG_COUNT = 1560
ROCOLE_ANNOTATION_SHA256: dict[str, str] = {
    "RoCoLe-classes.xlsx": "0040a57ffd441bd69ead997309d14c8d7f6fdfc83c5dbdc47805e0bc4da05ef2",
    "RoCoLE-coco.json": "beac06144c2865cd0ceb2ef3f81791334cf1674400184ff1aa123d1e67f7ec4f",
    "RoCoLE-csv.csv": "a9aa6b411569dba7e9ba56fed79e5cd82af04a0ef092e56309158d632ac5205b",
    "RoCoLE-json.json": "286b73725b7c027a6bc9a1118a281b026e1ec9e35c3510398ed6bbc0e579cf99",
}
DEFAULT_TARGET_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "rocole"


def build_rocole_download_plan(metadata: MendeleyDatasetMetadata) -> list[FileSpec]:
    """Build the list of annotation files and 1,560 leaf images to download and verify."""
    plan: list[FileSpec] = []
    for f in metadata.files:
        if f.filename in ROCOLE_ANNOTATION_SHA256:
            expected = ROCOLE_ANNOTATION_SHA256[f.filename]
            if f.sha256 != expected:
                raise DatasetDownloadError(
                    f"Unexpected SHA-256 for {f.filename}: expected {expected}, got {f.sha256}"
                )
            plan.append(
                FileSpec(
                    filename=f.filename,
                    url=f.url,
                    sha256=f.sha256,
                    size_bytes=f.size_bytes,
                    relative_subdir="Annotations",
                )
            )
        elif f.filename.lower().endswith(".jpg"):
            plan.append(
                FileSpec(
                    filename=f.filename,
                    url=f.url,
                    sha256=f.sha256,
                    size_bytes=f.size_bytes,
                    relative_subdir="Photos",
                )
            )
    return plan


def download_rocole(
    target_dir: Path = DEFAULT_TARGET_DIR,
    verify_only: bool = False,
    max_workers: int = 12,
) -> int:
    """Download, checksum-verify, and validate the RoCoLe dataset."""
    target_dir.mkdir(parents=True, exist_ok=True)
    required_files = tuple(f"Annotations/{name}" for name in ROCOLE_ANNOTATION_SHA256)

    if verify_only:
        count = validate_dataset_dir(
            target_dir,
            required_files=required_files,
            min_image_count=ROCOLE_EXPECTED_JPG_COUNT,
        )
        print(f"[RoCoLe] Verified {count} images and annotations in {target_dir}")
        return count

    try:
        metadata = fetch_mendeley_metadata(ROCOLE_DATASET_ID)
        print(
            f"[RoCoLe] License verified: {metadata.license_short_name} "
            f"({metadata.license_url}) | DOI: {metadata.doi}"
        )
        write_checksum_manifest(target_dir, metadata)
        plan = build_rocole_download_plan(metadata)
        jpg_specs = [s for s in plan if s.relative_subdir == "Photos"]
        if len(jpg_specs) < ROCOLE_EXPECTED_JPG_COUNT:
            raise DatasetDownloadError(
                f"Expected {ROCOLE_EXPECTED_JPG_COUNT} JPG entries in RoCoLe API, "
                f"got {len(jpg_specs)}."
            )

        print(f"[RoCoLe] Downloading and SHA-256 verifying {len(plan)} files...")
        download_files_concurrently(plan, target_dir=target_dir, max_workers=max_workers)

        count = validate_dataset_dir(
            target_dir,
            required_files=required_files,
            min_image_count=ROCOLE_EXPECTED_JPG_COUNT,
        )
        print(f"[RoCoLe] Ready: {count} images and annotations verified in {target_dir}")
        return count
    except DatasetDownloadError as exc:
        manual = format_manual_instructions(
            dataset_name="RoCoLe (Robusta Coffee Leaf Dataset v2)",
            doi_url=ROCOLE_DOI_URL,
            target_dir=target_dir,
            steps=[
                f"Open {ROCOLE_DOI_URL} in your browser.",
                f"Download the 'Photos' folder (1,560 .jpg files) into '{target_dir / 'Photos'}'.",
                (
                    "Download 'RoCoLe-classes.xlsx', 'RoCoLE-csv.csv', 'RoCoLE-json.json', and "
                    f"'RoCoLE-coco.json' into '{target_dir / 'Annotations'}'."
                ),
            ],
        )
        print(f"[RoCoLe] ERROR: {exc}\n{manual}", file=sys.stderr)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download and verify the RoCoLe coffee dataset.")
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=DEFAULT_TARGET_DIR,
        help="Target directory for raw RoCoLe files (default: ml/data/raw/rocole).",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Validate an existing local folder structure without downloading.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=12,
        help="Number of concurrent download workers (default: 12).",
    )
    args = parser.parse_args(argv)
    try:
        download_rocole(
            target_dir=args.target_dir,
            verify_only=args.verify_only,
            max_workers=args.workers,
        )
        return 0
    except DatasetDownloadError:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
