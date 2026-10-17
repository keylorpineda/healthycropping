#!/usr/bin/env python3
"""Generate `docs/data_reports/coffee.md` and `docs/assets/data_reports/coffee_grid.png`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from healthycrop_ml.config import load_crop_config
from healthycrop_ml.report import (
    compute_manifest_summary,
    format_coffee_report_markdown,
    render_class_sample_grid,
)


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for generating the coffee dataset report and sample grid."""
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(
        description="Generate coffee dataset report and 224x224 sample grid."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=repo_root / "ml" / "configs" / "coffee.yaml",
        help="Path to coffee YAML config.",
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=repo_root / "ml" / "data" / "processed" / "coffee",
        help="Path to processed coffee directory containing manifest.csv and prep_stats.json.",
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=repo_root / "docs" / "data_reports" / "coffee.md",
        help="Destination path for the Markdown data report.",
    )
    parser.add_argument(
        "--grid-out",
        type=Path,
        default=repo_root / "docs" / "assets" / "data_reports" / "coffee_grid.png",
        help="Destination path for the PNG sample grid.",
    )
    args = parser.parse_args(argv)

    cfg = load_crop_config(args.config)
    manifest_csv = args.processed_dir / "manifest.csv"
    stats_path = args.processed_dir / "prep_stats.json"

    if not manifest_csv.exists():
        print(f"ERROR: Manifest not found at {manifest_csv}", file=sys.stderr)
        return 1

    prep_stats: dict[str, object] = {}
    if stats_path.exists():
        prep_stats = json.loads(stats_path.read_text(encoding="utf-8"))

    summary = compute_manifest_summary(
        manifest_csv=manifest_csv,
        classes=cfg.classes,
        min_train_samples=cfg.min_train_images_per_class,
    )
    render_class_sample_grid(
        manifest_csv=manifest_csv,
        processed_dir=args.processed_dir,
        output_png=args.grid_out,
        classes=cfg.classes,
        samples_per_class=4,
        seed=cfg.seed,
    )
    markdown = format_coffee_report_markdown(
        summary=summary,
        prep_stats=prep_stats,
        grid_rel_path="../assets/data_reports/coffee_grid.png",
    )
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.write_text(markdown, encoding="utf-8")

    print(f"Wrote sample grid to: {args.grid_out}")
    print(f"Wrote coffee data report to: {args.report_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
