"""Training and evaluation pipeline for MobileNetV3-Large crop disease models."""

from __future__ import annotations

import argparse
import csv
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from healthycrop_ml.config import CropConfig, load_crop_config
from healthycrop_ml.evaluate import (
    EvaluationMetrics,
    compute_balanced_class_weights,
    evaluate_predictions,
    render_confusion_matrix_png,
)
from healthycrop_ml.gradcam import render_crop_gradcam_grid
from healthycrop_ml.model import build_mobilenetv3_classifier, configure_backbone_trainability
from healthycrop_ml.preprocess import image_to_normalized_tensor


@dataclass(frozen=True)
class SplitDataset:
    """In-memory normalized tensor array and integer class indices for a split."""

    x: np.ndarray
    y: np.ndarray
    paths: tuple[str, ...]


def load_split_arrays(
    manifest_csv: Path,
    processed_dir: Path,
    split_name: str,
    classes: tuple[str, ...],
    mean: tuple[float, float, float] = (127.5, 127.5, 127.5),
    std: tuple[float, float, float] = (127.5, 127.5, 127.5),
) -> SplitDataset:
    """Load all images for `split_name` from `manifest.csv` into normalized float32 arrays."""
    class_to_idx = {cls_name: idx for idx, cls_name in enumerate(classes)}
    tensors: list[np.ndarray] = []
    labels: list[int] = []
    paths: list[str] = []

    with manifest_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row["split"].strip() != split_name:
                continue
            label_str = row["label"].strip()
            if label_str not in class_to_idx:
                continue
            rel_path = row["path"].strip()
            img_path = processed_dir / rel_path
            with Image.open(img_path) as img:
                rgb_img = img.convert("RGB")
                tensor = image_to_normalized_tensor(rgb_img, mean=mean, std=std)
            tensors.append(tensor)
            labels.append(class_to_idx[label_str])
            paths.append(rel_path)

    if not tensors:
        raise ValueError(f"No samples found for split '{split_name}' in {manifest_csv}")

    x_arr = np.stack(tensors, axis=0).astype(np.float32)
    y_arr = np.asarray(labels, dtype=np.int32)
    return SplitDataset(x=x_arr, y=y_arr, paths=tuple(paths))


def predict_class_indices(model: Any, x: np.ndarray, batch_size: int = 32) -> np.ndarray:
    """Run batch inference and return predicted integer class indices."""
    probs = np.asarray(model.predict(x, batch_size=batch_size, verbose=0), dtype=np.float32)
    return np.argmax(probs, axis=-1).astype(np.int32)


def _augment_spatial_tensor(feat_map: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Apply dihedral D4 symmetry (rot90 + flip) and mild channel noise on 7x7x160."""
    k_rot = int(rng.integers(0, 4))
    out = np.rot90(feat_map, k=k_rot, axes=(0, 1)).copy()
    if rng.random() < 0.5:
        out = out[:, ::-1, :].copy()
    if rng.random() < 0.5:
        out = out[::-1, :, :].copy()
    scale = rng.uniform(0.93, 1.07, size=(1, 1, out.shape[-1])).astype(np.float32)
    return (out * scale).astype(np.float32)


def _build_balanced_spatial_dataset(
    spatial_x: np.ndarray,
    y: np.ndarray,
    num_classes: int,
    min_per_class: int = 450,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """Build a low-RAM class-balanced augmented dataset in `(7, 7, 160)` spatial feature space."""
    rng = np.random.default_rng(seed)
    xs: list[np.ndarray] = [spatial_x]
    ys: list[np.ndarray] = [y]

    # 1. Standard 1x dihedral view for all samples
    aug_all = np.empty_like(spatial_x)
    for idx in range(len(spatial_x)):
        aug_all[idx] = _augment_spatial_tensor(spatial_x[idx], rng)
    xs.append(aug_all)
    ys.append(y.copy())

    # 2. Minority class oversampling with dihedral + channel jitter up to `min_per_class`
    combined_y = np.concatenate(ys, axis=0)
    for cls_idx in range(num_classes):
        cls_indices = np.where(y == cls_idx)[0]
        current_count = int(np.sum(combined_y == cls_idx))
        if len(cls_indices) > 0 and current_count < min_per_class:
            needed = min_per_class - current_count
            extra_x = np.empty((needed, *spatial_x.shape[1:]), dtype=np.float32)
            for k in range(needed):
                src_idx = int(cls_indices[k % len(cls_indices)])
                extra_x[k] = _augment_spatial_tensor(spatial_x[src_idx], rng)
            xs.append(extra_x)
            ys.append(np.full((needed,), cls_idx, dtype=np.int32))

    x_out = np.concatenate(xs, axis=0)
    y_out = np.concatenate(ys, axis=0)
    perm = rng.permutation(len(y_out))
    return x_out[perm], y_out[perm]


def calibrate_logit_biases_on_val(
    model: Any,
    val_x: np.ndarray,
    val_y: np.ndarray,
    classes: tuple[str, ...],
    batch_size: int = 64,
    num_trials: int = 2500,
    seed: int = 42,
) -> float:
    """Calibrate final Dense layer bias vector on validation set to counter class imbalance."""
    dense_layer = model.get_layer("class_probs")
    weights, biases = dense_layer.get_weights()
    val_probs = np.asarray(model.predict(val_x, batch_size=batch_size, verbose=0), dtype=np.float32)
    val_logits = np.log(np.clip(val_probs, 1e-8, 1.0))

    y_list = val_y.tolist()
    best_f1 = evaluate_predictions(
        y_list, np.argmax(val_logits, axis=-1).tolist(), classes
    ).macro_f1
    best_delta = np.zeros_like(biases, dtype=np.float32)
    rng = np.random.default_rng(seed)

    for _ in range(num_trials):
        cand = best_delta + rng.normal(0.0, 0.25, size=biases.shape).astype(np.float32)
        cand = cand - np.mean(cand)
        preds = np.argmax(val_logits + cand, axis=-1).tolist()
        f1 = evaluate_predictions(y_list, preds, classes).macro_f1
        if f1 > best_f1 + 1e-5:
            best_f1 = f1
            best_delta = cand

    dense_layer.set_weights([weights, biases + best_delta])
    return best_f1


def run_training_pipeline(
    cfg: CropConfig,
    processed_dir: Path,
    run_id: str,
    head_epochs: int = 35,
    head_lr: float = 2e-3,
    fine_tune_epochs: int = 0,
    fine_tune_lr: float = 2e-4,
    fine_tune_top_layers: int = 0,
    batch_size: int = 64,
    patience: int = 8,
    weights: str | None = "imagenet",
    checkpoint_out: Path | None = None,
    confusion_png_out: Path | None = None,
    gradcam_png_out: Path | None = None,
    metrics_json_out: Path | None = None,
) -> dict[str, Any]:
    """Train MobileNetV3-Large (frozen head warm-up + optional top-layer fine-tuning)."""
    import keras
    from keras import layers

    keras.utils.set_random_seed(cfg.seed)
    manifest_csv = processed_dir / "manifest.csv"

    print(f"[{run_id}] Loading preprocessed splits from {manifest_csv}...", flush=True)
    train_ds = load_split_arrays(
        manifest_csv, processed_dir, "train", cfg.classes, cfg.mean, cfg.std
    )
    val_ds = load_split_arrays(manifest_csv, processed_dir, "val", cfg.classes, cfg.mean, cfg.std)
    test_ds = load_split_arrays(manifest_csv, processed_dir, "test", cfg.classes, cfg.mean, cfg.std)
    print(
        f"[{run_id}] Loaded train={len(train_ds.y)}, val={len(val_ds.y)}, test={len(test_ds.y)}",
        flush=True,
    )

    model = build_mobilenetv3_classifier(
        num_classes=len(cfg.classes),
        image_size=cfg.image_size,
        weights=weights,
        dropout_rate=0.30,
        learning_rate=head_lr,
        fine_tune_top_layers=0,
        use_augmentation=True,
    )

    backbone_layer: Any = None
    for layer in model.layers:
        if hasattr(layer, "layers") and len(layer.layers) > 10:
            backbone_layer = layer
            break

    best_val_f1 = -1.0
    best_weights = model.get_weights()
    epoch_history: list[dict[str, Any]] = []
    start_time = time.time()

    if backbone_layer is not None:
        # Decide spatial split point:
        # - If fine_tune_top_layers >= 34: split at expanded_conv_12_project_bn
        # - Otherwise: split at expanded_conv_14_add (conv_1 + head)
        deep_blocks = fine_tune_top_layers >= 34
        split_layer_name = "expanded_conv_12_project_bn" if deep_blocks else "expanded_conv_14_add"
        prefix_out = backbone_layer.get_layer(split_layer_name).output
        prefix_model = keras.Model(inputs=backbone_layer.input, outputs=prefix_out)

        print(
            f"[{run_id}] Extracting MobileNetV3-Large spatial features at {split_layer_name}...",
            flush=True,
        )
        train_spatial_raw = np.asarray(
            prefix_model.predict(train_ds.x, batch_size=batch_size, verbose=0),
            dtype=np.float32,
        )
        val_spatial = np.asarray(
            prefix_model.predict(val_ds.x, batch_size=batch_size, verbose=0),
            dtype=np.float32,
        )

        min_per_cls = 450 if fine_tune_epochs > 0 else 0
        train_spatial_aug, y_train_aug = _build_balanced_spatial_dataset(
            train_spatial_raw,
            train_ds.y,
            num_classes=len(cfg.classes),
            min_per_class=min_per_cls,
            seed=cfg.seed,
        )

        def _apply_remaining_backbone(inp_tensor: Any, training_bn: bool = False) -> Any:
            x = inp_tensor
            if deep_blocks:
                for start_idx in (153, 168):
                    blk = backbone_layer.layers[start_idx : start_idx + 15]
                    sc = x
                    x = blk[0](x)
                    x = blk[1](x, training=training_bn)
                    x = blk[2](x)
                    x = blk[3](x)
                    x = blk[4](x, training=training_bn)
                    x = blk[5](x)
                    se = blk[6](x)
                    se = blk[7](se)
                    se = blk[8](se)
                    se = blk[9](se)
                    se = blk[10](se)
                    x = blk[11]([x, se])
                    x = blk[12](x)
                    x = blk[13](x, training=training_bn)
                    x = blk[14]([sc, x])
            x = backbone_layer.get_layer("conv_1")(x)
            x = backbone_layer.get_layer("conv_1_bn")(x, training=training_bn)
            x = backbone_layer.layers[-2](x)
            return backbone_layer.get_layer("avg_pool")(x)

        top_proj_in = keras.Input(shape=(7, 7, 160), dtype="float32")
        top_proj_model = keras.Model(
            inputs=top_proj_in,
            outputs=_apply_remaining_backbone(top_proj_in, training_bn=False),
        )

        if head_epochs > 0:
            train_feats = np.asarray(
                top_proj_model.predict(train_spatial_aug, batch_size=batch_size, verbose=0),
                dtype=np.float32,
            )
            val_feats = np.asarray(
                top_proj_model.predict(val_spatial, batch_size=batch_size, verbose=0),
                dtype=np.float32,
            )

            feat_dim = int(train_feats.shape[-1])
            head_in = keras.Input(shape=(feat_dim,), dtype="float32")
            head_norm_layer = layers.LayerNormalization(name="head_norm")
            head_drop_layer = layers.Dropout(0.30, name="head_dropout")
            head_dense_layer = layers.Dense(
                len(cfg.classes),
                activation="softmax",
                kernel_regularizer=keras.regularizers.L2(2e-4),
                name="class_probs",
            )
            head_out = head_dense_layer(head_drop_layer(head_norm_layer(head_in)))
            head_model = keras.Model(inputs=head_in, outputs=head_out)
            head_model.compile(
                optimizer=keras.optimizers.Adam(learning_rate=head_lr),
                loss=keras.losses.SparseCategoricalCrossentropy(),
                metrics=[keras.metrics.SparseCategoricalAccuracy(name="accuracy")],
            )

            class_weights = compute_balanced_class_weights(
                y_train_aug.tolist(), num_classes=len(cfg.classes)
            )

            best_head_weights = head_model.get_weights()
            wait = 0
            for epoch in range(1, head_epochs + 1):
                hist = head_model.fit(
                    train_feats,
                    y_train_aug,
                    batch_size=batch_size,
                    epochs=1,
                    class_weight=class_weights,
                    verbose=0,
                )
                train_loss = float(hist.history["loss"][0])
                train_acc = float(hist.history["accuracy"][0])

                val_preds = predict_class_indices(head_model, val_feats, batch_size=batch_size)
                val_eval = evaluate_predictions(val_ds.y.tolist(), val_preds.tolist(), cfg.classes)

                if val_eval.macro_f1 > best_val_f1 + 1e-5:
                    best_val_f1 = val_eval.macro_f1
                    best_head_weights = head_model.get_weights()
                    wait = 0
                else:
                    wait += 1

                epoch_history.append(
                    {
                        "stage": "frozen_head",
                        "epoch": epoch,
                        "train_loss": round(train_loss, 4),
                        "train_acc": round(train_acc, 4),
                        "val_acc": round(val_eval.accuracy, 4),
                        "val_macro_f1": round(val_eval.macro_f1, 4),
                        "best_val_macro_f1": round(best_val_f1, 4),
                    }
                )
                print(
                    f"[{run_id}][frozen_head E{epoch:02d}/{head_epochs:02d}] "
                    f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
                    f"val_acc={val_eval.accuracy:.4f} val_macro_f1={val_eval.macro_f1:.4f} "
                    f"(best={best_val_f1:.4f})",
                    flush=True,
                )
                if wait >= patience:
                    print(
                        f"[{run_id}][frozen_head] Early stopping triggered at epoch {epoch} "
                        f"(patience={patience}).",
                        flush=True,
                    )
                    break

            head_model.set_weights(best_head_weights)
            model.get_layer("head_norm").set_weights(head_norm_layer.get_weights())
            model.get_layer("class_probs").set_weights(head_dense_layer.get_weights())
            best_weights = model.get_weights()

        if fine_tune_epochs > 0 and fine_tune_top_layers > 0:
            print(
                f"[{run_id}] Fine-tuning top {fine_tune_top_layers} layers "
                f"(BatchNorm frozen) at lr={fine_tune_lr}...",
                flush=True,
            )
            configure_backbone_trainability(
                backbone_layer, fine_tune_top_layers=fine_tune_top_layers
            )
            ft_in = keras.Input(shape=(7, 7, 160), dtype="float32")
            ft_reg = layers.SpatialDropout2D(0.20)(ft_in)
            ft_pooled = _apply_remaining_backbone(ft_reg, training_bn=False)
            ft_x = model.get_layer("head_norm")(ft_pooled)
            ft_x = model.get_layer("head_dropout")(ft_x)
            ft_out = model.get_layer("class_probs")(ft_x)
            ft_model = keras.Model(inputs=ft_in, outputs=ft_out)

            steps_per_epoch = max(1, len(y_train_aug) // batch_size)
            lr_schedule = keras.optimizers.schedules.CosineDecay(
                initial_learning_rate=fine_tune_lr,
                decay_steps=steps_per_epoch * fine_tune_epochs,
                alpha=0.05,
            )
            ft_model.compile(
                optimizer=keras.optimizers.AdamW(learning_rate=lr_schedule, weight_decay=1e-3),
                loss=keras.losses.SparseCategoricalCrossentropy(),
                metrics=[keras.metrics.SparseCategoricalAccuracy(name="accuracy")],
            )

            ft_weights = compute_balanced_class_weights(
                y_train_aug.tolist(), num_classes=len(cfg.classes)
            )
            wait = 0
            for epoch in range(1, fine_tune_epochs + 1):
                hist = ft_model.fit(
                    train_spatial_aug,
                    y_train_aug,
                    batch_size=batch_size,
                    epochs=1,
                    class_weight=ft_weights,
                    verbose=0,
                )
                train_loss = float(hist.history["loss"][0])
                train_acc = float(hist.history["accuracy"][0])

                val_preds = predict_class_indices(ft_model, val_spatial, batch_size=batch_size)
                val_eval = evaluate_predictions(val_ds.y.tolist(), val_preds.tolist(), cfg.classes)

                if val_eval.macro_f1 > best_val_f1 + 1e-5:
                    best_val_f1 = val_eval.macro_f1
                    best_weights = model.get_weights()
                    wait = 0
                else:
                    wait += 1

                epoch_history.append(
                    {
                        "stage": "fine_tune",
                        "epoch": epoch,
                        "train_loss": round(train_loss, 4),
                        "train_acc": round(train_acc, 4),
                        "val_acc": round(val_eval.accuracy, 4),
                        "val_macro_f1": round(val_eval.macro_f1, 4),
                        "best_val_macro_f1": round(best_val_f1, 4),
                    }
                )
                print(
                    f"[{run_id}][fine_tune E{epoch:02d}/{fine_tune_epochs:02d}] "
                    f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
                    f"val_acc={val_eval.accuracy:.4f} val_macro_f1={val_eval.macro_f1:.4f} "
                    f"(best={best_val_f1:.4f})",
                    flush=True,
                )
                if wait >= patience:
                    print(
                        f"[{run_id}][fine_tune] Early stopping triggered at epoch {epoch} "
                        f"(patience={patience}).",
                        flush=True,
                    )
                    break

            model.set_weights(best_weights)

        if fine_tune_epochs > 0:
            cal_f1 = calibrate_logit_biases_on_val(
                model=model,
                val_x=val_ds.x,
                val_y=val_ds.y,
                classes=cfg.classes,
                batch_size=batch_size,
                seed=cfg.seed,
            )
            print(
                f"[{run_id}] Post-calibration validation Macro-F1: {cal_f1:.4f}",
                flush=True,
            )

    elapsed_sec = round(time.time() - start_time, 2)

    val_preds = predict_class_indices(model, val_ds.x, batch_size=batch_size)
    val_metrics: EvaluationMetrics = evaluate_predictions(
        val_ds.y.tolist(), val_preds.tolist(), cfg.classes
    )

    test_preds = predict_class_indices(model, test_ds.x, batch_size=batch_size)
    test_metrics: EvaluationMetrics = evaluate_predictions(
        test_ds.y.tolist(), test_preds.tolist(), cfg.classes
    )

    print(
        f"[{run_id}] Final Best Checkpoint -> "
        f"val_acc={val_metrics.accuracy:.4f}, val_macro_f1={val_metrics.macro_f1:.4f}, "
        f"test_acc={test_metrics.accuracy:.4f}, test_macro_f1={test_metrics.macro_f1:.4f}",
        flush=True,
    )

    if checkpoint_out is not None:
        checkpoint_out.parent.mkdir(parents=True, exist_ok=True)
        model.save(checkpoint_out)
        print(f"[{run_id}] Saved Keras checkpoint to {checkpoint_out}", flush=True)

    if confusion_png_out is not None:
        render_confusion_matrix_png(
            confusion=test_metrics.confusion_matrix,
            classes=cfg.classes,
            title=f"HealthyCrop — {cfg.crop.title()} Test Confusion Matrix ({run_id})",
            output_png=confusion_png_out,
        )
        print(f"[{run_id}] Saved confusion matrix PNG to {confusion_png_out}", flush=True)

    if gradcam_png_out is not None:
        render_crop_gradcam_grid(
            model=model,
            manifest_csv=manifest_csv,
            processed_dir=processed_dir,
            classes=cfg.classes,
            output_png=gradcam_png_out,
            mean=cfg.mean,
            std=cfg.std,
        )
        print(f"[{run_id}] Saved Grad-CAM grid PNG to {gradcam_png_out}", flush=True)

    result_payload: dict[str, Any] = {
        "run_id": run_id,
        "crop": cfg.crop,
        "seed": cfg.seed,
        "head_epochs": head_epochs,
        "head_lr": head_lr,
        "fine_tune_epochs": fine_tune_epochs,
        "fine_tune_lr": fine_tune_lr,
        "fine_tune_top_layers": fine_tune_top_layers,
        "batch_size": batch_size,
        "patience": patience,
        "elapsed_seconds": elapsed_sec,
        "val_metrics": val_metrics.to_dict(),
        "test_metrics": test_metrics.to_dict(),
        "epoch_history": epoch_history,
    }

    if metrics_json_out is not None:
        metrics_json_out.parent.mkdir(parents=True, exist_ok=True)
        metrics_json_out.write_text(json.dumps(result_payload, indent=2) + "\n", encoding="utf-8")
        print(f"[{run_id}] Saved metrics JSON to {metrics_json_out}", flush=True)

    return result_payload


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for training a crop disease model."""
    repo_root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description="Train MobileNetV3-Large crop disease model.")
    parser.add_argument(
        "--config",
        type=Path,
        default=repo_root / "ml" / "configs" / "coffee.yaml",
        help="Path to crop YAML config.",
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=repo_root / "ml" / "data" / "processed" / "coffee",
        help="Path to processed crop dataset directory.",
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default="coffee-v0.1.0-baseline",
        help="Unique experiment run identifier.",
    )
    parser.add_argument("--head-epochs", type=int, default=35)
    parser.add_argument("--head-lr", type=float, default=2e-3)
    parser.add_argument("--fine-tune-epochs", type=int, default=0)
    parser.add_argument("--fine-tune-lr", type=float, default=2e-4)
    parser.add_argument("--fine-tune-top-layers", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument(
        "--checkpoint-out",
        type=Path,
        default=repo_root / "ml" / "models" / "coffee" / "coffee_baseline.keras",
    )
    parser.add_argument(
        "--confusion-out",
        type=Path,
        default=repo_root / "docs" / "assets" / "confusion_matrices" / "coffee_baseline.png",
    )
    parser.add_argument(
        "--gradcam-out",
        type=Path,
        default=None,
    )
    parser.add_argument(
        "--metrics-out",
        type=Path,
        default=repo_root / "ml" / "data" / "processed" / "coffee" / "baseline_metrics.json",
    )
    args = parser.parse_args(argv)

    cfg = load_crop_config(args.config)
    run_training_pipeline(
        cfg=cfg,
        processed_dir=args.processed_dir,
        run_id=args.run_id,
        head_epochs=args.head_epochs,
        head_lr=args.head_lr,
        fine_tune_epochs=args.fine_tune_epochs,
        fine_tune_lr=args.fine_tune_lr,
        fine_tune_top_layers=args.fine_tune_top_layers,
        batch_size=args.batch_size,
        patience=args.patience,
        weights="imagenet",
        checkpoint_out=args.checkpoint_out,
        confusion_png_out=args.confusion_out,
        gradcam_png_out=args.gradcam_out,
        metrics_json_out=args.metrics_out,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
