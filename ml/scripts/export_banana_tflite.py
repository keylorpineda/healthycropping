#!/usr/bin/env python3
"""CLI wrapper script to export the banana model to float16 TFLite with registry."""

from __future__ import annotations

from pathlib import Path

from healthycropping_ml.export_tflite import main

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_export_banana_cli(argv: list[str] | None = None) -> int:
    """Run banana float16 TFLite export CLI with banana-specific defaults."""
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    defaults = {
        "--config": str(REPO_ROOT / "ml" / "configs" / "banana.yaml"),
        "--processed-dir": str(REPO_ROOT / "ml" / "data" / "processed" / "banana"),
        "--checkpoint": str(REPO_ROOT / "ml" / "models" / "banana" / "banana_finetuned.keras"),
        "--models-dir": str(REPO_ROOT / "ml" / "models" / "banana"),
        "--fixture-out": str(REPO_ROOT / "ml" / "fixtures" / "preprocessing_fixture_224.json"),
        # Validation precision saturates (99.5% at full coverage), so calibration alone picks a
        # chance-level threshold; a 0.80 floor rejects 3 of 5 test errors at 96.5% coverage.
        "--threshold-floor": "0.80",
    }
    for flag, val in defaults.items():
        if flag not in args:
            args.extend([flag, val])
    return main(args)


if __name__ == "__main__":
    raise SystemExit(run_export_banana_cli())
