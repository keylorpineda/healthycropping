"""Unit tests for coffee dataset preparation, EXIF handling, pHash dedup, and grouped splitting."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from PIL import Image

from healthycrop_ml.config import SplitRatios, load_crop_config
from healthycrop_ml.dedup import (
    HashedItem,
    compute_phash_hex,
    deduplicate_hashed_items,
    hamming_distance_hex,
)
from healthycrop_ml.preprocess import load_clean_rgb_image
from healthycrop_ml.split import assign_grouped_stratified_splits, verify_no_group_leakage


def _make_patterned_image(path: Path, seed: int, size: tuple[int, int] = (300, 240)) -> None:
    rng = np.random.default_rng(seed)
    # Low-frequency gradient + random block pattern so perceptual hashes are distinct per seed
    x = np.linspace(0, 255, size[0], dtype=np.float32)
    y = np.linspace(0, 255, size[1], dtype=np.float32)
    xv, yv = np.meshgrid(x, y)
    base = ((xv * ((seed % 5) + 1) + yv * ((seed % 7) + 1)) % 256).astype(np.uint8)
    blocks = rng.integers(0, 255, size=(8, 8, 3), dtype=np.uint8)
    blocks_up = np.kron(blocks, np.ones((size[1] // 8 + 1, size[0] // 8 + 1, 1), dtype=np.uint8))[
        : size[1], : size[0], :
    ]
    arr = np.clip((base[:, :, None] // 2) + (blocks_up // 2), 0, 255).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, mode="RGB").save(path, format="JPEG", quality=95)


def test_split_ratios_validation() -> None:
    with pytest.raises(ValueError, match=r"must sum to 1\.0"):
        SplitRatios(train=0.6, val=0.2, test=0.1)


def test_load_clean_rgb_image_and_corrupt_rejection(tmp_path: Path) -> None:
    img_path = tmp_path / "rgba.png"
    rgba = Image.new("RGBA", (320, 180), color=(20, 140, 60, 128))
    rgba.save(img_path)

    cleaned = load_clean_rgb_image(img_path, image_size=224)
    assert cleaned is not None
    assert cleaned.mode == "RGB"
    assert cleaned.size == (224, 224)

    corrupt_path = tmp_path / "corrupt.jpg"
    corrupt_path.write_bytes(b"not-a-valid-jpeg-file")
    assert load_clean_rgb_image(corrupt_path, image_size=224) is None
    assert load_clean_rgb_image(tmp_path / "nonexistent.jpg", image_size=224) is None


def test_phash_deduplication_across_sources(tmp_path: Path) -> None:
    img1_path = tmp_path / "a.jpg"
    img2_path = tmp_path / "b.jpg"
    _make_patterned_image(img1_path, seed=101)
    _make_patterned_image(img2_path, seed=202)

    img1 = load_clean_rgb_image(img1_path)
    img2 = load_clean_rgb_image(img2_path)
    assert img1 is not None and img2 is not None

    h1 = compute_phash_hex(img1)
    h2 = compute_phash_hex(img2)
    assert hamming_distance_hex(h1, h1) == 0
    assert hamming_distance_hex(h1, h2) > 2

    items = [
        HashedItem(item="rocole_1", phash_hex=h1, source="rocole", group_id="g1"),
        HashedItem(item="bracol_dup", phash_hex=h1, source="bracol", group_id="g2"),
        HashedItem(item="bracol_unique", phash_hex=h2, source="bracol", group_id="g3"),
    ]
    kept, dropped = deduplicate_hashed_items(items, max_hamming_distance=2)
    assert [k.item for k in kept] == ["rocole_1", "bracol_unique"]
    assert len(dropped) == 1
    assert dropped[0].dropped.item == "bracol_dup"
    assert dropped[0].kept.item == "rocole_1"


def test_grouped_stratified_split_zero_leakage_and_determinism() -> None:
    # 30 plants, 4 images per plant = 120 images across 3 classes
    entries: list[tuple[str, str, str]] = []
    for class_idx, label in enumerate(["healthy", "leaf_rust", "leaf_miner"]):
        for plant_idx in range(10):
            gid = f"plant_{class_idx}_{plant_idx}"
            for photo_idx in range(4):
                entries.append((f"{gid}_img{photo_idx}", label, gid))

    split_a = assign_grouped_stratified_splits(entries, 0.70, 0.15, 0.15, seed=42)
    split_b = assign_grouped_stratified_splits(entries, 0.70, 0.15, 0.15, seed=42)
    assert split_a == split_b

    verify_no_group_leakage(split_a)

    # Verify every class is present in train, val, and test
    for split_name in ("train", "val", "test"):
        labels_in_split = {r.label for r in split_a if r.split == split_name}
        assert labels_in_split == {"healthy", "leaf_rust", "leaf_miner"}

    # Verify tampering causes verify_no_group_leakage to raise
    leaked = list(split_a)
    leaked[0] = type(leaked[0])(
        item=leaked[0].item,
        label=leaked[0].label,
        group_id=leaked[0].group_id,
        split="val" if leaked[0].split == "train" else "train",
    )
    with pytest.raises(ValueError, match="Group leakage detected"):
        verify_no_group_leakage(leaked)


def test_coffee_yaml_config_loads() -> None:
    cfg_path = Path(__file__).resolve().parents[1] / "configs" / "coffee.yaml"
    cfg = load_crop_config(cfg_path)
    assert cfg.crop == "coffee"
    assert cfg.image_size == 224
    assert cfg.seed == 42
    assert "leaf_rust" in cfg.classes
    assert "healthy" in cfg.classes
    df_dummy = pd.DataFrame([{"a": 1}])
    assert len(df_dummy) == 1
