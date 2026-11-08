"""EXIF orientation fixture: a portrait camera JPEG stored landscape with orientation 6.

Android cameras usually write the sensor buffer landscape and tag portrait shots
with EXIF orientation 6 ("rotate 90 degrees clockwise to display"). A decoder that
ignores the tag feeds the model a sideways leaf. The fixture holds:

- `exif_jpeg`: a 224x168 (width x height) JPEG tagged with orientation 6 whose
  upright view is a 168x224 image with four solid quadrants;
- `upright_jpeg`: that upright view resized to 224x224, which is what the app's
  native resize step (`expo-image-manipulator`, decoded by Glide, which applies
  EXIF orientation) hands to the JavaScript JPEG decoder;
- probe pixels and quadrant colors decoded by Pillow, so Python and the app can
  check they see the same upright pixels within JPEG decoder tolerance.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
from typing import Any, Final

import numpy as np
from PIL import Image

from healthycropping_ml.preprocess import load_clean_rgb_image

ORIENTATION_TAG: Final = 0x0112
ORIENTATION: Final = 6
STORED_WIDTH: Final = 224
STORED_HEIGHT: Final = 168
IMAGE_SIZE: Final = 224
JPEG_QUALITY: Final = 95

# Upright (display) layout; distinct hues make any rotation or flip obvious.
QUADRANT_COLORS: Final[dict[str, tuple[int, int, int]]] = {
    "top_left": (220, 40, 40),
    "top_right": (40, 170, 60),
    "bottom_left": (40, 70, 200),
    "bottom_right": (230, 200, 40),
}

REPO_ROOT: Final = Path(__file__).resolve().parents[3]
JPEG_PATH: Final = REPO_ROOT / "ml" / "fixtures" / "exif_orientation_6.jpg"
JSON_PATH: Final = REPO_ROOT / "ml" / "fixtures" / "exif_orientation_fixture.json"
APP_JSON_PATH: Final = (
    REPO_ROOT / "app" / "src" / "ml" / "fixtures" / "exif_orientation_fixture.json"
)


def upright_pattern() -> np.ndarray:
    """The displayed image: `(224, 168, 3)` uint8 with four solid quadrants."""
    height, width = STORED_WIDTH, STORED_HEIGHT
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    half_h, half_w = height // 2, width // 2
    rgb[:half_h, :half_w] = QUADRANT_COLORS["top_left"]
    rgb[:half_h, half_w:] = QUADRANT_COLORS["top_right"]
    rgb[half_h:, :half_w] = QUADRANT_COLORS["bottom_left"]
    rgb[half_h:, half_w:] = QUADRANT_COLORS["bottom_right"]
    return rgb


def _encode_jpeg(image: Image.Image, exif: Image.Exif | None = None) -> bytes:
    buffer = io.BytesIO()
    options: dict[str, Any] = {"quality": JPEG_QUALITY, "subsampling": 0}
    if exif is not None:
        options["exif"] = exif.tobytes()
    image.save(buffer, format="JPEG", **options)
    return buffer.getvalue()


def build_exif_jpeg() -> bytes:
    """Stored landscape pixels (upright view rotated 90 degrees counter-clockwise) + tag 6."""
    stored = Image.fromarray(upright_pattern(), mode="RGB").transpose(Image.Transpose.ROTATE_90)
    exif = Image.Exif()
    exif[ORIENTATION_TAG] = ORIENTATION
    return _encode_jpeg(stored, exif)


def build_upright_jpeg(exif_jpeg_path: Path) -> bytes:
    """What the native resize step produces: upright, 224x224, no EXIF."""
    upright = load_clean_rgb_image(exif_jpeg_path, image_size=IMAGE_SIZE)
    if upright is None:
        raise ValueError(f"cannot decode {exif_jpeg_path}")
    return _encode_jpeg(upright)


def decode_rgb(jpeg: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(jpeg)) as image:
        return np.asarray(image.convert("RGB"), dtype=np.uint8)


def quadrant_means(rgb: np.ndarray, margin: int = 16) -> dict[str, list[float]]:
    """Mean color of each quadrant's interior (edges skipped: JPEG and resize blur them)."""
    height, width = rgb.shape[:2]
    half_h, half_w = height // 2, width // 2
    boxes = {
        "top_left": rgb[margin : half_h - margin, margin : half_w - margin],
        "top_right": rgb[margin : half_h - margin, half_w + margin : width - margin],
        "bottom_left": rgb[half_h + margin : height - margin, margin : half_w - margin],
        "bottom_right": rgb[half_h + margin : height - margin, half_w + margin : width - margin],
    }
    return {
        name: [round(float(v), 2) for v in box.reshape(-1, 3).mean(axis=0)]
        for name, box in boxes.items()
    }


def probe_coords(seed: int = 114, count: int = 32) -> list[tuple[int, int]]:
    rng = np.random.default_rng(seed)
    corners = [(0, 0), (0, IMAGE_SIZE - 1), (IMAGE_SIZE - 1, 0), (IMAGE_SIZE - 1, IMAGE_SIZE - 1)]
    sampled = [(int(r), int(c)) for r, c in rng.integers(0, IMAGE_SIZE, size=(count, 2))]
    return corners + sampled


def build_fixture(exif_jpeg: bytes, upright_jpeg: bytes) -> dict[str, Any]:
    upright_rgb = decode_rgb(upright_jpeg)
    return {
        "schema_version": 1,
        "description": (
            "Portrait photo stored landscape with EXIF orientation 6, and the upright "
            "224x224 JPEG the native resize step must produce. Pixel values are "
            "Pillow decodes; other JPEG decoders may differ by a few levels."
        ),
        "orientation": ORIENTATION,
        "stored_width": STORED_WIDTH,
        "stored_height": STORED_HEIGHT,
        "size": IMAGE_SIZE,
        "quadrant_colors": {name: list(color) for name, color in QUADRANT_COLORS.items()},
        "exif_jpeg_base64": base64.b64encode(exif_jpeg).decode("ascii"),
        "exif_jpeg_sha256": hashlib.sha256(exif_jpeg).hexdigest(),
        "upright_jpeg_base64": base64.b64encode(upright_jpeg).decode("ascii"),
        "upright_quadrant_means": quadrant_means(upright_rgb),
        "upright_probes": [
            {"row": r, "col": c, "rgb": [int(v) for v in upright_rgb[r, c]]}
            for r, c in probe_coords()
        ],
    }


def write_fixture() -> dict[str, Any]:
    """Regenerate the JPEG and the JSON in `ml/fixtures/` and the app's copy of the JSON."""
    exif_jpeg = build_exif_jpeg()
    JPEG_PATH.write_bytes(exif_jpeg)
    fixture = build_fixture(exif_jpeg, build_upright_jpeg(JPEG_PATH))
    text = json.dumps(fixture, indent=2) + "\n"
    JSON_PATH.write_text(text, encoding="utf-8", newline="\n")
    APP_JSON_PATH.write_text(text, encoding="utf-8", newline="\n")
    return fixture


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(description=__doc__).parse_args(argv)
    fixture = write_fixture()
    print(f"Wrote {JPEG_PATH} ({len(fixture['exif_jpeg_base64'])} base64 chars)")
    print(f"Wrote {JSON_PATH} and {APP_JSON_PATH}")
    print("Run `corepack pnpm format` in app/ so the app copy matches Prettier.")
    return 0
