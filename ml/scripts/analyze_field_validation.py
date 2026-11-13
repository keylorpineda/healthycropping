"""Summarise the Costa Rican field validation CSV as Markdown tables.

Usage:
    uv run python scripts/analyze_field_validation.py --csv path/to/results.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from healthycropping_ml.field_validation import (
    FieldValidationError,
    load_crop_models,
    read_samples,
    render_markdown,
    summarize,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: validate the CSV, print the summary, optionally write it to a file."""
    parser = argparse.ArgumentParser(description="Summarise field validation results")
    parser.add_argument("--csv", type=Path, required=True, help="Results CSV (see the template)")
    parser.add_argument(
        "--registries-dir",
        type=Path,
        default=REPO_ROOT / "ml/models",
        help="Folder with <crop>/registry.json (labels and confidence thresholds)",
    )
    parser.add_argument("--out", type=Path, default=None, help="Optional Markdown output path")
    args = parser.parse_args(argv)

    try:
        models = load_crop_models(args.registries_dir)
        samples = read_samples(args.csv, models)
    except FieldValidationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    markdown = render_markdown(summarize(samples, models))
    print(markdown, end="")
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(markdown, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
