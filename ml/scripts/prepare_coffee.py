"""Prepare the unified coffee leaf dataset from RoCoLe and BRACOL."""

from __future__ import annotations

import argparse
import csv
import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from healthycrop_ml.config import CropConfig, load_crop_config
from healthycrop_ml.dedup import HashedItem, compute_phash_hex, deduplicate_hashed_items
from healthycrop_ml.preprocess import CandidateSample, load_clean_rgb_image
from healthycrop_ml.split import assign_grouped_stratified_splits, verify_no_group_leakage

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "ml" / "configs" / "coffee.yaml"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "ml" / "data" / "processed" / "coffee"


@dataclass(frozen=True)
class PreparedSample:
    """A validated, resized, and hashed sample ready for deduplication and splitting."""

    candidate: CandidateSample
    phash_hex: str


def collect_rocole_candidates(
    raw_dir: Path,
    source_cfg: dict[str, Any],
) -> tuple[list[CandidateSample], int]:
    """Parse RoCoLe annotations and return `(candidates, skipped_unmapped)`."""
    xlsx_path = raw_dir / str(source_cfg["annotations_xlsx"])
    photos_dir = raw_dir / str(source_cfg["photos_dir"])
    group_regex = re.compile(str(source_cfg["group_id_regex"]))
    label_map: dict[str, dict[str, str]] = dict(source_cfg["label_map"])

    df = pd.read_excel(xlsx_path)
    candidates: list[CandidateSample] = []
    skipped_unmapped = 0

    for _, row in df.iterrows():
        filename = str(row["File"]).strip()
        raw_label = str(row["Multiclass.Label"]).strip()
        if raw_label not in label_map:
            skipped_unmapped += 1
            continue
        mapped = label_map[raw_label]
        match = group_regex.match(filename)
        plant_key = match.group(1) if match else Path(filename).stem
        group_id = f"rocole_{plant_key}"
        sample_id = f"rocole_{Path(filename).stem}"
        candidates.append(
            CandidateSample(
                raw_path=photos_dir / filename,
                label=str(mapped["label"]),
                severity=str(mapped["severity"]),
                source="rocole",
                group_id=group_id,
                sample_id=sample_id,
            )
        )
    return candidates, skipped_unmapped


def collect_bracol_candidates(
    raw_dir: Path,
    source_cfg: dict[str, Any],
) -> tuple[list[CandidateSample], int]:
    """Parse BRACOL whole-leaf CSV (excluding symptom crops) and return `(candidates, skipped)`."""
    csv_path = raw_dir / str(source_cfg["leaf_csv"])
    images_dir = raw_dir / str(source_cfg["leaf_images_dir"])
    # Ensure we never ingest isolated symptom crops
    if "symptom" in images_dir.parts:
        raise ValueError(f"BRACOL symptom crop path is forbidden: {images_dir}")

    stress_map: dict[int, str] = {
        int(k): str(v) for k, v in dict(source_cfg["predominant_stress_map"]).items()
    }
    df = pd.read_csv(csv_path)
    candidates: list[CandidateSample] = []
    skipped_unmapped = 0

    for _, row in df.iterrows():
        stress_code = int(row["predominant_stress"])
        if stress_code not in stress_map:
            skipped_unmapped += 1
            continue
        img_id = int(row["id"])
        severity = str(int(row["severity"]))
        label = stress_map[stress_code]
        candidates.append(
            CandidateSample(
                raw_path=images_dir / f"{img_id}.jpg",
                label=label,
                severity=severity,
                source="bracol",
                group_id=f"bracol_leaf_{img_id}",
                sample_id=f"bracol_{img_id}",
            )
        )
    return candidates, skipped_unmapped


def _hash_candidate(
    cand: CandidateSample,
    image_size: int,
    hash_size: int,
) -> PreparedSample | None:
    img = load_clean_rgb_image(cand.raw_path, image_size=image_size)
    if img is None:
        return None
    phash_hex = compute_phash_hex(img, hash_size=hash_size)
    return PreparedSample(candidate=cand, phash_hex=phash_hex)


def prepare_coffee_dataset(
    config: CropConfig,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    rocole_dir: Path | None = None,
    bracol_dir: Path | None = None,
    max_workers: int = 8,
) -> dict[str, Any]:
    """Run the full coffee dataset preparation, deduplication, and 70/15/15 grouped split."""
    roc_cfg = config.sources["rocole"]
    bra_cfg = config.sources["bracol"]
    roc_root = rocole_dir or (REPO_ROOT / str(roc_cfg["raw_dir"]))
    bra_root = bracol_dir or (REPO_ROOT / str(bra_cfg["raw_dir"]))

    roc_candidates, roc_unmapped = collect_rocole_candidates(roc_root, roc_cfg)
    bra_candidates, bra_unmapped = collect_bracol_candidates(bra_root, bra_cfg)
    all_candidates = roc_candidates + bra_candidates

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        hashed_results = list(
            pool.map(
                lambda c: _hash_candidate(c, config.image_size, config.phash_hash_size),
                all_candidates,
            )
        )

    valid_samples: list[PreparedSample] = []
    corrupt_or_missing = 0
    for res in hashed_results:
        if res is None:
            corrupt_or_missing += 1
        else:
            valid_samples.append(res)

    hashed_items = [
        HashedItem(
            item=s,
            phash_hex=s.phash_hex,
            source=s.candidate.source,
            group_id=s.candidate.group_id,
        )
        for s in valid_samples
    ]
    kept_items, dropped_duplicates = deduplicate_hashed_items(
        hashed_items,
        max_hamming_distance=config.phash_max_distance,
    )

    split_inputs = [(h.item, h.item.candidate.label, h.item.candidate.group_id) for h in kept_items]
    split_records = assign_grouped_stratified_splits(
        split_inputs,
        train_ratio=config.split.train,
        val_ratio=config.split.val,
        test_ratio=config.split.test,
        seed=config.seed,
    )
    verify_no_group_leakage(split_records)

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.csv"

    def _save_split_image(rec_idx_and_rec: tuple[int, Any]) -> dict[str, str]:
        _idx, rec = rec_idx_and_rec
        sample: PreparedSample = rec.item
        cand = sample.candidate
        rel_img_path = Path(rec.split) / cand.label / f"{cand.sample_id}.jpg"
        abs_img_path = output_dir / rel_img_path
        abs_img_path.parent.mkdir(parents=True, exist_ok=True)
        img = load_clean_rgb_image(cand.raw_path, image_size=config.image_size)
        if img is None:
            raise RuntimeError(f"Unexpected unreadable image during save: {cand.raw_path}")
        img.save(abs_img_path, format="JPEG", quality=95)
        return {
            "path": rel_img_path.as_posix(),
            "label": cand.label,
            "severity": cand.severity,
            "source": cand.source,
            "group_id": cand.group_id,
            "split": rec.split,
        }

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        manifest_rows = list(pool.map(_save_split_image, enumerate(split_records)))

    manifest_rows.sort(key=lambda r: (r["split"], r["label"], r["path"]))
    with manifest_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["path", "label", "severity", "source", "group_id", "split"],
        )
        writer.writeheader()
        writer.writerows(manifest_rows)

    cross_source_dups = sum(1 for d in dropped_duplicates if d.dropped.source != d.kept.source)
    stats: dict[str, Any] = {
        "crop": config.crop,
        "image_size": config.image_size,
        "seed": config.seed,
        "phash_max_distance": config.phash_max_distance,
        "total_candidates": len(all_candidates),
        "rocole_candidates": len(roc_candidates),
        "bracol_candidates": len(bra_candidates),
        "skipped_unmapped": roc_unmapped + bra_unmapped,
        "corrupt_or_missing_dropped": corrupt_or_missing,
        "valid_before_dedup": len(valid_samples),
        "duplicates_removed_total": len(dropped_duplicates),
        "duplicates_removed_cross_source": cross_source_dups,
        "final_kept_total": len(manifest_rows),
        "duplicate_examples": [
            {
                "dropped_id": d.dropped.item.candidate.sample_id,
                "dropped_source": d.dropped.source,
                "kept_id": d.kept.item.candidate.sample_id,
                "kept_source": d.kept.source,
                "hamming_distance": d.hamming_distance,
            }
            for d in dropped_duplicates[:25]
        ],
    }
    (output_dir / "prep_stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prepare the coffee dataset and manifest.csv.")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to coffee.yaml config.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory for processed coffee images and manifest.csv.",
    )
    parser.add_argument("--workers", type=int, default=8, help="Worker threads.")
    args = parser.parse_args(argv)

    cfg = load_crop_config(args.config)
    stats = prepare_coffee_dataset(cfg, output_dir=args.output_dir, max_workers=args.workers)
    print(f"[prepare_coffee] Completed: {json.dumps(stats, indent=2)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
