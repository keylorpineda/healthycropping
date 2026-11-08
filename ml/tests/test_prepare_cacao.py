"""Unit tests for cacao dataset preparation, YOLO bounding box cropping, and grouped splitting."""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from healthycropping_ml.config import load_crop_config
from healthycropping_ml.preprocess import (
    CandidateSample,
    YoloBBox,
    crop_yolo_box,
    load_clean_sample_image,
    parse_yolo_line,
)
from healthycropping_ml.report import compute_manifest_summary, format_cacao_report_markdown
from healthycropping_ml.split import assign_grouped_stratified_splits, verify_no_group_leakage


def _make_sample_image(
    path: Path,
    size: tuple[int, int] = (400, 300),
    color: tuple[int, int, int] = (80, 140, 50),
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", size, color=color)
    img.save(path, format="JPEG", quality=95)


def test_parse_yolo_line() -> None:
    # Standard numerical class ID
    box1 = parse_yolo_line("1 0.45 0.55 0.30 0.40")
    assert box1 is not None
    assert box1.class_id == 1
    assert box1.x_center == pytest.approx(0.45)
    assert box1.y_center == pytest.approx(0.55)
    assert box1.width == pytest.approx(0.30)
    assert box1.height == pytest.approx(0.40)

    # Named class string
    box2 = parse_yolo_line("monilia 0.20 0.30 0.15 0.25")
    assert box2 is not None
    assert box2.class_id == "monilia"

    # Malformed lines
    assert parse_yolo_line("") is None
    assert parse_yolo_line("1 0.5 0.5") is None  # Missing dimensions
    assert parse_yolo_line("1 not_float 0.5 0.3 0.4") is None
    assert parse_yolo_line("1 0.5 0.5 -0.2 0.3") is None  # Negative width


def test_crop_yolo_box() -> None:
    img = Image.new("RGB", (400, 300), color=(120, 80, 40))
    bbox = YoloBBox(class_id=1, x_center=0.5, y_center=0.5, width=0.4, height=0.4)

    # Standard crop with 5% margin
    cropped = crop_yolo_box(img, bbox, margin=0.05, target_size=224)
    assert cropped is not None
    assert cropped.size == (224, 224)
    assert cropped.mode == "RGB"

    # Corner box near edge to test clamping
    corner_box = YoloBBox(class_id=0, x_center=0.05, y_center=0.05, width=0.2, height=0.2)
    corner_crop = crop_yolo_box(img, corner_box, margin=0.1, target_size=224)
    assert corner_crop is not None
    assert corner_crop.size == (224, 224)

    # Degenerate box
    invalid_box = YoloBBox(class_id=0, x_center=0.5, y_center=0.5, width=0.0, height=0.0)
    assert crop_yolo_box(img, invalid_box) is None


def test_load_clean_sample_image_with_and_without_bbox(tmp_path: Path) -> None:
    img_path = tmp_path / "tree.jpg"
    _make_sample_image(img_path, size=(500, 400))

    # Whole image sample
    cand_whole = CandidateSample(
        raw_path=img_path,
        label="healthy",
        severity="0",
        source="cocoamonilia",
        group_id="cocoa_tree",
        sample_id="cocoa_tree_whole",
        bbox=None,
    )
    whole_clean = load_clean_sample_image(cand_whole, image_size=224)
    assert whole_clean is not None
    assert whole_clean.size == (224, 224)

    # YOLO crop sample
    bbox = YoloBBox(class_id=2, x_center=0.6, y_center=0.4, width=0.3, height=0.3)
    cand_crop = CandidateSample(
        raw_path=img_path,
        label="black_pod",
        severity="2",
        source="unab",
        group_id="unab_tree",
        sample_id="unab_tree_pod0",
        bbox=bbox,
    )
    cropped_clean = load_clean_sample_image(cand_crop, image_size=224, box_margin=0.05)
    assert cropped_clean is not None
    assert cropped_clean.size == (224, 224)


def test_unab_parent_image_grouping_leakage_prevention() -> None:
    # 3 pods cropped from the same photo parent_photo_01
    parent_group = "unab_parent_photo_01"
    items = [
        ("pod_0", "monilia", parent_group),
        ("pod_1", "healthy", parent_group),
        ("pod_2", "monilia", parent_group),
    ]
    # Add other independent trees
    for i in range(20):
        items.append((f"other_pod_{i}", "monilia" if i % 2 == 0 else "healthy", f"other_tree_{i}"))

    records = assign_grouped_stratified_splits(
        items,
        train_ratio=0.70,
        val_ratio=0.15,
        test_ratio=0.15,
        seed=42,
    )
    verify_no_group_leakage(records)

    # Verify that all 3 pods from parent_photo_01 landed in the exact same split
    parent_splits = {r.split for r in records if r.group_id == parent_group}
    assert len(parent_splits) == 1, f"Multi-pod parent leaked across splits: {parent_splits}"


def test_cacao_pipeline_end_to_end_synthetic(tmp_path: Path) -> None:
    import sys

    scripts_dir = str(Path(__file__).resolve().parents[1] / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import prepare_cacao

    # 1. Create synthetic CocoaMonilia structure
    cocoa_raw = tmp_path / "raw_cocoa"
    for label_dir, count in [("h0", 6), ("m1", 4), ("m2", 4), ("m3", 4)]:
        d = cocoa_raw / "cocoapods_images" / label_dir
        d.mkdir(parents=True, exist_ok=True)
        for i in range(count):
            _make_sample_image(
                d / f"cocoa_{label_dir}_{i}.jpg",
                size=(200, 200),
                color=(50 + i * 10, 100, 60),
            )

    # 2. Create synthetic UNAB structure with YOLO boxes
    unab_raw = tmp_path / "raw_unab"
    unab_raw.mkdir(parents=True, exist_ok=True)
    for i in range(10):
        img_file = unab_raw / f"unab_img_{i:03d}.jpg"
        _make_sample_image(img_file, size=(300, 300), color=(70, 50 + i * 15, 80))
        # Label file with 2 pod boxes per photo (0=black_pod, 1=monilia)
        lbl_file = unab_raw / f"unab_img_{i:03d}.txt"
        lbl_file.write_text("0 0.3 0.4 0.25 0.3\n1 0.7 0.6 0.2 0.25\n", encoding="utf-8")

    # 3. Create test config
    config_path = Path(__file__).resolve().parents[1] / "configs" / "cacao.yaml"
    cfg = load_crop_config(config_path)

    out_dir = tmp_path / "processed_cacao"
    res = prepare_cacao.prepare_cacao_dataset(
        cfg,
        output_dir=out_dir,
        cocoamonilia_dir=cocoa_raw,
        unab_dir=unab_raw,
        max_workers=2,
    )

    manifest_csv: Path = res["manifest_csv"]
    assert manifest_csv.is_file()
    assert res["split_records_count"] > 0

    # 4. Generate summary and markdown report
    summary = compute_manifest_summary(manifest_csv, tuple(cfg.classes), min_train_samples=5)
    report_md = format_cacao_report_markdown(summary, res["stats"])
    assert "# Cacao Pod Disease Dataset Report" in report_md
    assert "CocoaMoniliaDataSet" in report_md
    assert "UNAB Cocoa Diseases" in report_md
