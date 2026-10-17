"""Tests for float16 TFLite export, threshold calibration, and registry validation."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from healthycrop_ml.export_tflite import (
    REQUIRED_REGISTRY_KEYS,
    ThresholdCalibration,
    accuracy_from_probs,
    build_inference_model,
    build_registry,
    calibrate_confidence_threshold,
    convert_to_float16_tflite,
    evaluate_threshold,
    run_tflite_inference,
    validate_registry,
)
from healthycrop_ml.model import build_mobilenetv3_classifier

REPO_ROOT = Path(__file__).resolve().parents[2]
COFFEE_REGISTRY = REPO_ROOT / "ml" / "models" / "coffee" / "registry.json"


def _calibration() -> ThresholdCalibration:
    return ThresholdCalibration(0.55, 0.92, 0.81, 0.90, True)


def _registry(**overrides: Any) -> dict[str, Any]:
    registry = build_registry(
        crop="coffee",
        version="0.1.0",
        model_file="coffee_v0.1.0_fp16.tflite",
        tflite_model=b"\x00" * 1024,
        labels=("healthy", "leaf_rust"),
        image_size=224,
        mean=(127.5, 127.5, 127.5),
        std=(127.5, 127.5, 127.5),
        calibration=_calibration(),
        metrics={"tflite_test_accuracy": 0.81},
    )
    registry.update(overrides)
    return registry


def test_calibrate_threshold_picks_lowest_threshold_meeting_target() -> None:
    probs = np.array(
        [[0.95, 0.05], [0.85, 0.15], [0.60, 0.40], [0.45, 0.55], [0.52, 0.48]],
        dtype=np.float32,
    )
    y_true = np.array([0, 0, 1, 1, 1])
    cal = calibrate_confidence_threshold(probs, y_true, target_precision=0.99)
    # Wrong predictions have confidence 0.60 and 0.52, so the first clean threshold is 0.61.
    assert cal.target_met
    assert cal.threshold == pytest.approx(0.61)
    assert cal.accepted_precision == pytest.approx(1.0)
    assert cal.coverage == pytest.approx(0.4)


def test_calibrate_threshold_falls_back_when_target_unreachable() -> None:
    probs = np.array([[0.99, 0.01], [0.98, 0.02]], dtype=np.float32)
    y_true = np.array([0, 1])
    cal = calibrate_confidence_threshold(probs, y_true, target_precision=0.95)
    assert not cal.target_met
    assert cal.accepted_precision == pytest.approx(0.5)


def test_calibrate_threshold_rejects_bad_shapes() -> None:
    with pytest.raises(ValueError):
        calibrate_confidence_threshold(np.zeros((2, 2)), np.zeros(3, dtype=np.int32))


def test_evaluate_threshold_and_accuracy() -> None:
    probs = np.array([[0.9, 0.1], [0.4, 0.6], [0.7, 0.3]], dtype=np.float32)
    y_true = np.array([0, 0, 0])
    assert accuracy_from_probs(probs, y_true) == pytest.approx(2 / 3)
    result = evaluate_threshold(probs, y_true, 0.65)
    assert result == {"accepted_precision": 1.0, "coverage": pytest.approx(0.6667)}


def test_build_registry_contains_required_keys() -> None:
    registry = _registry()
    for key in REQUIRED_REGISTRY_KEYS:
        assert key in registry
    assert registry["confidence_threshold"] == pytest.approx(0.55)
    assert registry["metrics"]["threshold_calibration_val"]["target_met"] is True
    assert len(registry["model_sha256"]) == 64


@pytest.mark.parametrize(
    "mutation",
    [
        {"model_file": "coffee.keras"},
        {"labels": ["leaf_rust", "leaf_rust"]},
        {"labels": ["leaf_rust", "cercospora"]},
        {"confidence_threshold": 1.2},
        {"model_size_bytes": 11 * 1024 * 1024},
        {"normalization": {"mean": [127.5], "std": [127.5]}},
        {"schema_version": 99},
    ],
)
def test_validate_registry_rejects_invalid(mutation: dict[str, Any]) -> None:
    registry = copy.deepcopy(_registry())
    registry.update(mutation)
    with pytest.raises(ValueError):
        validate_registry(registry)


def test_validate_registry_rejects_missing_key() -> None:
    registry = _registry()
    del registry["labels"]
    with pytest.raises(ValueError):
        validate_registry(registry)


def test_committed_coffee_registry_is_valid() -> None:
    registry = json.loads(COFFEE_REGISTRY.read_text(encoding="utf-8"))
    validate_registry(registry)
    assert registry["crop"] == "coffee"
    assert registry["labels"] == [
        "healthy",
        "leaf_rust",
        "leaf_miner",
        "cercospora",
        "brown_leaf_spot",
        "red_spider_mite",
    ]
    assert registry["input"]["width"] == 224
    assert registry["normalization"] == {"mean": [127.5] * 3, "std": [127.5] * 3}
    metrics = registry["metrics"]
    assert metrics["tflite_test_accuracy_drop_pp"] <= 1.0


def test_float16_tflite_export_matches_keras() -> None:
    model = build_mobilenetv3_classifier(num_classes=3, image_size=32, weights=None)
    inference_model = build_inference_model(model)
    layer_names = {layer.name for layer in inference_model.layers}
    assert not any(name.startswith("aug_") for name in layer_names)
    assert "head_dropout" not in layer_names

    tflite_model = convert_to_float16_tflite(inference_model)
    assert 0 < len(tflite_model) < 10 * 1024 * 1024

    rng = np.random.default_rng(42)
    x = rng.uniform(-1.0, 1.0, size=(4, 32, 32, 3)).astype(np.float32)
    keras_probs = np.asarray(inference_model.predict(x, verbose=0), dtype=np.float32)
    tflite_probs = run_tflite_inference(tflite_model, x)
    assert tflite_probs.shape == (4, 3)
    np.testing.assert_allclose(tflite_probs.sum(axis=-1), 1.0, atol=1e-3)
    np.testing.assert_allclose(tflite_probs, keras_probs, atol=2e-2)
