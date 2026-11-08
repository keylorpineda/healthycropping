#!/usr/bin/env python3
"""CLI wrapper script to train and fine-tune the cacao MobileNetV3-Large model."""

from __future__ import annotations

from pathlib import Path

from healthycropping_ml.train import main

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_cacao_cli(argv: list[str] | None = None) -> int:
    """Run cacao training CLI with cacao-specific defaults when not overridden."""
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    defaults = {
        "--config": str(REPO_ROOT / "ml" / "configs" / "cacao.yaml"),
        "--processed-dir": str(REPO_ROOT / "ml" / "data" / "processed" / "cacao"),
        "--run-id": "cacao-v0.1.0-baseline",
        "--checkpoint-out": str(REPO_ROOT / "ml" / "models" / "cacao" / "cacao_baseline.keras"),
        "--confusion-out": str(
            REPO_ROOT / "docs" / "assets" / "confusion_matrices" / "cacao_baseline.png"
        ),
        "--metrics-out": str(
            REPO_ROOT / "ml" / "data" / "processed" / "cacao" / "baseline_metrics.json"
        ),
    }
    for flag, val in defaults.items():
        if flag not in args:
            args.extend([flag, val])
    return main(args)


if __name__ == "__main__":
    raise SystemExit(run_cacao_cli())
