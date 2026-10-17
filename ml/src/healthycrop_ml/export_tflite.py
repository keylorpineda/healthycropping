"""Float16 TFLite export, confidence calibration, model registry, and preprocessing fixture.

The Android app consumes three artifacts per crop:

* `<crop>_v<version>_fp16.tflite` — inference-only MobileNetV3-Large classifier
  (training-time augmentation and dropout stripped) with float16 weights.
* `registry.json` — ordered labels, input size, normalization, and the calibrated
  confidence threshold below which the app abstains ("not sure, retake photo").
* A shared preprocessing fixture proving that `app/src/ml/` produces the exact
  same normalized tensor as the Python training pipeline.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from healthycrop_ml.preprocess import image_to_normalized_tensor

REGISTRY_SCHEMA_VERSION = 1
MAX_TFLITE_SIZE_BYTES = 10 * 1024 * 1024
FIXTURE_SCHEMA_VERSION = 1

REQUIRED_REGISTRY_KEYS: tuple[str, ...] = (
    "schema_version",
    "crop",
    "version",
    "model_file",
    "model_sha256",
    "model_size_bytes",
    "quantization",
    "labels",
    "input",
    "normalization",
    "confidence_threshold",
    "metrics",
)


@dataclass(frozen=True)
class ThresholdCalibration:
    """Result of calibrating the abstention threshold on a held-out split."""

    threshold: float
    accepted_precision: float
    coverage: float
    target_precision: float
    target_met: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "threshold": round(self.threshold, 4),
            "accepted_precision": round(self.accepted_precision, 4),
            "coverage": round(self.coverage, 4),
            "target_precision": round(self.target_precision, 4),
            "target_met": self.target_met,
        }


def build_inference_model(model: Any) -> Any:
    """Return an inference-only copy of a HealthyCrop classifier sharing its trained weights.

    Training-only augmentation layers (`aug_*`) and `head_dropout` are removed so the
    exported graph is `input -> MobileNetV3-Large backbone -> head_norm -> class_probs`.
    """
    import keras

    backbone = next(layer for layer in model.layers if isinstance(layer, keras.Model))
    input_shape = tuple(int(dim) for dim in model.input_shape[1:])
    inputs = keras.Input(shape=input_shape, dtype="float32", name="input_rgb_norm")
    features = backbone(inputs, training=False)
    normed = model.get_layer("head_norm")(features)
    outputs = model.get_layer("class_probs")(normed)
    return keras.Model(inputs=inputs, outputs=outputs, name="healthycrop_inference")


def convert_to_float16_tflite(model: Any) -> bytes:
    """Convert a Keras model with a `(1, H, W, 3)` float32 input to float16 TFLite bytes.

    Keras 3 variables are not frozen when converting a raw `tf.function`, so the model is
    first exported as a SavedModel with a fixed batch-1 signature and converted from disk.
    """
    import tempfile

    import keras
    import tensorflow as tf

    input_shape = (1, *(int(dim) for dim in model.input_shape[1:]))
    with tempfile.TemporaryDirectory() as tmp_dir:
        saved_model_dir = Path(tmp_dir) / "saved_model"
        archive = keras.export.ExportArchive()
        archive.track(model)
        archive.add_endpoint(
            name="serve",
            fn=lambda x: model(x, training=False),
            input_signature=[keras.InputSpec(shape=input_shape, dtype="float32")],
        )
        archive.write_out(str(saved_model_dir), verbose=False)

        converter = tf.lite.TFLiteConverter.from_saved_model(str(saved_model_dir))
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]
        return bytes(converter.convert())


def run_tflite_inference(tflite_model: bytes, x: np.ndarray) -> np.ndarray:
    """Run a single-input TFLite classifier sample by sample and return `(N, C)` probabilities."""
    import tensorflow as tf

    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    input_index = interpreter.get_input_details()[0]["index"]
    output_index = interpreter.get_output_details()[0]["index"]

    outputs: list[np.ndarray] = []
    for sample in x:
        interpreter.set_tensor(input_index, sample[np.newaxis, ...].astype(np.float32))
        interpreter.invoke()
        outputs.append(np.asarray(interpreter.get_tensor(output_index)[0], dtype=np.float32))
    return np.stack(outputs, axis=0)


def accuracy_from_probs(probs: np.ndarray, y_true: np.ndarray) -> float:
    """Top-1 accuracy of `(N, C)` probabilities against integer labels."""
    if probs.shape[0] != y_true.shape[0] or probs.shape[0] == 0:
        raise ValueError("probs and y_true must be non-empty and have the same length")
    return float(np.mean(np.argmax(probs, axis=-1) == y_true))


def calibrate_confidence_threshold(
    probs: np.ndarray,
    y_true: np.ndarray,
    target_precision: float = 0.90,
    min_threshold: float = 0.30,
    max_threshold: float = 0.95,
    step: float = 0.01,
) -> ThresholdCalibration:
    """Pick the lowest top-1 probability threshold whose accepted predictions hit the target.

    Predictions whose top-1 probability is below the threshold are treated as abstentions.
    The lowest qualifying threshold maximizes coverage. If no threshold reaches the target,
    the threshold with the highest accepted precision is returned with `target_met=False`.
    """
    if probs.ndim != 2 or probs.shape[0] != y_true.shape[0] or probs.shape[0] == 0:
        raise ValueError("probs must be (N, C) and match non-empty y_true")

    confidences = np.max(probs, axis=-1)
    correct = np.argmax(probs, axis=-1) == y_true
    n_total = probs.shape[0]

    best_fallback: ThresholdCalibration | None = None
    n_steps = round((max_threshold - min_threshold) / step)
    for i in range(n_steps + 1):
        threshold = round(min_threshold + i * step, 4)
        accepted = confidences >= threshold
        n_accepted = int(np.sum(accepted))
        if n_accepted == 0:
            continue
        precision = float(np.mean(correct[accepted]))
        coverage = n_accepted / n_total
        if precision >= target_precision:
            return ThresholdCalibration(threshold, precision, coverage, target_precision, True)
        if best_fallback is None or precision > best_fallback.accepted_precision:
            best_fallback = ThresholdCalibration(
                threshold, precision, coverage, target_precision, False
            )

    if best_fallback is None:
        raise ValueError("No threshold in range accepted any prediction")
    return best_fallback


def evaluate_threshold(probs: np.ndarray, y_true: np.ndarray, threshold: float) -> dict[str, float]:
    """Accepted precision and coverage of `threshold` on a split (e.g. the test split)."""
    confidences = np.max(probs, axis=-1)
    accepted = confidences >= threshold
    n_accepted = int(np.sum(accepted))
    correct = np.argmax(probs, axis=-1) == y_true
    precision = float(np.mean(correct[accepted])) if n_accepted else 0.0
    return {
        "accepted_precision": round(precision, 4),
        "coverage": round(n_accepted / probs.shape[0], 4),
    }


def sha256_bytes(payload: bytes) -> str:
    """Hex SHA-256 digest of `payload`."""
    return hashlib.sha256(payload).hexdigest()


def build_registry(
    crop: str,
    version: str,
    model_file: str,
    tflite_model: bytes,
    labels: tuple[str, ...],
    image_size: int,
    mean: tuple[float, float, float],
    std: tuple[float, float, float],
    calibration: ThresholdCalibration,
    metrics: dict[str, Any],
) -> dict[str, Any]:
    """Assemble the `registry.json` payload consumed by the Android app."""
    registry: dict[str, Any] = {
        "schema_version": REGISTRY_SCHEMA_VERSION,
        "crop": crop,
        "version": version,
        "model_file": model_file,
        "model_sha256": sha256_bytes(tflite_model),
        "model_size_bytes": len(tflite_model),
        "quantization": "float16",
        "labels": list(labels),
        "input": {
            "width": image_size,
            "height": image_size,
            "channels": 3,
            "color_order": "RGB",
            "dtype": "float32",
            "layout": "NHWC",
        },
        "normalization": {"mean": list(mean), "std": list(std)},
        "confidence_threshold": round(calibration.threshold, 4),
        "metrics": {"threshold_calibration_val": calibration.to_dict(), **metrics},
    }
    validate_registry(registry)
    return registry


def validate_registry(registry: dict[str, Any]) -> None:
    """Raise `ValueError` if `registry` violates the schema expected by the app."""
    missing = [key for key in REQUIRED_REGISTRY_KEYS if key not in registry]
    if missing:
        raise ValueError(f"registry is missing keys: {missing}")
    if registry["schema_version"] != REGISTRY_SCHEMA_VERSION:
        raise ValueError(f"unsupported schema_version {registry['schema_version']}")
    if not str(registry["model_file"]).endswith(".tflite"):
        raise ValueError("model_file must be a .tflite file")
    if len(str(registry["model_sha256"])) != 64:
        raise ValueError("model_sha256 must be a hex SHA-256 digest")
    size = int(registry["model_size_bytes"])
    if not 0 < size < MAX_TFLITE_SIZE_BYTES:
        raise ValueError(f"model_size_bytes must be in (0, {MAX_TFLITE_SIZE_BYTES}), got {size}")
    labels = registry["labels"]
    if not isinstance(labels, list) or len(labels) < 2 or len(set(labels)) != len(labels):
        raise ValueError("labels must be a list of at least 2 unique class names")
    if "healthy" not in labels:
        raise ValueError("labels must include 'healthy'")
    inp = registry["input"]
    if inp.get("width") != inp.get("height") or inp.get("channels") != 3:
        raise ValueError("input must be square with 3 channels")
    norm = registry["normalization"]
    if len(norm.get("mean", [])) != 3 or len(norm.get("std", [])) != 3:
        raise ValueError("normalization mean and std must have 3 values")
    if any(float(s) <= 0.0 for s in norm["std"]):
        raise ValueError("normalization std values must be positive")
    threshold = float(registry["confidence_threshold"])
    if not 0.0 < threshold < 1.0:
        raise ValueError("confidence_threshold must be in (0, 1)")


def generate_fixture_rgb(image_size: int = 224, seed: int = 42) -> np.ndarray:
    """Deterministic `(H, W, 3)` uint8 RGB image mixing gradients and seeded noise.

    Gradients make channel order and row/column layout mistakes obvious; noise covers
    the full `[0, 255]` value range.
    """
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:image_size, 0:image_size]
    red = (xs * 255) // max(image_size - 1, 1)
    green = (ys * 255) // max(image_size - 1, 1)
    blue = rng.integers(0, 256, size=(image_size, image_size))
    rgb = np.stack([red, green, blue], axis=-1)
    rgb[0, 0] = (0, 0, 0)
    rgb[0, -1] = (255, 255, 255)
    return rgb.astype(np.uint8)


def build_preprocessing_fixture(
    image_size: int = 224,
    seed: int = 42,
    mean: tuple[float, float, float] = (127.5, 127.5, 127.5),
    std: tuple[float, float, float] = (127.5, 127.5, 127.5),
    n_probe_pixels: int = 32,
) -> dict[str, Any]:
    """Build the shared preprocessing fixture consumed by `pytest` and the app's Jest suite.

    Contains the raw RGB bytes (base64, row-major HWC), probe pixels with their expected
    normalized values, summary statistics, and the SHA-256 of the full little-endian
    float32 tensor so any implementation can prove bit-exact parity.
    """
    from PIL import Image

    rgb = generate_fixture_rgb(image_size=image_size, seed=seed)
    tensor = image_to_normalized_tensor(Image.fromarray(rgb, mode="RGB"), mean=mean, std=std)
    tensor_le = tensor.astype("<f4")

    rng = np.random.default_rng(seed + 1)
    probe_coords = [(0, 0), (0, image_size - 1), (image_size - 1, 0)]
    probe_coords += [
        (int(r), int(c)) for r, c in rng.integers(0, image_size, size=(n_probe_pixels, 2))
    ]
    probes = [
        {
            "row": r,
            "col": c,
            "rgb": [int(v) for v in rgb[r, c]],
            "normalized": [float(v) for v in tensor_le[r, c]],
        }
        for r, c in probe_coords
    ]

    return {
        "schema_version": FIXTURE_SCHEMA_VERSION,
        "description": (
            "Shared HealthyCrop preprocessing fixture: normalized = (rgb - mean) / std, "
            "float32, NHWC without batch axis, RGB channel order."
        ),
        "width": image_size,
        "height": image_size,
        "channels": 3,
        "seed": seed,
        "mean": list(mean),
        "std": list(std),
        "rgb_base64": base64.b64encode(rgb.tobytes()).decode("ascii"),
        "rgb_sha256": sha256_bytes(rgb.tobytes()),
        "tensor_sha256_float32_le": sha256_bytes(tensor_le.tobytes()),
        "tensor_stats": {
            "min": float(tensor_le.min()),
            "max": float(tensor_le.max()),
            "sum": float(np.sum(tensor_le, dtype=np.float64)),
        },
        "probes": probes,
    }


def decode_fixture_rgb(fixture: dict[str, Any]) -> np.ndarray:
    """Decode the fixture's base64 RGB bytes back into an `(H, W, 3)` uint8 array."""
    raw = base64.b64decode(fixture["rgb_base64"])
    shape = (int(fixture["height"]), int(fixture["width"]), int(fixture["channels"]))
    return np.frombuffer(raw, dtype=np.uint8).reshape(shape)


def write_bytes(path: Path, payload: bytes) -> None:
    """Write binary `payload` to `path`, creating parent directories."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def run_export_pipeline(
    config_path: Path,
    processed_dir: Path,
    checkpoint: Path,
    models_dir: Path,
    fixture_out: Path,
    version: str,
    target_precision: float = 0.90,
    max_accuracy_drop_pp: float = 1.0,
) -> dict[str, Any]:
    """Export a crop checkpoint to float16 TFLite, verify parity, calibrate, and write registry."""
    import keras

    from healthycrop_ml.config import load_crop_config
    from healthycrop_ml.train import load_split_arrays

    cfg = load_crop_config(config_path)
    manifest_csv = processed_dir / "manifest.csv"
    val_ds = load_split_arrays(manifest_csv, processed_dir, "val", cfg.classes, cfg.mean, cfg.std)
    test_ds = load_split_arrays(manifest_csv, processed_dir, "test", cfg.classes, cfg.mean, cfg.std)

    trained = keras.models.load_model(checkpoint, compile=False)
    inference_model = build_inference_model(trained)
    keras_test_probs = np.asarray(inference_model.predict(test_ds.x, verbose=0), dtype=np.float32)
    keras_test_acc = accuracy_from_probs(keras_test_probs, test_ds.y)

    tflite_model = convert_to_float16_tflite(inference_model)
    if len(tflite_model) >= MAX_TFLITE_SIZE_BYTES:
        raise ValueError(f"TFLite model is {len(tflite_model)} bytes (limit 10 MB)")

    tflite_val_probs = run_tflite_inference(tflite_model, val_ds.x)
    tflite_test_probs = run_tflite_inference(tflite_model, test_ds.x)
    tflite_val_acc = accuracy_from_probs(tflite_val_probs, val_ds.y)
    tflite_test_acc = accuracy_from_probs(tflite_test_probs, test_ds.y)
    drop_pp = (keras_test_acc - tflite_test_acc) * 100.0
    if drop_pp > max_accuracy_drop_pp:
        raise ValueError(f"TFLite accuracy drop {drop_pp:.2f} pp exceeds {max_accuracy_drop_pp}")
    top1_agreement = float(
        np.mean(np.argmax(keras_test_probs, axis=-1) == np.argmax(tflite_test_probs, axis=-1))
    )

    calibration = calibrate_confidence_threshold(
        tflite_val_probs, val_ds.y, target_precision=target_precision
    )
    test_at_threshold = evaluate_threshold(tflite_test_probs, test_ds.y, calibration.threshold)

    model_file = f"{cfg.crop}_v{version}_fp16.tflite"
    write_bytes(models_dir / model_file, tflite_model)
    registry = build_registry(
        crop=cfg.crop,
        version=version,
        model_file=model_file,
        tflite_model=tflite_model,
        labels=cfg.classes,
        image_size=cfg.image_size,
        mean=cfg.mean,
        std=cfg.std,
        calibration=calibration,
        metrics={
            "keras_test_accuracy": round(keras_test_acc, 4),
            "tflite_val_accuracy": round(tflite_val_acc, 4),
            "tflite_test_accuracy": round(tflite_test_acc, 4),
            "tflite_test_accuracy_drop_pp": round(drop_pp, 4),
            "keras_tflite_test_top1_agreement": round(top1_agreement, 4),
            "threshold_test": test_at_threshold,
            "test_samples": int(test_ds.y.shape[0]),
            "val_samples": int(val_ds.y.shape[0]),
        },
    )
    registry_path = models_dir / "registry.json"
    registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")

    fixture = build_preprocessing_fixture(
        image_size=cfg.image_size, seed=cfg.seed, mean=cfg.mean, std=cfg.std
    )
    fixture_out.parent.mkdir(parents=True, exist_ok=True)
    fixture_out.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(registry["metrics"], indent=2), flush=True)
    print(f"Wrote {models_dir / model_file} ({len(tflite_model)} bytes)", flush=True)
    print(f"Wrote {registry_path}", flush=True)
    print(f"Wrote {fixture_out}", flush=True)
    return registry


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: export a crop checkpoint to float16 TFLite with registry and fixture."""
    repo_root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description="Export a crop model to float16 TFLite.")
    parser.add_argument("--config", type=Path, default=repo_root / "ml/configs/coffee.yaml")
    parser.add_argument(
        "--processed-dir", type=Path, default=repo_root / "ml/data/processed/coffee"
    )
    parser.add_argument(
        "--checkpoint", type=Path, default=repo_root / "ml/models/coffee/coffee_finetuned.keras"
    )
    parser.add_argument("--models-dir", type=Path, default=repo_root / "ml/models/coffee")
    parser.add_argument(
        "--fixture-out",
        type=Path,
        default=repo_root / "ml/fixtures/preprocessing_fixture_224.json",
    )
    parser.add_argument("--version", type=str, default="0.1.0")
    parser.add_argument("--target-precision", type=float, default=0.90)
    args = parser.parse_args(argv)

    run_export_pipeline(
        config_path=args.config,
        processed_dir=args.processed_dir,
        checkpoint=args.checkpoint,
        models_dir=args.models_dir,
        fixture_out=args.fixture_out,
        version=args.version,
        target_precision=args.target_precision,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
