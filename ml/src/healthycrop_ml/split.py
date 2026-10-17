"""Grouped and label-stratified 70/15/15 dataset splitting with zero group leakage."""

from __future__ import annotations

import random
from collections import Counter, defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class SplitRecord[T]:
    """A dataset item assigned to a specific split (`train`, `val`, or `test`)."""

    item: T
    label: str
    group_id: str
    split: str


def assign_grouped_stratified_splits[T](
    items: list[tuple[T, str, str]],
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
) -> list[SplitRecord[T]]:
    """Split `(item, label, group_id)` records into `train`, `val`, and `test`.

    Guarantees:
    1. Zero `group_id` overlap across `train`, `val`, and `test`.
    2. Stratification by each group's majority class label so every class with >= 3 groups
       appears in all 3 splits at approximately `train_ratio : val_ratio : test_ratio`.
    3. Deterministic output for a given `seed`.
    """
    if abs((train_ratio + val_ratio + test_ratio) - 1.0) > 1e-6:
        raise ValueError("Split ratios must sum to 1.0")

    group_to_entries: dict[str, list[tuple[T, str, str]]] = defaultdict(list)
    for entry in items:
        group_to_entries[entry[2]].append(entry)

    # Determine primary stratification label for each group (majority label, tie-broken by name)
    label_to_groups: dict[str, list[str]] = defaultdict(list)
    for gid in sorted(group_to_entries.keys()):
        counts = Counter(e[1] for e in group_to_entries[gid])
        primary_label = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        label_to_groups[primary_label].append(gid)

    rng = random.Random(seed)
    group_split: dict[str, str] = {}

    for label in sorted(label_to_groups.keys()):
        gids = list(label_to_groups[label])
        rng.shuffle(gids)
        total_imgs = sum(len(group_to_entries[g]) for g in gids)
        target_val = max(1, round(total_imgs * val_ratio)) if len(gids) >= 3 else 0
        target_test = max(1, round(total_imgs * test_ratio)) if len(gids) >= 2 else 0

        val_count = 0
        test_count = 0
        for idx, gid in enumerate(gids):
            g_size = len(group_to_entries[gid])
            remaining_groups = len(gids) - idx
            if val_count < target_val and remaining_groups >= 2:
                group_split[gid] = "val"
                val_count += g_size
            elif test_count < target_test and remaining_groups >= 1:
                group_split[gid] = "test"
                test_count += g_size
            else:
                group_split[gid] = "train"

    results: list[SplitRecord[T]] = [
        SplitRecord(
            item=item,
            label=label,
            group_id=gid,
            split=group_split[gid],
        )
        for item, label, gid in items
    ]

    verify_no_group_leakage(results)
    return results


def verify_no_group_leakage[T](records: list[SplitRecord[T]]) -> None:
    """Raise ValueError if any `group_id` appears in more than one split."""
    split_groups: dict[str, set[str]] = {"train": set(), "val": set(), "test": set()}
    for rec in records:
        if rec.split not in split_groups:
            raise ValueError(f"Unknown split name: {rec.split}")
        split_groups[rec.split].add(rec.group_id)

    train_val = split_groups["train"] & split_groups["val"]
    train_test = split_groups["train"] & split_groups["test"]
    val_test = split_groups["val"] & split_groups["test"]
    if train_val or train_test or val_test:
        raise ValueError(
            f"Group leakage detected! train&val={train_val}, "
            f"train&test={train_test}, val&test={val_test}"
        )
