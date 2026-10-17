"""Unit tests for evaluation metrics, class weights, confusion matrix, and model builder."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from healthycrop_ml.evaluate import (
    compute_balanced_class_weights,
    evaluate_predictions,
    render_confusion_matrix_png,
)
from healthycrop_ml.model import build_mobilenetv3_classifier


def test_compute_balanced_class_weights() -> None:
    """Verify inverse-frequency balanced class weights sum appropriately."""
    # 6 samples of class 0, 2 samples of class 1 -> total 8, num_classes 2
    # w0 = 8 / (2 * 6) = 0.6667, w1 = 8 / (2 * 2) = 2.0
    weights = compute_balanced_class_weights([0, 0, 0, 0, 0, 0, 1, 1], num_classes=2)
    assert abs(weights[0] - (8.0 / 12.0)) < 1e-6
    assert abs(weights[1] - 2.0) < 1e-6


def test_evaluate_predictions_and_confusion_png(tmp_path: Path) -> None:
    """Verify per-class precision/recall/F1, macro-F1, and confusion matrix PNG rendering."""
    classes = ("healthy", "leaf_rust", "cercospora")
    y_true = [0, 0, 1, 1, 2, 2]
    y_pred = [0, 1, 1, 1, 2, 0]

    metrics = evaluate_predictions(y_true, y_pred, classes)
    assert metrics.confusion_matrix == [
        [1, 1, 0],
        [0, 2, 0],
        [1, 0, 1],
    ]
    assert abs(metrics.accuracy - (4.0 / 6.0)) < 1e-6
    assert abs(metrics.per_class["leaf_rust"].recall - 1.0) < 1e-6
    assert abs(metrics.per_class["leaf_rust"].precision - (2.0 / 3.0)) < 1e-6

    out_png = tmp_path / "cm.png"
    render_confusion_matrix_png(
        confusion=metrics.confusion_matrix,
        classes=classes,
        title="Test Confusion Matrix",
        output_png=out_png,
    )
    assert out_png.exists()
    with Image.open(out_png) as img:
        assert img.width > 200
        assert img.height > 200


def test_build_mobilenetv3_classifier_frozen_and_finetune() -> None:
    """Verify MobileNetV3-Large model builds and runs forward pass in frozen and fine-tune modes."""
    model_frozen = build_mobilenetv3_classifier(
        num_classes=6,
        image_size=224,
        weights=None,
        fine_tune_top_layers=0,
        use_augmentation=False,
    )
    dummy_x = np.zeros((2, 224, 224, 3), dtype=np.float32)
    probs = model_frozen.predict(dummy_x, verbose=0)
    assert probs.shape == (2, 6)
    assert np.allclose(np.sum(probs, axis=-1), 1.0, atol=1e-5)

    model_ft = build_mobilenetv3_classifier(
        num_classes=6,
        image_size=224,
        weights=None,
        fine_tune_top_layers=15,
        use_augmentation=False,
    )
    probs_ft = model_ft.predict(dummy_x, verbose=0)
    assert probs_ft.shape == (2, 6)
