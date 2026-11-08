"""Prepare the unified cacao pod disease dataset from CocoaMoniliaDataSet and UNAB."""

from __future__ import annotations

import argparse
import csv
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from healthycropping_ml.config import CropConfig, load_crop_config
from healthycropping_ml.dedup import HashedItem, compute_phash_hex, deduplicate_hashed_items
from healthycropping_ml.preprocess import (
    CandidateSample,
    load_clean_sample_image,
    parse_yolo_line,
)
from healthycropping_ml.report import (
    compute_manifest_summary,
    format_cacao_report_markdown,
    render_class_sample_grid,
)
from healthycropping_ml.split import assign_grouped_stratified_splits, verify_no_group_leakage

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "ml" / "configs" / "cacao.yaml"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "ml" / "data" / "processed" / "cacao"
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "data_reports" / "cacao.md"
DEFAULT_GRID_PATH = REPO_ROOT / "docs" / "assets" / "data_reports" / "cacao_grid.png"


@dataclass(frozen=True)
class PreparedSample:
    """A validated, preprocessed, and hashed sample ready for deduplication and splitting."""

    candidate: CandidateSample
    phash_hex: str


def collect_cocoamonilia_candidates(
    raw_dir: Path,
    source_cfg: dict[str, Any],
) -> tuple[list[CandidateSample], int]:
    """Collect candidate pod images from CocoaMoniliaDataSet directory."""
    photos_subdir = str(source_cfg.get("photos_dir", "CocoaMoniliaDataSet/cocoapods_images"))
    photos_dir = raw_dir / photos_subdir
    if not photos_dir.is_dir():
        alt = raw_dir / "cocoapods_images"
        photos_dir = alt if alt.is_dir() else raw_dir

    label_map = dict(source_cfg.get("label_map", {}))
    candidates: list[CandidateSample] = []
    skipped_unmapped = 0

    image_exts = {".jpg", ".jpeg", ".png"}
    for img_path in photos_dir.rglob("*"):
        if not img_path.is_file() or img_path.suffix.lower() not in image_exts:
            continue
        folder_name = img_path.parent.name.lower()
        if folder_name not in label_map:
            skipped_unmapped += 1
            continue
        mapped = label_map[folder_name]
        label = str(mapped["label"])
        severity = str(mapped["severity"])
        stem = img_path.stem
        candidates.append(
            CandidateSample(
                raw_path=img_path,
                label=label,
                severity=severity,
                source="cocoamonilia",
                group_id=f"cocoa_{stem}",
                sample_id=f"cocoa_{stem}",
                bbox=None,
            )
        )

    return candidates, skipped_unmapped


def collect_unab_candidates(
    raw_dir: Path,
    source_cfg: dict[str, Any],
) -> tuple[list[CandidateSample], int]:
    """Collect YOLO-annotated pod crops from UNAB dataset, grouped by parent photograph."""
    label_map = dict(source_cfg.get("label_map", {}))
    candidates: list[CandidateSample] = []
    skipped_unmapped = 0

    image_exts = {".jpg", ".jpeg", ".png"}
    images = [p for p in raw_dir.rglob("*") if p.is_file() and p.suffix.lower() in image_exts]

    excluded_names = {
        "classes.txt",
        "README.txt",
        "train.txt",
        "val.txt",
        "test.txt",
    }
    label_files = {
        p.stem: p for p in raw_dir.rglob("*.txt") if p.is_file() and p.name not in excluded_names
    }

    for img_path in images:
        parent_group_id = f"unab_{img_path.stem}"
        lbl_file = label_files.get(img_path.stem)
        if lbl_file is None:
            # Check if image is in a labeled subfolder
            folder = img_path.parent.name.lower()
            if folder in label_map:
                mapped = label_map[folder]
                candidates.append(
                    CandidateSample(
                        raw_path=img_path,
                        label=str(mapped["label"]),
                        severity=str(mapped["severity"]),
                        source="unab",
                        group_id=parent_group_id,
                        sample_id=f"unab_{img_path.stem}",
                        bbox=None,
                    )
                )
            else:
                skipped_unmapped += 1
            continue

        try:
            lines = lbl_file.read_text(encoding="utf-8").strip().splitlines()
        except OSError:
            skipped_unmapped += 1
            continue

        box_idx = 0
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
            bbox = parse_yolo_line(line_str)
            if bbox is None:
                skipped_unmapped += 1
                continue

            mapped_key: Any = bbox.class_id
            if mapped_key not in label_map and str(mapped_key) in label_map:
                mapped_key = str(mapped_key)

            if mapped_key not in label_map:
                skipped_unmapped += 1
                continue

            mapped = label_map[mapped_key]
            label = str(mapped["label"])
            severity = str(mapped["severity"])
            sample_id = f"unab_{img_path.stem}_b{box_idx}"
            box_idx += 1

            candidates.append(
                CandidateSample(
                    raw_path=img_path,
                    label=label,
                    severity=severity,
                    source="unab",
                    group_id=parent_group_id,
                    sample_id=sample_id,
                    bbox=bbox,
                )
            )

    return candidates, skipped_unmapped


def _hash_cacao_candidate(
    cand: CandidateSample,
    image_size: int,
    hash_size: int,
    box_margin: float,
) -> PreparedSample | None:
    img = load_clean_sample_image(cand, image_size=image_size, box_margin=box_margin)
    if img is None:
        return None
    phash_hex = compute_phash_hex(img, hash_size=hash_size)
    return PreparedSample(candidate=cand, phash_hex=phash_hex)


def prepare_cacao_dataset(
    config: CropConfig,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    cocoamonilia_dir: Path | None = None,
    unab_dir: Path | None = None,
    max_workers: int = 8,
) -> dict[str, Any]:
    """Run full cacao pod dataset preparation, YOLO cropping, deduplication, and split."""
    cocoa_cfg = config.sources.get("cocoamonilia", {})
    unab_cfg = config.sources.get("unab", {})

    default_cocoa_raw = str(cocoa_cfg.get("raw_dir", "ml/data/raw/cocoamonilia"))
    default_unab_raw = str(unab_cfg.get("raw_dir", "ml/data/raw/unab_cacao"))
    cocoa_root = cocoamonilia_dir or (REPO_ROOT / default_cocoa_raw)
    unab_root = unab_dir or (REPO_ROOT / default_unab_raw)

    cocoa_candidates: list[CandidateSample] = []
    cocoa_unmapped = 0
    if cocoa_root.is_dir():
        cocoa_candidates, cocoa_unmapped = collect_cocoamonilia_candidates(cocoa_root, cocoa_cfg)

    unab_candidates: list[CandidateSample] = []
    unab_unmapped = 0
    if unab_root.is_dir():
        unab_candidates, unab_unmapped = collect_unab_candidates(unab_root, unab_cfg)

    all_candidates = cocoa_candidates + unab_candidates
    box_margin = float(unab_cfg.get("box_margin", 0.05))

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        hashed_results = list(
            pool.map(
                lambda c: _hash_cacao_candidate(
                    c, config.image_size, config.phash_hash_size, box_margin
                ),
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
    manifest_rows: list[dict[str, str]] = []

    for rec in split_records:
        prep: PreparedSample = rec.item
        cand = prep.candidate
        split_folder = output_dir / rec.split / cand.label
        split_folder.mkdir(parents=True, exist_ok=True)
        out_filename = f"{cand.sample_id}.jpg"
        out_path = split_folder / out_filename

        img = load_clean_sample_image(cand, image_size=config.image_size, box_margin=box_margin)
        if img is not None:
            img.save(out_path, format="JPEG", quality=95)

        rel_path = f"{rec.split}/{cand.label}/{out_filename}"
        manifest_rows.append(
            {
                "path": rel_path,
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
            handle,
            fieldnames=["path", "label", "severity", "source", "group_id", "split"],
        )
        writer.writeheader()
        writer.writerows(manifest_rows)

    stats: dict[str, Any] = {
        "crop": config.crop,
        "total_candidates": len(all_candidates),
        "skipped_unmapped": cocoa_unmapped + unab_unmapped,
        "corrupt_or_missing_dropped": corrupt_or_missing,
        "duplicates_removed_total": len(dropped_duplicates),
        "final_images_count": len(split_records),
        "phash_max_distance": config.phash_max_distance,
    }
    stats_path = output_dir / "prep_stats.json"
    stats_path.write_text(json.dumps(stats, indent=2), encoding="utf-8")

    return {
        "manifest_csv": manifest_csv,
        "stats": stats,
        "split_records_count": len(split_records),
    }


def main() -> int:
    """CLI entrypoint for cacao dataset preparation."""
    parser = argparse.ArgumentParser(
        description="Prepare cacao dataset with YOLO cropping and pHash dedup"
    )
    parser.add_argument(
        "--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Path to cacao.yaml"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Output directory"
    )
    parser.add_argument(
        "--cocoamonilia-dir", type=Path, default=None, help="Raw CocoaMonilia directory"
    )
    parser.add_argument("--unab-dir", type=Path, default=None, help="Raw UNAB directory")
    parser.add_argument(
        "--report", type=Path, default=DEFAULT_REPORT_PATH, help="Output report markdown"
    )
    parser.add_argument(
        "--grid", type=Path, default=DEFAULT_GRID_PATH, help="Output sample grid PNG"
    )
    args = parser.parse_args()

    cfg = load_crop_config(args.config)
    result = prepare_cacao_dataset(
        cfg,
        output_dir=args.output_dir,
        cocoamonilia_dir=args.cocoamonilia_dir,
        unab_dir=args.unab_dir,
    )
    manifest_csv: Path = result["manifest_csv"]
    stats: dict[str, Any] = result["stats"]

    summary = compute_manifest_summary(
        manifest_csv,
        tuple(cfg.classes),
        min_train_samples=cfg.min_train_images_per_class,
    )

    args.grid.parent.mkdir(parents=True, exist_ok=True)
    render_class_sample_grid(manifest_csv, args.output_dir, args.grid, tuple(cfg.classes))

    report_content = format_cacao_report_markdown(summary, stats)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report_content, encoding="utf-8")
    print(f"Cacao preparation complete! Generated manifest: {manifest_csv}")
    print(f"Report: {args.report}")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
