"""Aggregate Costa Rican field validation results (`docs/FIELD_VALIDATION.md`).

Reads the per-sample CSV recorded on the phone and summarises, per crop, the agreement with
the reference condition, the confidence threshold's coverage and accepted precision, the
rejection of out-of-scope photos, a confusion matrix, a lighting breakdown and latency.
"""

from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

COLUMNS: tuple[str, ...] = (
    "sample_id",
    "crop",
    "region",
    "lighting",
    "capture_source",
    "reference_condition",
    "predicted_class",
    "severity",
    "confidence",
    "status",
    "latency_ms",
    "notes",
)
CROPS: tuple[str, ...] = ("coffee", "cacao", "banana")
LIGHTING: tuple[str, ...] = ("shade", "direct_sun", "overcast", "wet")
CAPTURE_SOURCES: tuple[str, ...] = ("camera", "gallery")
STATUSES: tuple[str, ...] = ("healthy", "watch", "act_now", "low_confidence")
OUT_OF_SCOPE = "other"
"""Reference condition for photos outside the model's classes (other disease, wrong organ)."""


class FieldValidationError(ValueError):
    """Raised when the results CSV or a registry is malformed."""


@dataclass(frozen=True)
class CropModel:
    """The parts of a crop's `registry.json` the analysis needs."""

    crop: str
    labels: tuple[str, ...]
    confidence_threshold: float


@dataclass(frozen=True)
class FieldSample:
    """One validated row of the results CSV."""

    sample_id: str
    crop: str
    region: str
    lighting: str
    capture_source: str
    reference_condition: str
    predicted_class: str
    confidence: float
    status: str
    latency_ms: float | None


@dataclass(frozen=True)
class CropSummary:
    """Aggregate metrics for one crop."""

    crop: str
    threshold: float
    samples: int
    in_scope: int
    out_of_scope: int
    agreement: float | None
    """Top-1 agreement on in-scope samples, ignoring the threshold."""
    coverage: float | None
    """Share of in-scope samples at or above the threshold."""
    accepted_precision: float | None
    """Agreement among in-scope samples at or above the threshold."""
    out_of_scope_rejection: float | None
    """Share of out-of-scope samples below the threshold (shown as "retake")."""
    status_mismatches: tuple[str, ...]
    """Samples whose recorded `low_confidence` status disagrees with the threshold."""
    per_class_recall: dict[str, float | None]
    confusion: dict[str, dict[str, int]]
    """Rows are reference conditions (labels plus `other`), columns predicted labels."""
    lighting_agreement: dict[str, tuple[int, float | None]]
    """In-scope sample count and agreement per lighting condition."""
    latency_p50_ms: float | None
    latency_p95_ms: float | None


def load_crop_models(registries_dir: Path, crops: tuple[str, ...] = CROPS) -> dict[str, CropModel]:
    """Read `registries_dir/<crop>/registry.json` for every crop that has one."""
    models: dict[str, CropModel] = {}
    for crop in crops:
        path = registries_dir / crop / "registry.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        try:
            labels = tuple(str(label) for label in data["labels"])
            threshold = float(data["confidence_threshold"])
        except (KeyError, TypeError, ValueError) as exc:
            raise FieldValidationError(f"{path}: missing labels or confidence_threshold") from exc
        models[crop] = CropModel(crop=crop, labels=labels, confidence_threshold=threshold)
    return models


def _parse_float(value: str, field: str, where: str) -> float:
    try:
        number = float(value)
    except ValueError as exc:
        raise FieldValidationError(f"{where}: {field} is not a number: {value!r}") from exc
    if not math.isfinite(number):
        raise FieldValidationError(f"{where}: {field} is not finite: {value!r}")
    return number


def _require_choice(value: str, choices: tuple[str, ...], field: str, where: str) -> str:
    if value not in choices:
        raise FieldValidationError(f"{where}: {field} {value!r} is not one of {list(choices)}")
    return value


def parse_row(row: dict[str, str], line: int, models: dict[str, CropModel]) -> FieldSample:
    """Validate one CSV row against the allowed values and the crop's labels."""
    values = {key: (row.get(key) or "").strip() for key in COLUMNS}
    sample_id = values["sample_id"]
    where = f"line {line} ({sample_id or 'no sample_id'})"
    if not sample_id:
        raise FieldValidationError(f"{where}: sample_id is empty")

    crop = _require_choice(values["crop"], CROPS, "crop", where)
    model = models.get(crop)
    if model is None:
        raise FieldValidationError(f"{where}: no registry.json found for crop {crop!r}")

    reference = _require_choice(
        values["reference_condition"], (*model.labels, OUT_OF_SCOPE), "reference_condition", where
    )
    predicted = _require_choice(values["predicted_class"], model.labels, "predicted_class", where)

    confidence = _parse_float(values["confidence"], "confidence", where)
    if not 0.0 <= confidence <= 1.0:
        raise FieldValidationError(f"{where}: confidence must be between 0 and 1, got {confidence}")

    latency: float | None = None
    if values["latency_ms"]:
        latency = _parse_float(values["latency_ms"], "latency_ms", where)
        if latency < 0:
            raise FieldValidationError(f"{where}: latency_ms is negative")

    return FieldSample(
        sample_id=sample_id,
        crop=crop,
        region=values["region"],
        lighting=_require_choice(values["lighting"], LIGHTING, "lighting", where),
        capture_source=_require_choice(
            values["capture_source"], CAPTURE_SOURCES, "capture_source", where
        ),
        reference_condition=reference,
        predicted_class=predicted,
        confidence=confidence,
        status=_require_choice(values["status"], STATUSES, "status", where),
        latency_ms=latency,
    )


def read_samples(csv_path: Path, models: dict[str, CropModel]) -> list[FieldSample]:
    """Read and validate every row; sample IDs must be unique."""
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [column for column in COLUMNS if column not in (reader.fieldnames or [])]
        if missing:
            raise FieldValidationError(f"{csv_path}: missing columns {missing}")
        samples = [parse_row(row, index, models) for index, row in enumerate(reader, start=2)]

    duplicates = sorted(
        sample_id
        for sample_id, count in Counter(sample.sample_id for sample in samples).items()
        if count > 1
    )
    if duplicates:
        raise FieldValidationError(f"{csv_path}: duplicate sample_id {duplicates}")
    return samples


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def percentile(values: list[float], pct: float) -> float | None:
    """Nearest-rank percentile (`pct` in 0-100); `None` for an empty list."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[rank - 1]


def summarize_crop(model: CropModel, samples: list[FieldSample]) -> CropSummary:
    """Compute the metrics for one crop's samples."""
    threshold = model.confidence_threshold
    in_scope = [s for s in samples if s.reference_condition != OUT_OF_SCOPE]
    out_of_scope = [s for s in samples if s.reference_condition == OUT_OF_SCOPE]
    correct = [s for s in in_scope if s.predicted_class == s.reference_condition]
    accepted = [s for s in in_scope if s.confidence >= threshold]
    accepted_correct = [s for s in accepted if s.predicted_class == s.reference_condition]
    rejected_oos = [s for s in out_of_scope if s.confidence < threshold]

    mismatches = tuple(
        s.sample_id for s in samples if (s.status == "low_confidence") != (s.confidence < threshold)
    )

    confusion: dict[str, dict[str, int]] = {
        reference: dict.fromkeys(model.labels, 0) for reference in (*model.labels, OUT_OF_SCOPE)
    }
    for sample in samples:
        confusion[sample.reference_condition][sample.predicted_class] += 1

    recall: dict[str, float | None] = {}
    for label in model.labels:
        of_label = [s for s in in_scope if s.reference_condition == label]
        recall[label] = _ratio(sum(s.predicted_class == label for s in of_label), len(of_label))

    by_lighting: dict[str, list[FieldSample]] = defaultdict(list)
    for sample in in_scope:
        by_lighting[sample.lighting].append(sample)
    lighting = {
        name: (
            len(group),
            _ratio(sum(s.predicted_class == s.reference_condition for s in group), len(group)),
        )
        for name, group in sorted(by_lighting.items())
    }

    latencies = [s.latency_ms for s in samples if s.latency_ms is not None]
    return CropSummary(
        crop=model.crop,
        threshold=threshold,
        samples=len(samples),
        in_scope=len(in_scope),
        out_of_scope=len(out_of_scope),
        agreement=_ratio(len(correct), len(in_scope)),
        coverage=_ratio(len(accepted), len(in_scope)),
        accepted_precision=_ratio(len(accepted_correct), len(accepted)),
        out_of_scope_rejection=_ratio(len(rejected_oos), len(out_of_scope)),
        status_mismatches=mismatches,
        per_class_recall=recall,
        confusion=confusion,
        lighting_agreement=lighting,
        latency_p50_ms=percentile(latencies, 50),
        latency_p95_ms=percentile(latencies, 95),
    )


def summarize(samples: list[FieldSample], models: dict[str, CropModel]) -> list[CropSummary]:
    """Summaries for every crop that has at least one sample, in `CROPS` order."""
    return [
        summarize_crop(models[crop], [s for s in samples if s.crop == crop])
        for crop in CROPS
        if crop in models and any(s.crop == crop for s in samples)
    ]


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f} %"


def _ms(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.0f} ms"


def render_markdown(summaries: list[CropSummary]) -> str:
    """Markdown tables ready to paste into section 4 of `docs/FIELD_VALIDATION.md`."""
    lines = [
        "| Crop | Samples | In scope | Agreement | Threshold | Coverage | Accepted precision "
        "| Out-of-scope rejected | Latency p50 / p95 |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for s in summaries:
        lines.append(
            f"| {s.crop.capitalize()} | {s.samples} | {s.in_scope} | {_pct(s.agreement)} "
            f"| {s.threshold:.2f} | {_pct(s.coverage)} | {_pct(s.accepted_precision)} "
            f"| {_pct(s.out_of_scope_rejection)} ({s.out_of_scope}) "
            f"| {_ms(s.latency_p50_ms)} / {_ms(s.latency_p95_ms)} |"
        )

    for s in summaries:
        labels = list(next(iter(s.confusion.values())).keys())
        lines += ["", f"### {s.crop.capitalize()}", ""]
        lines.append("| Reference \\ Predicted | " + " | ".join(f"`{x}`" for x in labels) + " |")
        lines.append("| :--- |" + " ---: |" * len(labels))
        for reference, row in s.confusion.items():
            if reference == OUT_OF_SCOPE and s.out_of_scope == 0:
                continue
            cells = " | ".join(str(row[label]) for label in labels)
            lines.append(f"| `{reference}` | {cells} |")

        recall = ", ".join(f"`{label}` {_pct(v)}" for label, v in s.per_class_recall.items())
        lines += ["", f"- Recall per class: {recall}."]
        if s.lighting_agreement:
            lighting = ", ".join(
                f"`{name}` {_pct(agreement)} (n={count})"
                for name, (count, agreement) in s.lighting_agreement.items()
            )
            lines.append(f"- Agreement by lighting: {lighting}.")
        if s.status_mismatches:
            lines.append(
                "- Recorded status disagrees with the registry threshold for: "
                + ", ".join(f"`{x}`" for x in s.status_mismatches)
                + " (check the app build's registry)."
            )
    return "\n".join(lines) + "\n"
