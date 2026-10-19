"""Unit tests for banana MobileNetV3-Large training CLI and configuration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from healthycropping_ml.config import load_crop_config
from healthycropping_ml.model import build_mobilenetv3_classifier


def test_banana_config_and_model_head_shape() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    cfg = load_crop_config(repo_root / "ml" / "configs" / "banana.yaml")
    assert cfg.crop == "banana"
    assert cfg.classes == ("healthy", "black_sigatoka", "fusarium_wilt")

    model = build_mobilenetv3_classifier(
        num_classes=len(cfg.classes),
        image_size=cfg.image_size,
        weights=None,
    )
    assert model.output_shape == (None, 3)


def test_train_banana_cli_defaults(monkeypatch: Any) -> None:
    import sys

    scripts_dir = str(Path(__file__).resolve().parents[1] / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import train_banana

    captured: list[str] = []

    def fake_main(argv: list[str] | None = None) -> int:
        if argv is not None:
            captured.extend(argv)
        return 0

    monkeypatch.setattr(train_banana, "main", fake_main)
    rc = train_banana.run_banana_cli(["--head-epochs", "5"])
    assert rc == 0
    assert "--config" in captured
    assert "--run-id" in captured
    assert "banana-v0.1.0-baseline" in captured
