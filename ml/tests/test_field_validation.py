"""Tests for the field validation summary (`healthycropping_ml.field_validation`)."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pytest

from healthycropping_ml.field_validation import (
    COLUMNS,
    CropModel,
    FieldValidationError,
    load_crop_models,
    percentile,
    read_samples,
    render_markdown,
    summarize,
)

REPO_ROOT = Path(__file__).resolve().parents[2]

CACAO = CropModel(
    crop="cacao", labels=("healthy", "monilia", "black_pod"), confidence_threshold=0.5
)
MODELS = {"cacao": CACAO}


def _row(
    sample_id: str, reference: str, predicted: str, confidence: float, **extra: str
) -> dict[str, str]:
    row = {
        "sample_id": sample_id,
        "crop": "cacao",
        "region": "Limón",
        "lighting": "shade",
        "capture_source": "camera",
        "reference_condition": reference,
        "predicted_class": predicted,
        "severity": "",
        "confidence": str(confidence),
        "status": "low_confidence" if confidence < 0.5 else "watch",
        "latency_ms": "100",
        "notes": "",
    }
    row.update(extra)
    return row


def _write(path: Path, rows: list[dict[str, str]], columns: tuple[str, ...] = COLUMNS) -> Path:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(columns), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_template_header_matches_columns() -> None:
    template = REPO_ROOT / "docs" / "field_validation" / "results_template.csv"
    with template.open(encoding="utf-8", newline="") as handle:
        assert tuple(next(csv.reader(handle))) == COLUMNS


def test_registries_in_repo_load_for_all_crops() -> None:
    models = load_crop_models(REPO_ROOT / "ml" / "models")
    assert set(models) == {"coffee", "cacao", "banana"}
    for model in models.values():
        assert "healthy" in model.labels
        assert 0.0 < model.confidence_threshold < 1.0


def test_summary_metrics(tmp_path: Path) -> None:
    rows = [
        _row("C1", "healthy", "healthy", 0.9, latency_ms="80"),
        _row("C2", "monilia", "monilia", 0.8, latency_ms="120", lighting="direct_sun"),
        _row("C3", "monilia", "black_pod", 0.7, latency_ms="140", lighting="direct_sun"),
        _row("C4", "black_pod", "black_pod", 0.4, latency_ms="200"),
        _row("C5", "other", "monilia", 0.3, latency_ms="90"),
        _row("C6", "other", "healthy", 0.6, latency_ms="110"),
    ]
    samples = read_samples(_write(tmp_path / "r.csv", rows), MODELS)
    (summary,) = summarize(samples, MODELS)

    assert (summary.samples, summary.in_scope, summary.out_of_scope) == (6, 4, 2)
    assert summary.agreement == pytest.approx(3 / 4)
    assert summary.coverage == pytest.approx(3 / 4)  # C4 is below the threshold
    assert summary.accepted_precision == pytest.approx(2 / 3)  # C1, C2 right; C3 wrong
    assert summary.out_of_scope_rejection == pytest.approx(1 / 2)  # C5 rejected, C6 accepted
    assert summary.per_class_recall == {"healthy": 1.0, "monilia": 0.5, "black_pod": 1.0}
    assert summary.confusion["monilia"] == {"healthy": 0, "monilia": 1, "black_pod": 1}
    assert summary.confusion["other"] == {"healthy": 1, "monilia": 1, "black_pod": 0}
    assert summary.lighting_agreement == {"direct_sun": (2, 0.5), "shade": (2, 1.0)}
    assert summary.latency_p50_ms == 110
    assert summary.latency_p95_ms == 200
    assert summary.status_mismatches == ()


def test_status_mismatch_is_reported(tmp_path: Path) -> None:
    rows = [_row("C1", "healthy", "healthy", 0.9, status="low_confidence")]
    (summary,) = summarize(read_samples(_write(tmp_path / "r.csv", rows), MODELS), MODELS)
    assert summary.status_mismatches == ("C1",)
    assert "`C1`" in render_markdown([summary])


def test_empty_groups_are_not_applicable(tmp_path: Path) -> None:
    rows = [_row("C1", "other", "healthy", 0.2, latency_ms="")]
    (summary,) = summarize(read_samples(_write(tmp_path / "r.csv", rows), MODELS), MODELS)
    assert summary.agreement is None
    assert summary.coverage is None
    assert summary.latency_p50_ms is None
    assert "n/a" in render_markdown([summary])


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"crop": "pineapple"}, "crop"),
        ({"predicted_class": "frosty_pod"}, "predicted_class"),
        ({"reference_condition": "witches_broom"}, "reference_condition"),
        ({"lighting": "night"}, "lighting"),
        ({"capture_source": "drone"}, "capture_source"),
        ({"status": "unknown"}, "status"),
        ({"confidence": "87"}, "between 0 and 1"),
        ({"confidence": "high"}, "not a number"),
        ({"latency_ms": "-5"}, "negative"),
        ({"sample_id": ""}, "sample_id"),
    ],
)
def test_invalid_rows_are_rejected(tmp_path: Path, override: dict[str, str], message: str) -> None:
    rows = [{**_row("C1", "healthy", "healthy", 0.9), **override}]
    with pytest.raises(FieldValidationError, match=message):
        read_samples(_write(tmp_path / "r.csv", rows), MODELS)


def test_missing_columns_and_duplicates_are_rejected(tmp_path: Path) -> None:
    rows = [_row("C1", "healthy", "healthy", 0.9)]
    with pytest.raises(FieldValidationError, match="missing columns"):
        read_samples(_write(tmp_path / "a.csv", rows, COLUMNS[:-1]), MODELS)
    with pytest.raises(FieldValidationError, match="duplicate"):
        read_samples(_write(tmp_path / "b.csv", rows * 2), MODELS)


def test_percentile_nearest_rank() -> None:
    assert percentile([], 50) is None
    assert percentile([5.0], 95) == 5.0
    assert percentile([4.0, 1.0, 3.0, 2.0], 50) == 2.0
    assert percentile([float(x) for x in range(1, 21)], 95) == 19.0


def _cli_main(argv: list[str]) -> int:
    scripts_dir = str(REPO_ROOT / "ml" / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import analyze_field_validation

    return analyze_field_validation.main(argv)


def test_cli_writes_markdown(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    registries = tmp_path / "models"
    (registries / "cacao").mkdir(parents=True)
    (registries / "cacao" / "registry.json").write_text(
        json.dumps({"labels": list(CACAO.labels), "confidence_threshold": 0.5}), encoding="utf-8"
    )
    csv_path = _write(tmp_path / "r.csv", [_row("C1", "healthy", "healthy", 0.9)])
    out = tmp_path / "out" / "summary.md"

    code = _cli_main(
        ["--csv", str(csv_path), "--registries-dir", str(registries), "--out", str(out)]
    )
    assert code == 0
    assert out.read_text(encoding="utf-8") == capsys.readouterr().out
    assert "| Cacao | 1 | 1 | 100.0 %" in out.read_text(encoding="utf-8")


def test_cli_reports_errors(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    csv_path = _write(tmp_path / "r.csv", [_row("C1", "healthy", "healthy", 0.9)])
    code = _cli_main(["--csv", str(csv_path), "--registries-dir", str(tmp_path / "none")])
    assert code == 1
    assert "no registry.json" in capsys.readouterr().err
