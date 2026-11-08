"""EXIF orientation fixture: training preprocessing must see the photo upright."""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

import numpy as np
from PIL import Image

from healthycropping_ml.exif_fixture import (
    APP_JSON_PATH,
    JPEG_PATH,
    JSON_PATH,
    ORIENTATION,
    ORIENTATION_TAG,
    QUADRANT_COLORS,
    build_fixture,
    build_upright_jpeg,
    quadrant_means,
)
from healthycropping_ml.preprocess import image_to_normalized_tensor, load_clean_rgb_image

# Solid-color interiors survive JPEG at quality 95 within a few levels.
COLOR_TOLERANCE = 6.0


def _fixture() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    return data


def _assert_quadrants(means: dict[str, list[float]], expected: dict[str, Any]) -> None:
    for name, color in expected.items():
        assert np.allclose(means[name], color, atol=COLOR_TOLERANCE), (name, means[name], color)


def test_jpeg_is_stored_landscape_with_orientation_6() -> None:
    with Image.open(JPEG_PATH) as image:
        assert image.size == (224, 168)
        assert image.getexif().get(ORIENTATION_TAG) == ORIENTATION


def test_json_embeds_the_committed_jpeg_and_app_copy_matches() -> None:
    fixture = _fixture()
    jpeg = JPEG_PATH.read_bytes()
    assert base64.b64decode(fixture["exif_jpeg_base64"]) == jpeg
    assert fixture["exif_jpeg_sha256"] == hashlib.sha256(jpeg).hexdigest()
    assert json.loads(APP_JSON_PATH.read_text(encoding="utf-8")) == fixture


def test_loader_applies_exif_orientation_before_resizing() -> None:
    upright = load_clean_rgb_image(JPEG_PATH)
    assert upright is not None
    rgb = np.asarray(upright, dtype=np.uint8)
    assert rgb.shape == (224, 224, 3)
    _assert_quadrants(quadrant_means(rgb), QUADRANT_COLORS)


def test_ignoring_exif_would_rotate_the_photo() -> None:
    """Guards the fixture itself: without the tag, red is no longer top-left."""
    with Image.open(JPEG_PATH) as image:
        raw = np.asarray(image.convert("RGB").resize((224, 224)), dtype=np.uint8)
    means = quadrant_means(raw)
    assert not np.allclose(means["top_left"], QUADRANT_COLORS["top_left"], atol=COLOR_TOLERANCE)
    # Stored pixels are the upright view turned 90 degrees counter-clockwise.
    assert np.allclose(means["top_left"], QUADRANT_COLORS["top_right"], atol=COLOR_TOLERANCE)


def test_upright_reference_matches_the_loader_and_training_tensor() -> None:
    fixture = _fixture()
    upright = load_clean_rgb_image(JPEG_PATH)
    assert upright is not None
    loaded = np.asarray(upright, dtype=np.int16)
    for probe in fixture["upright_probes"]:
        # The reference went through one more JPEG round trip (measured max difference: 2).
        assert np.all(np.abs(loaded[probe["row"], probe["col"]] - probe["rgb"]) <= 4), probe
    _assert_quadrants(fixture["upright_quadrant_means"], fixture["quadrant_colors"])

    tensor = image_to_normalized_tensor(upright)
    assert tensor.shape == (224, 224, 3)
    assert float(tensor.min()) >= -1.0
    assert float(tensor.max()) <= 1.0


def test_fixture_is_rebuilt_from_the_committed_jpeg() -> None:
    """Probes and quadrant means are a pure function of the committed JPEG bytes."""
    rebuilt = build_fixture(JPEG_PATH.read_bytes(), build_upright_jpeg(JPEG_PATH))
    fixture = _fixture()
    for key in ("orientation", "stored_width", "stored_height", "size", "quadrant_colors"):
        assert rebuilt[key] == fixture[key]
    _assert_quadrants(rebuilt["upright_quadrant_means"], fixture["quadrant_colors"])
