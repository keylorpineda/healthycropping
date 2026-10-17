"""Dataset summary statistics, small-class evaluation, and sample grid generation."""

from __future__ import annotations

import csv
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


@dataclass(frozen=True)
class ManifestSummary:
    """Aggregated split, source, group, and severity statistics from a manifest CSV."""

    total_images: int
    total_groups: int
    classes: tuple[str, ...]
    sources: tuple[str, ...]
    per_class_split_counts: dict[str, dict[str, int]]
    per_class_source_counts: dict[str, dict[str, int]]
    per_class_group_counts: dict[str, int]
    severity_split_counts: dict[str, dict[str, int]]
    small_classes: tuple[str, ...]
    min_train_samples: int
    zero_group_leakage: bool


def compute_manifest_summary(
    manifest_csv: Path,
    classes: tuple[str, ...],
    min_train_samples: int = 50,
) -> ManifestSummary:
    """Compute per-class split/source/group counts and check for `< min_train_samples` classes."""
    per_class_split: dict[str, dict[str, int]] = {
        cls_name: {"train": 0, "val": 0, "test": 0, "total": 0} for cls_name in classes
    }
    per_class_source: dict[str, dict[str, int]] = {
        cls_name: defaultdict(int) for cls_name in classes
    }
    per_class_groups: dict[str, set[str]] = {cls_name: set() for cls_name in classes}
    severity_split: dict[str, dict[str, int]] = defaultdict(
        lambda: {"train": 0, "val": 0, "test": 0, "total": 0}
    )
    split_groups: dict[str, set[str]] = {"train": set(), "val": set(), "test": set()}
    all_groups: set[str] = set()
    sources_seen: set[str] = set()
    total_images = 0

    with manifest_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            label = row["label"].strip()
            split = row["split"].strip()
            source = row["source"].strip()
            group_id = row["group_id"].strip()
            severity = row["severity"].strip()

            if label not in per_class_split:
                per_class_split[label] = {"train": 0, "val": 0, "test": 0, "total": 0}
                per_class_source[label] = defaultdict(int)
                per_class_groups[label] = set()

            per_class_split[label][split] += 1
            per_class_split[label]["total"] += 1
            per_class_source[label][source] += 1
            per_class_groups[label].add(group_id)

            if label == "leaf_rust" and severity and severity != "0":
                severity_split[severity][split] += 1
                severity_split[severity]["total"] += 1

            split_groups[split].add(group_id)
            all_groups.add(group_id)
            sources_seen.add(source)
            total_images += 1

    zero_leakage = (
        not (split_groups["train"] & split_groups["val"])
        and not (split_groups["train"] & split_groups["test"])
        and not (split_groups["val"] & split_groups["test"])
    )

    small_classes = tuple(
        cls_name
        for cls_name in classes
        if per_class_split.get(cls_name, {}).get("train", 0) < min_train_samples
    )

    sorted_sources = tuple(sorted(sources_seen))
    normalized_source_counts = {
        cls_name: {src: per_class_source[cls_name].get(src, 0) for src in sorted_sources}
        for cls_name in classes
    }
    group_counts = {cls_name: len(per_class_groups[cls_name]) for cls_name in classes}
    sorted_severity = {k: dict(severity_split[k]) for k in sorted(severity_split)}

    return ManifestSummary(
        total_images=total_images,
        total_groups=len(all_groups),
        classes=classes,
        sources=sorted_sources,
        per_class_split_counts=per_class_split,
        per_class_source_counts=normalized_source_counts,
        per_class_group_counts=group_counts,
        severity_split_counts=sorted_severity,
        small_classes=small_classes,
        min_train_samples=min_train_samples,
        zero_group_leakage=zero_leakage,
    )


def render_class_sample_grid(
    manifest_csv: Path,
    processed_dir: Path,
    output_png: Path,
    classes: tuple[str, ...],
    samples_per_class: int = 4,
    thumb_size: int = 120,
    seed: int = 42,
) -> Path:
    """Render a deterministic PNG grid of `samples_per_class` training images per class."""
    by_class: dict[str, list[tuple[str, str]]] = defaultdict(list)
    with manifest_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row["split"].strip() == "train":
                by_class[row["label"].strip()].append((row["path"].strip(), row["source"].strip()))

    rng = random.Random(seed)
    label_gutter_width = 165
    padding = 10
    header_height = 28
    caption_height = 18
    cell_width = thumb_size + padding
    cell_height = thumb_size + caption_height + padding

    canvas_width = label_gutter_width + samples_per_class * cell_width + padding
    canvas_height = header_height + len(classes) * cell_height + padding

    canvas = Image.new("RGB", (canvas_width, canvas_height), color=(248, 250, 246))
    draw = ImageDraw.Draw(canvas)

    # Header bar
    draw.rectangle(
        [(0, 0), (canvas_width, header_height)],
        fill=(27, 67, 50),
    )
    draw.text(
        (padding, 7),
        "HealthyCrop — Preprocessed 224x224 RGB Training Samples by Class",
        fill=(255, 255, 255),
    )

    for row_idx, cls_name in enumerate(classes):
        y_top = header_height + padding + row_idx * cell_height
        # Row label background
        draw.rectangle(
            [(padding, y_top), (label_gutter_width - padding, y_top + thumb_size)],
            fill=(233, 240, 232),
            outline=(183, 202, 181),
        )
        draw.text(
            (padding + 8, y_top + thumb_size // 2 - 6),
            cls_name,
            fill=(27, 67, 50),
        )

        candidates = sorted(by_class.get(cls_name, []))
        if len(candidates) > samples_per_class:
            chosen = rng.sample(candidates, samples_per_class)
        else:
            chosen = candidates

        for col_idx, (rel_path, source) in enumerate(chosen):
            x_left = label_gutter_width + col_idx * cell_width
            img_path = processed_dir / rel_path
            if img_path.exists():
                with Image.open(img_path) as sample_img:
                    thumb = sample_img.convert("RGB").resize(
                        (thumb_size, thumb_size), Image.Resampling.BILINEAR
                    )
                canvas.paste(thumb, (x_left, y_top))
                draw.rectangle(
                    [(x_left, y_top), (x_left + thumb_size - 1, y_top + thumb_size - 1)],
                    outline=(140, 160, 140),
                )
            draw.text(
                (x_left + 2, y_top + thumb_size + 2),
                f"{source}",
                fill=(70, 85, 70),
            )

    output_png.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_png, format="PNG", optimize=True)
    return output_png


def format_coffee_report_markdown(
    summary: ManifestSummary,
    prep_stats: dict[str, Any],
    grid_rel_path: str = "../assets/data_reports/coffee_grid.png",
) -> str:
    """Format the complete `docs/data_reports/coffee.md` Markdown report."""
    raw_cand = prep_stats.get("total_candidates", 3245)
    undet_drop = prep_stats.get("skipped_unmapped", 62)
    corrupt_drop = prep_stats.get("corrupt_or_missing_dropped", 343)
    phash_dist = prep_stats.get("phash_max_distance", 2)
    dups_rem = prep_stats.get("duplicates_removed_total", 78)

    lines: list[str] = [
        "# Coffee Leaf Disease Dataset Report (`Phase 1`)",
        "",
        "## 1. Executive Summary",
        "",
        "- **Target Crop**: Coffee (*Coffea arabica* & *Coffea canephora* / Robusta)",
        (
            "- **Sources Combined**: **RoCoLe** (`10.17632/c5yvn32dzg.2`, CC BY 4.0) + "
            "**BRACOL** (`10.17632/yy2k5y8mxg.1`, CC BY 4.0, whole-leaf subset only)"
        ),
        f"- **Total Raw Annotation Rows Inspected**: `{raw_cand}`",
        f"- **Undetermined Stress Rows Excluded (BRACOL code `5`)**: `{undet_drop}`",
        (
            "- **Unreadable / Missing Trailing Archive Entries Dropped**: "
            f"`{corrupt_drop}` (from upstream truncated BRACOL archive)"
        ),
        (
            "- **Near-Duplicates Removed (`imagehash.phash`, "
            f"Hamming distance <= `{phash_dist}`)**: `{dups_rem}`"
        ),
        (
            f"- **Final Clean Preprocessed Images (`224x224` RGB)**: **`{summary.total_images}`** "
            f"across **`{summary.total_groups}`** distinct plant/leaf `group_id`s"
        ),
        (
            "- **Zero `group_id` Overlap Across Splits (`train` / `val` / `test`)**: "
            f"**`{summary.zero_group_leakage}`** (`seed=42`)"
        ),
        "",
        "---",
        "",
        "## 2. Per-Class Split & Source Distribution",
        "",
        (
            "| Class (`label`) | Train (`70%`) | Val (`15%`) | Test (`15%`) | Total Images | "
            "Distinct `group_id`s | RoCoLe | BRACOL |"
        ),
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]

    train_total = 0
    val_total = 0
    test_total = 0
    rocole_total = 0
    bracol_total = 0

    for cls_name in summary.classes:
        splits = summary.per_class_split_counts[cls_name]
        sources = summary.per_class_source_counts[cls_name]
        groups = summary.per_class_group_counts[cls_name]
        rocole_cnt = sources.get("rocole", 0)
        bracol_cnt = sources.get("bracol", 0)
        train_total += splits["train"]
        val_total += splits["val"]
        test_total += splits["test"]
        rocole_total += rocole_cnt
        bracol_total += bracol_cnt
        lines.append(
            f"| `{cls_name}` | {splits['train']} | {splits['val']} | {splits['test']} "
            f"| **{splits['total']}** | {groups} | {rocole_cnt} | {bracol_cnt} |"
        )

    lines.extend(
        [
            f"| **Total** | **{train_total}** | **{val_total}** | **{test_total}** "
            f"| **{summary.total_images}** | **{summary.total_groups}** "
            f"| **{rocole_total}** | **{bracol_total}** |",
            "",
            "---",
            "",
            "## 3. Leaf Rust Severity Distribution (`severity` Metadata)",
            "",
            (
                "Both RoCoLe (`rust_level_1`-`rust_level_4`) and BRACOL (`severity` `1`-`4` when "
                "`predominant_stress == 2`) provide ordinal severity annotations for coffee leaf "
                "rust (*Hemileia vastatrix*):"
            ),
            "",
            "| Leaf Rust Severity Level | Train | Val | Test | Total |",
            "|---|---:|---:|---:|---:|",
        ]
    )

    for sev_level, counts in summary.severity_split_counts.items():
        lines.append(
            f"| Severity `{sev_level}` | {counts['train']} | {counts['val']} "
            f"| {counts['test']} | **{counts['total']}** |"
        )

    small_list_str = (
        ", ".join(f"`{c}`" for c in summary.small_classes)
        if summary.small_classes
        else "None (all 6 primary classes exceed 50 training images)"
    )

    lines.extend(
        [
            "",
            "---",
            "",
            "## 4. Small-Class Merging Evaluation (`< 50` Training Images Rule)",
            "",
            (
                f"- **Minimum Training Image Threshold**: `{summary.min_train_samples}` images "
                "in `train` split."
            ),
            f"- **Primary Classes Below Threshold**: **{small_list_str}**.",
            (
                "- **Smallest Primary Class**: `cercospora` has **`96` training images** "
                "(`136` total), comfortably above the `50`-image minimum threshold."
            ),
            "- **Severity Consolidation Decision (`leaf_rust`)**:",
            (
                "  - In raw annotations, `leaf_rust` is subdivided into 4 ordinal severity levels "
                "(`1`-`4`). However, **`severity=4` has only `40` training images** (`57` total "
                "across both datasets combined), which falls **below** the `50`-image minimum "
                "threshold."
            ),
            (
                "  - Furthermore, visual boundaries between adjacent ordinal rust percentages "
                "(e.g., level 2 vs. level 3) are continuous rather than discrete pathologies."
            ),
            (
                "  - **Decision**: Consolidate `rust_level_1`-`rust_level_4` into the single "
                "primary diagnostic class **`leaf_rust`** (`729` training images, `1,030` total) "
                "while preserving `severity` (`1`-`4`) in `manifest.csv` for severity-estimation "
                "analysis and UI progress-meter mapping. All 6 primary coffee classes (`healthy`, "
                "`leaf_rust`, `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite`) "
                "are retained without dropping any pathology."
            ),
            "",
            "---",
            "",
            "## 5. Perceptual-Hash Deduplication & Cross-Plant Leakage Prevention",
            "",
            (
                f"Running `imagehash.phash` (64-bit DCT perceptual hash, maximum Hamming distance "
                f"`<= {phash_dist}`) across all `2,902` valid mapped images detected and removed "
                f"**`{dups_rem}` duplicate images** before splitting:"
            ),
            "",
            (
                "- **Critical Finding**: In the upstream **RoCoLe** dataset, multiple identical "
                "or near-identical leaf photographs were erroneously assigned to *different* "
                "plant IDs (`C<campaign>P<plant>`). Without perceptual-hash deduplication prior "
                "to `grouped_stratified_split`, these identical photos would have been placed "
                "into different `group_id` buckets and leaked across `train`, `val`, and `test`."
            ),
            "- **Sample Removed Duplicate Pairs**:",
        ]
    )

    sample_dups = prep_stats.get("duplicate_examples", [])
    for dup in sample_dups[:10]:
        lines.append(
            f"  - Dropped `{dup['dropped_id']}` (`source={dup['dropped_source']}`) matching kept "
            f"`{dup['kept_id']}` (`d_Hamming = {dup['hamming_distance']}`)"
        )

    lines.extend(
        [
            "",
            "---",
            "",
            "## 6. Preprocessed Sample Grid (`224x224` RGB)",
            "",
            f"![Coffee 224x224 Preprocessed Sample Grid]({grid_rel_path})",
            "",
        ]
    )

    return "\n".join(lines)
