#!/usr/bin/env python3
"""CLI wrapper script to export the cacao model to float16 TFLite with registry."""

from __future__ import annotations

from pathlib import Path

from healthycropping_ml.export_tflite import main

REPO_ROOT = Path(__file__).resolve().parents[2]


def run_export_cacao_cli(argv: list[str] | None = None) -> int:
    """Run cacao float16 TFLite export CLI with cacao-specific defaults."""
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    defaults = {
        "--config": str(REPO_ROOT / "ml" / "configs" / "cacao.yaml"),
        "--processed-dir": str(REPO_ROOT / "ml" / "data" / "processed" / "cacao"),
        "--checkpoint": str(REPO_ROOT / "ml" / "models" / "cacao" / "cacao_finetuned.keras"),
        "--models-dir": str(REPO_ROOT / "ml" / "models" / "cacao"),
        "--fixture-out": str(REPO_ROOT / "ml" / "fixtures" / "preprocessing_fixture_224.json"),
    }
    for flag, val in defaults.items():
        if flag not in args:
            args.extend([flag, val])
    return main(args)


if __name__ == "__main__":
    raise SystemExit(run_export_cacao_cli())
