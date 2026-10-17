"""Grad-CAM visual explanation generator for MobileNetV3-Large crop disease models."""

from __future__ import annotations

import csv
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from healthycrop_ml.preprocess import image_to_normalized_tensor


def _find_backbone_and_last_spatial_layer(model: Any) -> tuple[Any, str, list[Any]]:
    """Locate the MobileNetV3 submodel, its last 4D spatial layer name, and head layers."""
    backbone_layer: Any = None
    head_layers: list[Any] = []
    seen_backbone = False

    for layer in model.layers:
        if hasattr(layer, "layers") and len(layer.layers) > 10:
            backbone_layer = layer
            seen_backbone = True
        elif seen_backbone:
            head_layers.append(layer)

    if backbone_layer is None:
        raise ValueError("Could not find MobileNetV3 backbone submodel in classifier.")

    last_spatial_name = ""
    for sublayer in reversed(backbone_layer.layers):
        try:
            out_shape = sublayer.output.shape
            if len(out_shape) == 4:
                last_spatial_name = str(sublayer.name)
                break
        except AttributeError:
            continue

    if not last_spatial_name:
        raise ValueError("Could not locate a 4D spatial feature map layer in backbone.")

    return backbone_layer, last_spatial_name, head_layers


def compute_gradcam_heatmap(
    model: Any,
    input_tensor: np.ndarray,
    target_class_idx: int | None = None,
) -> tuple[np.ndarray, int, float]:
    """Compute a `(H, W)` Grad-CAM heatmap in `[0.0, 1.0]` for a single `(H, W, 3)` tensor.

    Returns:
        `(heatmap_224, predicted_class_idx, predicted_confidence)`
    """
    import keras
    import tensorflow as tf

    backbone, spatial_layer_name, head_layers = _find_backbone_and_last_spatial_layer(model)
    spatial_out = backbone.get_layer(spatial_layer_name).output
    grad_backbone = keras.Model(
        inputs=backbone.inputs,
        outputs=[spatial_out, backbone.output],
    )

    x_batch = tf.convert_to_tensor(input_tensor[np.newaxis, ...], dtype=tf.float32)

    with tf.GradientTape() as tape:
        conv_maps, pooled = grad_backbone(x_batch, training=False)
        tape.watch(conv_maps)
        x_head = pooled
        for h_layer in head_layers:
            x_head = h_layer(x_head, training=False)
        probs = x_head[0]
        pred_idx = int(tf.argmax(probs).numpy())
        pred_conf = float(probs[pred_idx].numpy())
        cls_idx = pred_idx if target_class_idx is None else target_class_idx
        target_score = probs[cls_idx]

    grads = tape.gradient(target_score, conv_maps)
    if grads is None:
        h, w = input_tensor.shape[:2]
        return np.zeros((h, w), dtype=np.float32), pred_idx, pred_conf

    pooled_grads = tf.reduce_mean(grads[0], axis=(0, 1))
    conv_map_0 = conv_maps[0]
    cam = tf.linalg.matvec(conv_map_0, pooled_grads)
    cam = tf.nn.relu(cam)
    cam_np = np.asarray(cam.numpy(), dtype=np.float32)

    max_val = float(np.max(cam_np))
    if max_val > 1e-8:
        cam_np = cam_np / max_val

    h, w = input_tensor.shape[:2]
    cam_uint8 = np.clip(cam_np * 255.0, 0.0, 255.0).astype(np.uint8)
    cam_img = Image.fromarray(cam_uint8, mode="L").resize(
        (w, h), resample=Image.Resampling.BILINEAR
    )
    heatmap_resized = np.asarray(cam_img, dtype=np.float32) / 255.0
    return heatmap_resized, pred_idx, pred_conf


def apply_heatmap_colormap(heatmap: np.ndarray) -> Image.Image:
    """Map a `[0.0, 1.0]` 2D array to an RGB jet-style thermal image."""
    v = np.clip(heatmap, 0.0, 1.0)
    # Piecewise linear jet colormap (blue -> cyan -> yellow -> red)
    r = np.clip(1.5 - np.abs(4.0 * v - 3.0), 0.0, 1.0)
    g = np.clip(1.5 - np.abs(4.0 * v - 2.0), 0.0, 1.0)
    b = np.clip(1.5 - np.abs(4.0 * v - 1.0), 0.0, 1.0)
    rgb = np.stack([r, g, b], axis=-1)
    return Image.fromarray((rgb * 255.0).astype(np.uint8), mode="RGB")


def overlay_gradcam_on_image(
    rgb_image: Image.Image,
    heatmap: np.ndarray,
    alpha: float = 0.42,
) -> Image.Image:
    """Blend a Grad-CAM thermal map onto the original RGB leaf image."""
    base = rgb_image.convert("RGB")
    color_map = apply_heatmap_colormap(heatmap).resize(
        base.size, resample=Image.Resampling.BILINEAR
    )
    return Image.blend(base, color_map, alpha=alpha)


def render_crop_gradcam_grid(
    model: Any,
    manifest_csv: Path,
    processed_dir: Path,
    classes: Sequence[str],
    output_png: Path,
    mean: tuple[float, float, float] = (127.5, 127.5, 127.5),
    std: tuple[float, float, float] = (127.5, 127.5, 127.5),
    thumb_size: int = 136,
) -> Path:
    """Render a 1-sample-per-class Grad-CAM figure (Original | Heatmap | Overlay) on test split."""
    by_class: dict[str, list[Path]] = {cls_name: [] for cls_name in classes}
    with manifest_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row["split"].strip() == "test":
                lbl = row["label"].strip()
                if lbl in by_class:
                    by_class[lbl].append(processed_dir / row["path"].strip())

    left_gutter = 175
    padding = 12
    header_height = 36
    caption_height = 20
    col_width = thumb_size + padding
    row_height = thumb_size + caption_height + padding

    width = left_gutter + 3 * col_width + padding
    height = header_height + len(classes) * row_height + padding

    canvas = Image.new("RGB", (width, height), color=(248, 250, 246))
    draw = ImageDraw.Draw(canvas)

    draw.rectangle([(0, 0), (width, header_height)], fill=(27, 67, 50))
    draw.text(
        (12, 11),
        "HealthyCrop — Grad-CAM Visual Explanations per Class (Held-Out Test Split)",
        fill=(255, 255, 255),
    )

    for row_idx, cls_name in enumerate(classes):
        y_top = header_height + padding + row_idx * row_height
        draw.rectangle(
            [(padding, y_top), (left_gutter - padding, y_top + thumb_size)],
            fill=(233, 240, 232),
            outline=(183, 202, 181),
        )
        draw.text(
            (padding + 8, y_top + thumb_size // 2 - 12), f"True: {cls_name}", fill=(27, 67, 50)
        )

        candidates = sorted(by_class.get(cls_name, []))
        chosen_img: Image.Image | None = None
        best_heatmap: np.ndarray | None = None
        best_pred_name = cls_name
        best_conf = 0.0

        # Pick a test sample where the model predicts the true class with high confidence
        for cand_path in candidates[:12]:
            if not cand_path.exists():
                continue
            with Image.open(cand_path) as img:
                rgb_img = img.convert("RGB")
                tensor = image_to_normalized_tensor(rgb_img, mean=mean, std=std)
            hmap, pred_idx, conf = compute_gradcam_heatmap(model, tensor, target_class_idx=row_idx)
            if chosen_img is None or (pred_idx == row_idx and conf > best_conf):
                chosen_img = rgb_img
                best_heatmap = hmap
                best_pred_name = classes[pred_idx]
                best_conf = conf
                if pred_idx == row_idx and conf >= 0.75:
                    break

        if chosen_img is None or best_heatmap is None:
            continue

        draw.text(
            (padding + 8, y_top + thumb_size // 2 + 6),
            f"Pred: {best_pred_name} ({best_conf * 100:.0f}%)",
            fill=(45, 106, 79),
        )

        orig_thumb = chosen_img.resize((thumb_size, thumb_size), Image.Resampling.BILINEAR)
        heat_thumb = apply_heatmap_colormap(best_heatmap).resize(
            (thumb_size, thumb_size), Image.Resampling.BILINEAR
        )
        over_thumb = overlay_gradcam_on_image(chosen_img, best_heatmap, alpha=0.42).resize(
            (thumb_size, thumb_size), Image.Resampling.BILINEAR
        )

        panels = [
            (orig_thumb, "Original 224x224"),
            (heat_thumb, "Grad-CAM Activation"),
            (over_thumb, "Lesion Focus Overlay"),
        ]
        for col_idx, (panel_img, caption) in enumerate(panels):
            x_left = left_gutter + col_idx * col_width
            canvas.paste(panel_img, (x_left, y_top))
            draw.rectangle(
                [(x_left, y_top), (x_left + thumb_size - 1, y_top + thumb_size - 1)],
                outline=(140, 160, 140),
            )
            draw.text((x_left + 4, y_top + thumb_size + 3), caption, fill=(65, 80, 65))

    output_png.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_png, format="PNG", optimize=True)
    return output_png
