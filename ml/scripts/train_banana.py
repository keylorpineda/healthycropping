#!/usr/bin/env python3
"""CLI wrapper script to train and fine-tune the banana MobileNetV3-Large model."""

from __future__ import annotations

from pathlib import Path

from healthycropping_ml.train import main

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_banana_cli(argv: list[str] | None = None) -> int:
    """Run banana training CLI with banana-specific defaults when not overridden."""
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    defaults = {
        "--config": str(REPO_ROOT / "ml" / "configs" / "banana.yaml"),
        "--processed-dir": str(REPO_ROOT / "ml" / "data" / "processed" / "banana"),
        "--run-id": "banana-v0.1.0-baseline",
        "--checkpoint-out": str(REPO_ROOT / "ml" / "models" / "banana" / "banana_baseline.keras"),
        "--confusion-out": str(
            REPO_ROOT / "docs" / "assets" / "confusion_matrices" / "banana_baseline.png"
        ),
        "--metrics-out": str(
            REPO_ROOT / "ml" / "data" / "processed" / "banana" / "baseline_metrics.json"
        ),
    }
    for flag, val in defaults.items():
        if flag not in args:
            args.extend([flag, val])
    return main(args)


if __name__ == "__main__":
    raise SystemExit(run_banana_cli())
