"""Unit tests for dataset reporting, small-class evaluation, and sample grid rendering."""

from __future__ import annotations

import csv
from pathlib import Path

from PIL import Image

from healthycrop_ml.report import (
    compute_manifest_summary,
    format_coffee_report_markdown,
    render_class_sample_grid,
)


def test_compute_manifest_summary_and_grid(tmp_path: Path) -> None:
    """Verify summary counts, `< 50` small-class flag, leakage check, and PNG grid generation."""
    processed_dir = tmp_path / "processed" / "coffee"
    manifest_csv = processed_dir / "manifest.csv"
    classes = ("healthy", "leaf_rust", "rare_spot")

    rows: list[dict[str, str]] = []
    # Create 55 train images for healthy, 52 for leaf_rust, and 10 for rare_spot (< 50)
    for idx in range(55):
        rel = f"train/healthy/h_{idx:03d}.jpg"
        img_path = processed_dir / rel
        img_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (224, 224), color=(20, 140, 40)).save(img_path)
        rows.append(
            {
                "path": rel,
                "label": "healthy",
                "severity": "",
                "source": "rocole",
                "group_id": f"rocole:P{idx}",
                "split": "train",
            }
        )
    for idx in range(52):
        rel = f"train/leaf_rust/r_{idx:03d}.jpg"
        img_path = processed_dir / rel
        img_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (224, 224), color=(180, 120, 30)).save(img_path)
        rows.append(
            {
                "path": rel,
                "label": "leaf_rust",
                "severity": "2",
                "source": "bracol",
                "group_id": f"bracol:L{idx}",
                "split": "train",
            }
        )
    for idx in range(10):
        rel = f"train/rare_spot/s_{idx:03d}.jpg"
        img_path = processed_dir / rel
        img_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (224, 224), color=(120, 40, 40)).save(img_path)
        rows.append(
            {
                "path": rel,
                "label": "rare_spot",
                "severity": "",
                "source": "bracol",
                "group_id": f"bracol:S{idx}",
                "split": "train",
            }
        )

    with manifest_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["path", "label", "severity", "source", "group_id", "split"],
        )
        writer.writeheader()
        writer.writerows(rows)

    summary = compute_manifest_summary(
        manifest_csv=manifest_csv,
        classes=classes,
        min_train_samples=50,
    )
    assert summary.total_images == 117
    assert summary.zero_group_leakage is True
    assert summary.small_classes == ("rare_spot",)
    assert summary.severity_split_counts["2"]["train"] == 52

    grid_png = tmp_path / "coffee_grid.png"
    render_class_sample_grid(
        manifest_csv=manifest_csv,
        processed_dir=processed_dir,
        output_png=grid_png,
        classes=classes,
        samples_per_class=3,
        seed=42,
    )
    assert grid_png.exists()
    with Image.open(grid_png) as grid_img:
        assert grid_img.width > 200
        assert grid_img.height > 200

    md = format_coffee_report_markdown(
        summary=summary,
        prep_stats={"total_raw_candidates": 120, "duplicates_removed": 3},
    )
    assert "`rare_spot`" in md
    assert "Severity `2`" in md
