"""Download and verify the UNAB Cocoa Diseases YOLOv4 dataset.

Kaggle dataset: serranosebas/enfermedades-cacao-yolov4.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx

from healthycropping_ml.download import (
    DEFAULT_TIMEOUT,
    USER_AGENT,
    extract_archive_safe,
    format_manual_instructions,
)

KAGGLE_DATASET_SLUG = "serranosebas/enfermedades-cacao-yolov4"
KAGGLE_DATASET_URL = f"https://www.kaggle.com/datasets/{KAGGLE_DATASET_SLUG}"
KAGGLE_DOWNLOAD_API_URL = f"https://www.kaggle.com/api/v1/datasets/download/{KAGGLE_DATASET_SLUG}"
DEFAULT_TARGET_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "unab_cacao"


def check_kaggle_credentials() -> bool:
    """Return True if Kaggle API credentials exist in environment or ~/.kaggle/kaggle.json."""
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        return True
    cfg_file = Path.home() / ".kaggle" / "kaggle.json"
    return cfg_file.is_file()


def download_with_kaggle_cli(dataset_slug: str, target_dir: Path) -> bool:
    """Attempt download using the `kaggle` CLI if installed and authenticated."""
    if not shutil.which("kaggle"):
        return False
    target_dir.mkdir(parents=True, exist_ok=True)
    try:
        cmd = [
            "kaggle",
            "datasets",
            "download",
            "-d",
            dataset_slug,
            "-p",
            str(target_dir),
            "--unzip",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"Kaggle download output:\n{result.stdout}")
        return True
    except (subprocess.CalledProcessError, OSError) as exc:
        print(f"Kaggle CLI download failed: {exc}", file=sys.stderr)
        return False


def download_with_kaggle_public_http(dataset_slug: str, target_dir: Path) -> bool:
    """Download public Kaggle dataset archive directly via Kaggle API v1 HTTP stream."""
    url = f"https://www.kaggle.com/api/v1/datasets/download/{dataset_slug}"
    target_dir.mkdir(parents=True, exist_ok=True)
    zip_path = target_dir / "unab_cacao.zip"
    part_path = target_dir / ".unab_cacao.zip.part"
    if zip_path.is_file() and zip_path.stat().st_size > 1_000_000:
        return True
    try:
        with (
            httpx.Client(
                timeout=DEFAULT_TIMEOUT,
                headers={"User-Agent": USER_AGENT},
                follow_redirects=True,
            ) as client,
            client.stream("GET", url) as response,
        ):
            response.raise_for_status()
            with part_path.open("wb") as out_fh:
                for chunk in response.iter_bytes(chunk_size=1024 * 512):
                    out_fh.write(chunk)
        part_path.replace(zip_path)
        return True
    except Exception as exc:
        part_path.unlink(missing_ok=True)
        print(f"Public HTTP Kaggle download failed: {exc}", file=sys.stderr)
        return False


def validate_unab_cacao_dir(target_dir: Path) -> dict[str, Any]:
    """Validate that the directory contains images and corresponding YOLO .txt annotations."""
    if not target_dir.is_dir():
        return {"valid": False, "reason": f"Target directory does not exist: {target_dir}"}

    image_extensions = {".jpg", ".jpeg", ".png"}
    images = [
        p for p in target_dir.rglob("*") if p.is_file() and p.suffix.lower() in image_extensions
    ]
    labels = [
        p
        for p in target_dir.rglob("*.txt")
        if p.is_file() and p.name not in {"classes.txt", "README.txt"}
    ]

    if not images:
        return {"valid": False, "reason": "No image files found (.jpg, .jpeg, .png)"}

    # Count matching pairs
    matched_pairs = 0
    label_stem_map = {lbl.stem: lbl for lbl in labels}
    for img in images:
        if img.stem in label_stem_map:
            matched_pairs += 1

    return {
        "valid": len(images) > 0 and matched_pairs > 0,
        "total_images": len(images),
        "total_labels": len(labels),
        "matched_pairs": matched_pairs,
    }


def main() -> int:
    """CLI entrypoint for downloading and verifying UNAB Cocoa Diseases dataset."""
    parser = argparse.ArgumentParser(
        description="Download and verify UNAB Cocoa Diseases dataset (Kaggle)"
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
        help="Print manual download instructions",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate existing directory without downloading",
    )
    args = parser.parse_args()

    target_dir: Path = args.target_dir

    if args.validate_only:
        val = validate_unab_cacao_dir(target_dir)
        print(f"Validation result: {val}")
        return 0 if val["valid"] else 1

    if args.manual:
        instructions = format_manual_instructions(
            dataset_name="UNAB Cocoa Diseases (YOLOv4)",
            doi_url=KAGGLE_DATASET_URL,
            target_dir=target_dir,
            steps=[
                f"1. Navigate to the Kaggle dataset: {KAGGLE_DATASET_URL}",
                (
                    "2. Click 'Download' (ODbL v1.0 license, Juan Felipe Heredia Gómez & "
                    "Sebastian Serrano)."
                ),
                f"3. Extract the downloaded zip file into {target_dir}.",
                f"4. Verify that {target_dir} contains the images and .txt YOLO label files.",
            ],
        )
        print(instructions)
        return 0

    if target_dir.is_dir():
        val = validate_unab_cacao_dir(target_dir)
        if val["valid"]:
            print(f"Existing dataset is already valid: {val}")
            return 0

    has_credentials = check_kaggle_credentials()
    success = False
    if has_credentials:
        print(f"Attempting download via Kaggle CLI for '{KAGGLE_DATASET_SLUG}'...")
        success = download_with_kaggle_cli(KAGGLE_DATASET_SLUG, target_dir)

    if not success:
        print(f"Downloading '{KAGGLE_DATASET_SLUG}' via Kaggle public API v1...")
        success = download_with_kaggle_public_http(KAGGLE_DATASET_SLUG, target_dir)

    if not success:
        instructions = format_manual_instructions(
            dataset_name="UNAB Cocoa Diseases (YOLOv4)",
            doi_url=KAGGLE_DATASET_URL,
            target_dir=target_dir,
            steps=[
                f"1. Navigate to the Kaggle dataset: {KAGGLE_DATASET_URL}",
                (
                    "2. Click 'Download' (ODbL v1.0 license, Juan Felipe Heredia Gómez & "
                    "Sebastian Serrano)."
                ),
                f"3. Extract the downloaded zip file into {target_dir}.",
                f"4. Verify that {target_dir} contains the images and .txt YOLO label files.",
            ],
        )
        print(instructions)
        return 1

    # Check for any remaining zip archives to extract
    for zf in target_dir.glob("*.zip"):
        print(f"Extracting {zf.name}...")
        extract_archive_safe(zf, target_dir)

    val = validate_unab_cacao_dir(target_dir)
    print(f"Dataset validation: {val}")
    return 0 if val["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
