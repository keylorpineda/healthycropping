"""Shared preprocessing fixture test (Python side of the Python <-> app parity contract)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from healthycrop_ml.export_tflite import (
    build_preprocessing_fixture,
    decode_fixture_rgb,
    sha256_bytes,
)
from healthycrop_ml.preprocess import image_to_normalized_tensor

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = REPO_ROOT / "ml" / "fixtures" / "preprocessing_fixture_224.json"


def _load_fixture() -> dict[str, object]:
    data: dict[str, object] = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return data


def test_committed_fixture_is_regenerated_identically() -> None:
    assert _load_fixture() == json.loads(json.dumps(build_preprocessing_fixture()))


def test_fixture_tensor_matches_training_preprocessing() -> None:
    fixture = _load_fixture()
    rgb = decode_fixture_rgb(fixture)
    assert rgb.shape == (224, 224, 3)
    assert sha256_bytes(rgb.tobytes()) == fixture["rgb_sha256"]

    tensor = image_to_normalized_tensor(Image.fromarray(rgb, mode="RGB")).astype("<f4")
    assert tensor.shape == (224, 224, 3)
    assert sha256_bytes(tensor.tobytes()) == fixture["tensor_sha256_float32_le"]
    assert float(tensor.min()) == -1.0
    assert float(tensor.max()) == 1.0


def test_fixture_probes_match_formula() -> None:
    fixture = _load_fixture()
    probes = fixture["probes"]
    assert isinstance(probes, list) and len(probes) >= 3
    for probe in probes:
        rgb = np.asarray(probe["rgb"], dtype=np.float32)
        expected = ((rgb - 127.5) / 127.5).astype(np.float32)
        np.testing.assert_array_equal(np.asarray(probe["normalized"], dtype=np.float32), expected)
