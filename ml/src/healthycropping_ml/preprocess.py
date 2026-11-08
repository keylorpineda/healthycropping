"""Image integrity verification, EXIF orientation correction, RGB conversion, and resizing."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


@dataclass(frozen=True)
class YoloBBox:
    """Normalized YOLO format bounding box: class_id, x_center, y_center, width, height."""

    class_id: int | str
    x_center: float
    y_center: float
    width: float
    height: float


@dataclass(frozen=True)
class CandidateSample:
    """A raw dataset sample prior to deduplication and splitting."""

    raw_path: Path
    label: str
    severity: str
    source: str
    group_id: str
    sample_id: str
    bbox: YoloBBox | None = None


def parse_yolo_line(line: str) -> YoloBBox | None:
    """Parse a single line from a YOLO format text file.

    Format: `<class_id> <x_center> <y_center> <width> <height>` (all normalized in [0, 1]).
    """
    parts = line.strip().split()
    if len(parts) < 5:
        return None
    try:
        class_id: int | str
        try:
            class_id = int(parts[0])
        except ValueError:
            class_id = parts[0]
        xc = float(parts[1])
        yc = float(parts[2])
        w = float(parts[3])
        h = float(parts[4])
        if w <= 0.0 or h <= 0.0:
            return None
        return YoloBBox(class_id=class_id, x_center=xc, y_center=yc, width=w, height=h)
    except (ValueError, IndexError):
        return None


def crop_yolo_box(
    image: Image.Image,
    bbox: YoloBBox,
    margin: float = 0.05,
    target_size: int = 224,
) -> Image.Image | None:
    """Crop an object bounding box with an optional context margin and resize to target_size."""
    width_px, height_px = image.size
    if width_px <= 0 or height_px <= 0 or bbox.width <= 0 or bbox.height <= 0:
        return None

    xc_px = bbox.x_center * width_px
    yc_px = bbox.y_center * height_px
    bw_px = bbox.width * width_px * (1.0 + margin)
    bh_px = bbox.height * height_px * (1.0 + margin)

    x1 = max(0, round(xc_px - bw_px / 2.0))
    y1 = max(0, round(yc_px - bh_px / 2.0))
    x2 = min(width_px, round(xc_px + bw_px / 2.0))
    y2 = min(height_px, round(yc_px + bh_px / 2.0))

    if x2 <= x1 or y2 <= y1:
        return None

    cropped = image.crop((x1, y1, x2, y2))
    if cropped.size != (target_size, target_size):
        cropped = cropped.resize((target_size, target_size), resample=Image.Resampling.BILINEAR)
    return cropped


def load_clean_rgb_image(path: Path, image_size: int = 224) -> Image.Image | None:
    """Load an image, fix EXIF orientation, convert to 3-channel RGB, and resize to `image_size`.

    Returns `None` if the image file is missing, truncated, or corrupt.
    """
    if not path.is_file():
        return None
    try:
        with Image.open(path) as img:
            img.load()
            transposed = ImageOps.exif_transpose(img)
            rgb = transposed.convert("RGB")
            if rgb.size != (image_size, image_size):
                rgb = rgb.resize((image_size, image_size), resample=Image.Resampling.BILINEAR)
            return rgb
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return None


def load_clean_sample_image(
    cand: CandidateSample,
    image_size: int = 224,
    box_margin: float = 0.05,
) -> Image.Image | None:
    """Load and preprocess a candidate sample, cropping its YOLO bounding box if present."""
    if not cand.raw_path.is_file():
        return None
    try:
        with Image.open(cand.raw_path) as img:
            img.load()
            transposed = ImageOps.exif_transpose(img)
            rgb = transposed.convert("RGB")
            if cand.bbox is not None:
                return crop_yolo_box(rgb, cand.bbox, margin=box_margin, target_size=image_size)
            if rgb.size != (image_size, image_size):
                rgb = rgb.resize((image_size, image_size), resample=Image.Resampling.BILINEAR)
            return rgb
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return None


def image_to_normalized_tensor(
    image: Image.Image,
    mean: tuple[float, float, float] = (127.5, 127.5, 127.5),
    std: tuple[float, float, float] = (127.5, 127.5, 127.5),
) -> np.ndarray:
    """Convert an RGB PIL Image to a float32 `(H, W, 3)` tensor: `(rgb - mean) / std`."""
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    mean_arr = np.asarray(mean, dtype=np.float32).reshape((1, 1, 3))
    std_arr = np.asarray(std, dtype=np.float32).reshape((1, 1, 3))
    return (arr - mean_arr) / std_arr
