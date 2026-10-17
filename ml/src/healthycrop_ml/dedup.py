"""Perceptual-hash (pHash) near-duplicate detection across and within data sources."""

from __future__ import annotations

from dataclasses import dataclass

import imagehash
from PIL import Image


@dataclass(frozen=True)
class HashedItem[T]:
    """An item paired with its hex perceptual hash and group identifier."""

    item: T
    phash_hex: str
    source: str
    group_id: str


@dataclass(frozen=True)
class DuplicatePair[T]:
    """Record of a dropped near-duplicate item and the canonical item it matched."""

    dropped: HashedItem[T]
    kept: HashedItem[T]
    hamming_distance: int


def compute_phash_hex(img: Image.Image, hash_size: int = 8) -> str:
    """Compute the perceptual hash (`imagehash.phash`) of an image as a hex string."""
    return str(imagehash.phash(img, hash_size=hash_size))


def hamming_distance_hex(hash_a: str, hash_b: str) -> int:
    """Compute the bit-level Hamming distance between two equal-length hex hashes."""
    int_a = int(hash_a, 16)
    int_b = int(hash_b, 16)
    return (int_a ^ int_b).bit_count()


def deduplicate_hashed_items[T](
    items: list[HashedItem[T]],
    max_hamming_distance: int = 2,
) -> tuple[list[HashedItem[T]], list[DuplicatePair[T]]]:
    """Remove near-duplicate items whose pHash is within `max_hamming_distance` of a kept item.

    Preserves deterministic input order so the first occurrence is kept as canonical.
    """
    kept: list[HashedItem[T]] = []
    kept_ints: list[int] = []
    dropped: list[DuplicatePair[T]] = []

    for current in items:
        cur_int = int(current.phash_hex, 16)
        match_idx: int | None = None
        match_dist = 0
        for idx, prev_int in enumerate(kept_ints):
            dist = (cur_int ^ prev_int).bit_count()
            if dist <= max_hamming_distance:
                match_idx = idx
                match_dist = dist
                break
        if match_idx is not None:
            dropped.append(
                DuplicatePair(
                    dropped=current,
                    kept=kept[match_idx],
                    hamming_distance=match_dist,
                )
            )
        else:
            kept.append(current)
            kept_ints.append(cur_int)

    return kept, dropped
