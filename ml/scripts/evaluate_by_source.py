"""Evaluate a trained crop checkpoint per data source to detect source shortcuts."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

from healthycropping_ml.config import load_crop_config
from healthycropping_ml.evaluate import breakdown_by_group
from healthycropping_ml.export_tflite import build_inference_model
from healthycropping_ml.train import load_split_arrays

REPO_ROOT = Path(__file__).resolve().parents[2]


def read_split_sources(manifest_csv: Path, split: str) -> dict[str, str]:
    """Map each manifest `path` of `split` to its `source`."""
    with manifest_csv.open(encoding="utf-8", newline="") as handle:
        return {
            row["path"]: row["source"] for row in csv.DictReader(handle) if row["split"] == split
        }


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: print per-source accuracy and recall for a split."""
    parser = argparse.ArgumentParser(description="Per-source evaluation of a crop checkpoint")
    parser.add_argument("--config", type=Path, default=REPO_ROOT / "ml/configs/banana.yaml")
    parser.add_argument(
        "--processed-dir", type=Path, default=REPO_ROOT / "ml/data/processed/banana"
    )
    parser.add_argument(
        "--checkpoint", type=Path, default=REPO_ROOT / "ml/models/banana/banana_finetuned.keras"
    )
    parser.add_argument("--split", default="test")
    parser.add_argument("--out", type=Path, default=None, help="Optional JSON output path")
    args = parser.parse_args(argv)

    import keras

    cfg = load_crop_config(args.config)
    manifest_csv = args.processed_dir / "manifest.csv"
    dataset = load_split_arrays(
        manifest_csv, args.processed_dir, args.split, cfg.classes, cfg.mean, cfg.std
    )
    sources = read_split_sources(manifest_csv, args.split)
    model = build_inference_model(keras.models.load_model(args.checkpoint, compile=False))
    probs = np.asarray(model.predict(dataset.x, verbose=0), dtype=np.float32)
    y_pred = np.argmax(probs, axis=-1).astype(np.int32)

    breakdown = breakdown_by_group(
        dataset.y, y_pred, [sources[p] for p in dataset.paths], cfg.classes
    )
    print(json.dumps(breakdown, indent=2))
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(breakdown, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
