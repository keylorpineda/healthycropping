"""Unit tests for Grad-CAM heatmap computation and thermal overlay rendering."""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
from PIL import Image

from healthycrop_ml.gradcam import (
    apply_heatmap_colormap,
    compute_gradcam_heatmap,
    overlay_gradcam_on_image,
    render_crop_gradcam_grid,
)
from healthycrop_ml.model import build_mobilenetv3_classifier


def test_compute_gradcam_and_render_grid(tmp_path: Path) -> None:
    """Verify Grad-CAM produces a normalized `(224, 224)` heatmap and renders a grid PNG."""
    classes = ("healthy", "leaf_rust")
    model = build_mobilenetv3_classifier(
        num_classes=len(classes),
        image_size=224,
        weights=None,
        fine_tune_top_layers=0,
        use_augmentation=False,
    )

    dummy_tensor = np.zeros((224, 224, 3), dtype=np.float32)
    heatmap, pred_idx, conf = compute_gradcam_heatmap(
        model=model,
        input_tensor=dummy_tensor,
        target_class_idx=0,
    )
    assert heatmap.shape == (224, 224)
    assert float(np.min(heatmap)) >= 0.0
    assert float(np.max(heatmap)) <= 1.0 + 1e-6
    assert 0 <= pred_idx < len(classes)
    assert 0.0 <= conf <= 1.0

    base_img = Image.new("RGB", (224, 224), color=(40, 120, 50))
    colored = apply_heatmap_colormap(heatmap)
    assert colored.size == (224, 224)
    blended = overlay_gradcam_on_image(base_img, heatmap, alpha=0.4)
    assert blended.size == (224, 224)

    processed_dir = tmp_path / "processed"
    manifest_csv = processed_dir / "manifest.csv"
    rows: list[dict[str, str]] = []
    for cls_name in classes:
        rel = f"test/{cls_name}/sample.jpg"
        p = processed_dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        base_img.save(p)
        rows.append(
            {
                "path": rel,
                "label": cls_name,
                "severity": "",
                "source": "rocole",
                "group_id": f"g_{cls_name}",
                "split": "test",
            }
        )
    with manifest_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["path", "label", "severity", "source", "group_id", "split"],
        )
        writer.writeheader()
        writer.writerows(rows)

    grid_png = tmp_path / "gradcam_grid.png"
    render_crop_gradcam_grid(
        model=model,
        manifest_csv=manifest_csv,
        processed_dir=processed_dir,
        classes=classes,
        output_png=grid_png,
    )
    assert grid_png.exists()
