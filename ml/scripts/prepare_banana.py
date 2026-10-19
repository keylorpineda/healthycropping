"""Prepare the unified banana leaf disease dataset from BananaLSD and NM-AIST imagery."""

from __future__ import annotations

import argparse
import csv
import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from healthycropping_ml.config import CropConfig, load_crop_config
from healthycropping_ml.dedup import HashedItem, compute_phash_hex, deduplicate_hashed_items
from healthycropping_ml.preprocess import CandidateSample, load_clean_sample_image
from healthycropping_ml.report import (
    compute_manifest_summary,
    format_banana_report_markdown,
    render_class_sample_grid,
)
from healthycropping_ml.split import assign_grouped_stratified_splits, verify_no_group_leakage

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "ml" / "configs" / "banana.yaml"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "ml" / "data" / "processed" / "banana"
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "data_reports" / "banana.md"
DEFAULT_GRID_PATH = REPO_ROOT / "docs" / "assets" / "data_reports" / "banana_grid.png"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ORIGINAL_SET_DIR = "originalset"
AUGMENTED_SET_DIR = "augmentedset"
TRAILING_NUMBER = re.compile(r"(\d+)$")


@dataclass(frozen=True)
class PreparedSample:
    """A validated, resized, and hashed sample ready for deduplication and splitting."""

    candidate: CandidateSample
    image: Image.Image
    phash_hex: str


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def collect_bananalsd_candidates(
    raw_dir: Path,
    source_cfg: dict[str, Any],
) -> tuple[list[CandidateSample], int]:
    """Collect BananaLSD `OriginalSet` images whose class folder maps to the taxonomy.

    `AugmentedSet` images are synthetic copies of `OriginalSet` photos and are never used.
    """
    label_map = {str(k).lower(): v for k, v in dict(source_cfg.get("label_map", {})).items()}
    candidates: list[CandidateSample] = []
    skipped_unmapped = 0

    for img_path in sorted(raw_dir.rglob("*")):
        if not img_path.is_file() or img_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        parts = [p.lower() for p in img_path.relative_to(raw_dir).parts]
        if AUGMENTED_SET_DIR in parts or ORIGINAL_SET_DIR not in parts:
            continue
        folder = img_path.parent.name.lower()
        if folder not in label_map:
            skipped_unmapped += 1
            continue
        mapped = label_map[folder]
        sample_id = f"lsd_{_slug(folder)}_{_slug(img_path.stem)}"
        candidates.append(
            CandidateSample(
                raw_path=img_path,
                label=str(mapped["label"]),
                severity=str(mapped["severity"]),
                source="bananalsd",
                group_id=sample_id,
                sample_id=sample_id,
            )
        )
    return candidates, skipped_unmapped


def nmaist_group_id(label: str, stem: str, block_size: int) -> str:
    """Group sequentially numbered captures (e.g. `BS_1298`) into blocks of `block_size`."""
    match = TRAILING_NUMBER.search(stem)
    if match is None or block_size <= 1:
        return f"nmaist_{label}_{_slug(stem)}"
    return f"nmaist_{label}_b{int(match.group(1)) // block_size}"


def collect_nmaist_candidates(
    raw_dir: Path,
    source_cfg: dict[str, Any],
) -> tuple[list[CandidateSample], int]:
    """Collect NM-AIST images stored as `<raw_dir>/<label>/<file>` by the downloader."""
    label_map = {str(k).lower(): v for k, v in dict(source_cfg.get("label_map", {})).items()}
    block_size = int(source_cfg.get("group_block_size", 1))
    candidates: list[CandidateSample] = []
    skipped_unmapped = 0

    for img_path in sorted(raw_dir.rglob("*")):
        if not img_path.is_file() or img_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        folder = img_path.parent.name.lower()
        if folder not in label_map:
            skipped_unmapped += 1
            continue
        mapped = label_map[folder]
        label = str(mapped["label"])
        candidates.append(
            CandidateSample(
                raw_path=img_path,
                label=label,
                severity=str(mapped["severity"]),
                source="nmaist",
                group_id=nmaist_group_id(label, img_path.stem, block_size),
                sample_id=f"nmaist_{_slug(img_path.stem)}",
            )
        )
    return candidates, skipped_unmapped


def _prepare_candidate(
    cand: CandidateSample, image_size: int, hash_size: int
) -> PreparedSample | None:
    img = load_clean_sample_image(cand, image_size=image_size)
    if img is None:
        return None
    return PreparedSample(candidate=cand, image=img, phash_hex=compute_phash_hex(img, hash_size))


def prepare_banana_dataset(
    config: CropConfig,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    bananalsd_dir: Path | None = None,
    nmaist_dir: Path | None = None,
    max_workers: int = 8,
) -> dict[str, Any]:
    """Run banana preparation: collection, resizing, pHash deduplication, and grouped split."""
    lsd_cfg = config.sources.get("bananalsd", {})
    nm_cfg = config.sources.get("nmaist", {})
    lsd_root = bananalsd_dir or (REPO_ROOT / str(lsd_cfg.get("raw_dir", "ml/data/raw/bananalsd")))
    nm_root = nmaist_dir or (REPO_ROOT / str(nm_cfg.get("raw_dir", "ml/data/raw/banana_nmaist")))

    lsd_candidates, lsd_unmapped = (
        collect_bananalsd_candidates(lsd_root, lsd_cfg) if lsd_root.is_dir() else ([], 0)
    )
    nm_candidates, nm_unmapped = (
        collect_nmaist_candidates(nm_root, nm_cfg) if nm_root.is_dir() else ([], 0)
    )
    all_candidates = lsd_candidates + nm_candidates

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        results = list(
            pool.map(
                lambda c: _prepare_candidate(c, config.image_size, config.phash_hash_size),
                all_candidates,
            )
        )
    valid = [r for r in results if r is not None]
    corrupt_or_missing = len(results) - len(valid)

    kept, dropped = deduplicate_hashed_items(
        [
            HashedItem(
                item=s,
                phash_hex=s.phash_hex,
                source=s.candidate.source,
                group_id=s.candidate.group_id,
            )
            for s in valid
        ],
        max_hamming_distance=config.phash_max_distance,
    )

    split_records = assign_grouped_stratified_splits(
        [(h.item, h.item.candidate.label, h.item.candidate.group_id) for h in kept],
        train_ratio=config.split.train,
        val_ratio=config.split.val,
        test_ratio=config.split.test,
        seed=config.seed,
    )
    verify_no_group_leakage(split_records)

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_rows: list[dict[str, str]] = []
    for rec in split_records:
        prep: PreparedSample = rec.item
        cand = prep.candidate
        split_folder = output_dir / rec.split / cand.label
        split_folder.mkdir(parents=True, exist_ok=True)
        out_filename = f"{cand.sample_id}.jpg"
        prep.image.save(split_folder / out_filename, format="JPEG", quality=95)
        manifest_rows.append(
            {
                "path": f"{rec.split}/{cand.label}/{out_filename}",
                "label": cand.label,
                "severity": cand.severity,
                "source": cand.source,
                "group_id": cand.group_id,
                "split": rec.split,
            }
        )

    manifest_csv = output_dir / "manifest.csv"
    with manifest_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["path", "label", "severity", "source", "group_id", "split"]
        )
        writer.writeheader()
        writer.writerows(manifest_rows)

    stats: dict[str, Any] = {
        "crop": config.crop,
        "total_candidates": len(all_candidates),
        "candidates_by_source": {
            "bananalsd": len(lsd_candidates),
            "nmaist": len(nm_candidates),
        },
        "skipped_unmapped": lsd_unmapped + nm_unmapped,
        "corrupt_or_missing_dropped": corrupt_or_missing,
        "duplicates_removed_total": len(dropped),
        "final_images_count": len(split_records),
        "distinct_groups": len({r.group_id for r in split_records}),
        "phash_max_distance": config.phash_max_distance,
        "nmaist_group_block_size": int(nm_cfg.get("group_block_size", 1)),
    }
    (output_dir / "prep_stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    return {"manifest_csv": manifest_csv, "stats": stats, "split_records_count": len(split_records)}


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for banana dataset preparation."""
    parser = argparse.ArgumentParser(description="Prepare banana dataset with pHash dedup")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--bananalsd-dir", type=Path, default=None)
    parser.add_argument("--nmaist-dir", type=Path, default=None)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--grid", type=Path, default=DEFAULT_GRID_PATH)
    args = parser.parse_args(argv)

    cfg = load_crop_config(args.config)
    result = prepare_banana_dataset(
        cfg,
        output_dir=args.output_dir,
        bananalsd_dir=args.bananalsd_dir,
        nmaist_dir=args.nmaist_dir,
    )
    manifest_csv: Path = result["manifest_csv"]
    summary = compute_manifest_summary(
        manifest_csv, tuple(cfg.classes), min_train_samples=cfg.min_train_images_per_class
    )
    args.grid.parent.mkdir(parents=True, exist_ok=True)
    render_class_sample_grid(manifest_csv, args.output_dir, args.grid, tuple(cfg.classes))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        format_banana_report_markdown(summary, result["stats"]), encoding="utf-8"
    )
    print(f"Banana preparation complete! Manifest: {manifest_csv}")
    print(f"Report: {args.report}")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
