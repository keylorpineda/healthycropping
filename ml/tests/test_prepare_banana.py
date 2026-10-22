"""Unit tests for banana dataset collection, grouping, preparation, and reporting."""

from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

from PIL import Image

from healthycropping_ml.config import load_crop_config
from healthycropping_ml.remote_zip import ZipEntry
from healthycropping_ml.report import compute_manifest_summary, format_banana_report_markdown

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "ml" / "scripts"


def _load_script(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


prepare_banana = _load_script("prepare_banana")
download_banana_nmaist = _load_script("download_banana_nmaist")
download_bananalsd = _load_script("download_bananalsd")


def _make_image(path: Path, color: tuple[int, int, int], pattern: int = 0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (320, 240), color=color)
    for x in range(0, 320, 8 + pattern):
        for y in range(0, 240, 4):
            img.putpixel((x, y), (255 - color[0], 255 - color[1], 255 - color[2]))
    img.save(path, format="JPEG", quality=95)


def _build_raw_tree(root: Path) -> tuple[Path, Path]:
    lsd = root / "bananalsd" / "BananaLSD"
    for i in range(12):
        _make_image(lsd / "OriginalSet" / "healthy" / f"h{i}.jpg", (40 + 9 * i, 160, 60), i)
        _make_image(lsd / "OriginalSet" / "sigatoka" / f"s{i}.jpg", (120, 90 + 7 * i, 30), i)
    _make_image(lsd / "OriginalSet" / "cordana" / "c0.jpg", (200, 200, 20))
    _make_image(lsd / "OriginalSet" / "pestalotiopsis" / "p0.jpg", (20, 200, 200))
    _make_image(lsd / "AugmentedSet" / "healthy" / "aug0.jpg", (10, 10, 10))

    nm = root / "banana_nmaist"
    for i in range(30):
        _make_image(nm / "fusarium_wilt" / f"FW_{100 + i}.jpg", (150, 120 + 3 * i, 20 + 5 * i), i)
        _make_image(nm / "healthy" / f"HEALTHY_{200 + i}.jpg", (30 + 4 * i, 180, 40), i % 7)
    return root / "bananalsd", nm


def test_banana_config_matches_taxonomy() -> None:
    cfg = load_crop_config(REPO_ROOT / "ml" / "configs" / "banana.yaml")
    assert cfg.classes == ("healthy", "black_sigatoka", "fusarium_wilt")
    assert cfg.seed == 42
    lsd_map = cfg.sources["bananalsd"]["label_map"]
    assert set(lsd_map) == {"healthy", "sigatoka"}
    assert {a["label"] for a in cfg.sources["nmaist"]["archives"]} == set(cfg.classes)


def test_bananalsd_uses_original_set_only_and_skips_unmapped(tmp_path: Path) -> None:
    lsd_root, _ = _build_raw_tree(tmp_path)
    cfg = load_crop_config(REPO_ROOT / "ml" / "configs" / "banana.yaml")
    candidates, unmapped = prepare_banana.collect_bananalsd_candidates(
        lsd_root, cfg.sources["bananalsd"]
    )
    assert len(candidates) == 24
    assert unmapped == 2
    assert all("AugmentedSet" not in str(c.raw_path) for c in candidates)
    assert {c.label for c in candidates} == {"healthy", "black_sigatoka"}


def test_nmaist_group_ids_cluster_consecutive_captures() -> None:
    assert (
        prepare_banana.nmaist_group_id("fusarium_wilt", "FW_285", 10) == "nmaist_fusarium_wilt_b28"
    )
    assert (
        prepare_banana.nmaist_group_id("fusarium_wilt", "FW_289", 10) == "nmaist_fusarium_wilt_b28"
    )
    assert (
        prepare_banana.nmaist_group_id("fusarium_wilt", "FW_290", 10) == "nmaist_fusarium_wilt_b29"
    )
    assert prepare_banana.nmaist_group_id("healthy", "leaf", 10) == "nmaist_healthy_leaf"


def test_prepare_banana_dataset_end_to_end(tmp_path: Path) -> None:
    lsd_root, nm_root = _build_raw_tree(tmp_path / "raw")
    cfg = load_crop_config(REPO_ROOT / "ml" / "configs" / "banana.yaml")
    out_dir = tmp_path / "processed"

    result = prepare_banana.prepare_banana_dataset(
        cfg, output_dir=out_dir, bananalsd_dir=lsd_root, nmaist_dir=nm_root
    )

    stats = result["stats"]
    assert stats["candidates_by_source"] == {"bananalsd": 24, "nmaist": 60}
    assert stats["skipped_unmapped"] == 2
    with result["manifest_csv"].open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == stats["final_images_count"]
    assert {r["split"] for r in rows} == {"train", "val", "test"}
    groups_by_split: dict[str, set[str]] = {}
    for row in rows:
        groups_by_split.setdefault(row["split"], set()).add(row["group_id"])
        img_path = out_dir / row["path"]
        with Image.open(img_path) as img:
            assert img.size == (224, 224)
    assert not (groups_by_split["train"] & groups_by_split["test"])
    assert not (groups_by_split["train"] & groups_by_split["val"])

    summary = compute_manifest_summary(result["manifest_csv"], cfg.classes)
    report = format_banana_report_markdown(summary, stats)
    assert "# Banana Leaf Disease Dataset Report" in report
    assert "`fusarium_wilt`" in report
    assert "AugmentedSet" in report


def test_nmaist_selection_skips_directories_and_macos_metadata() -> None:
    entries = [
        ZipEntry("HEALTHY-1/", 0, 0, 0, 0, 0),
        ZipEntry("HEALTHY-1/HEALTHY_2.jpg", 8, 0, 10, 10, 300),
        ZipEntry("__MACOSX/HEALTHY-1/._HEALTHY_2.jpg", 8, 0, 10, 10, 900),
        ZipEntry("HEALTHY-1/HEALTHY_1.jpg", 8, 0, 10, 10, 100),
        ZipEntry("HEALTHY-1/notes.txt", 8, 0, 10, 10, 500),
    ]
    selected = download_banana_nmaist.select_image_entries(entries, max_images=5)
    assert [e.name for e in selected] == ["HEALTHY-1/HEALTHY_1.jpg", "HEALTHY-1/HEALTHY_2.jpg"]
    assert len(download_banana_nmaist.select_image_entries(entries, max_images=1)) == 1
    assert download_banana_nmaist.archive_url("7670326", "BLACK SIGATOKA-2.zip").endswith(
        "/files/BLACK%20SIGATOKA-2.zip/content"
    )


def test_bananalsd_validation_counts_original_set(tmp_path: Path) -> None:
    lsd_root, _ = _build_raw_tree(tmp_path)
    result = download_bananalsd.validate_bananalsd_dir(lsd_root)
    assert result["valid"] is True
    assert result["counts"]["healthy"] == 12
    assert result["counts"]["sigatoka"] == 12
    assert download_bananalsd.validate_bananalsd_dir(tmp_path / "missing")["valid"] is False
