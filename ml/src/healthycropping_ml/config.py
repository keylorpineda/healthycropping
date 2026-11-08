"""Typed YAML configuration loader for per-crop dataset preparation and training."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class SplitRatios:
    """Train, validation, and test split proportions."""

    train: float
    val: float
    test: float

    def __post_init__(self) -> None:
        total = self.train + self.val + self.test
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Split ratios must sum to 1.0, got {total:.6f}")


@dataclass(frozen=True)
class CropConfig:
    """Configuration for a single crop dataset and model pipeline."""

    crop: str
    image_size: int
    seed: int
    phash_hash_size: int
    phash_max_distance: int
    min_train_images_per_class: int
    split: SplitRatios
    classes: tuple[str, ...]
    sources: dict[str, dict[str, Any]]
    mean: tuple[float, float, float] = (127.5, 127.5, 127.5)
    std: tuple[float, float, float] = (127.5, 127.5, 127.5)


def load_crop_config(config_path: Path) -> CropConfig:
    """Load and validate a `<crop>.yaml` configuration file."""
    raw: dict[str, Any] = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    split_raw = raw["split"]
    split = SplitRatios(
        train=float(split_raw["train"]),
        val=float(split_raw["val"]),
        test=float(split_raw["test"]),
    )
    classes = tuple(str(c) for c in raw["classes"])
    if not classes:
        raise ValueError(f"No classes defined in {config_path}")

    norm_raw = raw.get("normalization") or {}
    mean_list = norm_raw.get("mean", [127.5, 127.5, 127.5])
    std_list = norm_raw.get("std", [127.5, 127.5, 127.5])
    mean_tuple = (float(mean_list[0]), float(mean_list[1]), float(mean_list[2]))
    std_tuple = (float(std_list[0]), float(std_list[1]), float(std_list[2]))

    return CropConfig(
        crop=str(raw["crop"]),
        image_size=int(raw.get("image_size", 224)),
        seed=int(raw.get("seed", 42)),
        phash_hash_size=int(raw.get("phash_hash_size", 8)),
        phash_max_distance=int(raw.get("phash_max_distance", 2)),
        min_train_images_per_class=int(raw.get("min_train_images_per_class", 50)),
        split=split,
        classes=classes,
        sources=dict(raw.get("sources") or {}),
        mean=mean_tuple,
        std=std_tuple,
    )
