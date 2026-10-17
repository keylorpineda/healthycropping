"""Image integrity verification, EXIF orientation correction, RGB conversion, and resizing."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


@dataclass(frozen=True)
class CandidateSample:
    """A raw dataset sample prior to deduplication and splitting."""

    raw_path: Path
    label: str
    severity: str
    source: str
    group_id: str
    sample_id: str


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
