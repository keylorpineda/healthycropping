"""Disease classes per crop; mirrors `app/src/ml/models/<crop>/registry.json`."""

from typing import Final

CROP_CLASSES: Final[dict[str, tuple[str, ...]]] = {
    "coffee": (
        "healthy",
        "leaf_rust",
        "leaf_miner",
        "cercospora",
        "brown_leaf_spot",
        "red_spider_mite",
    ),
    "cacao": ("healthy", "monilia", "black_pod"),
    "banana": ("healthy", "black_sigatoka", "fusarium_wilt"),
}

HEALTHY_CLASS: Final = "healthy"


def disease_classes(crop: str) -> tuple[str, ...]:
    """Classes of `crop` that describe a problem (everything except `healthy`)."""
    return tuple(name for name in CROP_CLASSES[crop] if name != HEALTHY_CLASS)
