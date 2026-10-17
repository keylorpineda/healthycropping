"""Evaluation metrics, balanced class weights, and confusion-matrix PNG rendering."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


@dataclass(frozen=True)
class ClassMetrics:
    """Precision, recall, F1, and sample support for a single class."""

    precision: float
    recall: float
    f1: float
    support: int


@dataclass(frozen=True)
class EvaluationMetrics:
    """Full evaluation summary on a dataset split."""

    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    per_class: dict[str, ClassMetrics]
    confusion_matrix: list[list[int]]

    def to_dict(self) -> dict[str, Any]:
        """Serialize evaluation metrics to a JSON-compatible dictionary."""
        return {
            "accuracy": round(self.accuracy, 4),
            "macro_precision": round(self.macro_precision, 4),
            "macro_recall": round(self.macro_recall, 4),
            "macro_f1": round(self.macro_f1, 4),
            "per_class": {
                cls_name: {
                    "precision": round(m.precision, 4),
                    "recall": round(m.recall, 4),
                    "f1": round(m.f1, 4),
                    "support": m.support,
                }
                for cls_name, m in self.per_class.items()
            },
            "confusion_matrix": self.confusion_matrix,
        }


def compute_balanced_class_weights(
    y_indices: Sequence[int],
    num_classes: int,
) -> dict[int, float]:
    """Compute inverse-frequency balanced class weights: `N / (num_classes * count_c)`."""
    if not y_indices:
        return {idx: 1.0 for idx in range(num_classes)}
    counts = Counter(y_indices)
    total = len(y_indices)
    weights: dict[int, float] = {}
    for cls_idx in range(num_classes):
        cnt = counts.get(cls_idx, 0)
        weights[cls_idx] = total / (num_classes * cnt) if cnt > 0 else 1.0
    return weights


def evaluate_predictions(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    classes: Sequence[str],
) -> EvaluationMetrics:
    """Compute per-class precision/recall/F1, macro-F1, accuracy, and confusion matrix."""
    if len(y_true) != len(y_pred):
        raise ValueError(f"Length mismatch: y_true ({len(y_true)}) != y_pred ({len(y_pred)})")

    num_classes = len(classes)
    matrix: list[list[int]] = [[0 for _ in range(num_classes)] for _ in range(num_classes)]
    correct = 0

    for t_idx, p_idx in zip(y_true, y_pred, strict=True):
        if 0 <= t_idx < num_classes and 0 <= p_idx < num_classes:
            matrix[t_idx][p_idx] += 1
        if t_idx == p_idx:
            correct += 1

    total = len(y_true)
    accuracy = correct / total if total > 0 else 0.0

    per_class: dict[str, ClassMetrics] = {}
    precisions: list[float] = []
    recalls: list[float] = []
    f1s: list[float] = []

    for idx, cls_name in enumerate(classes):
        tp = matrix[idx][idx]
        support = sum(matrix[idx])
        predicted_pos = sum(matrix[r][idx] for r in range(num_classes))

        precision = tp / predicted_pos if predicted_pos > 0 else 0.0
        recall = tp / support if support > 0 else 0.0
        f1 = (2.0 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        per_class[cls_name] = ClassMetrics(
            precision=precision,
            recall=recall,
            f1=f1,
            support=support,
        )
        precisions.append(precision)
        recalls.append(recall)
        f1s.append(f1)

    macro_p = sum(precisions) / num_classes if num_classes > 0 else 0.0
    macro_r = sum(recalls) / num_classes if num_classes > 0 else 0.0
    macro_f1 = sum(f1s) / num_classes if num_classes > 0 else 0.0

    return EvaluationMetrics(
        accuracy=accuracy,
        macro_precision=macro_p,
        macro_recall=macro_r,
        macro_f1=macro_f1,
        per_class=per_class,
        confusion_matrix=matrix,
    )


def render_confusion_matrix_png(
    confusion: Sequence[Sequence[int]],
    classes: Sequence[str],
    title: str,
    output_png: Path,
) -> Path:
    """Render a high-contrast confusion matrix PNG with counts and row percentages."""
    num_classes = len(classes)
    cell_size = 76
    left_margin = 165
    top_margin = 75
    right_margin = 30
    bottom_margin = 45

    width = left_margin + num_classes * cell_size + right_margin
    height = top_margin + num_classes * cell_size + bottom_margin

    canvas = Image.new("RGB", (width, height), color=(248, 250, 246))
    draw = ImageDraw.Draw(canvas)

    # Header bar
    draw.rectangle([(0, 0), (width, 32)], fill=(27, 67, 50))
    draw.text((12, 9), title, fill=(255, 255, 255))

    # Column headers (Predicted)
    draw.text((left_margin + 4, 38), "Predicted Class ->", fill=(45, 106, 79))
    for col_idx, cls_name in enumerate(classes):
        x_center = left_margin + col_idx * cell_size + 6
        short_label = cls_name[:11]
        draw.text((x_center, 55), short_label, fill=(27, 67, 50))

    max_val = max((max(row) for row in confusion), default=1)
    if max_val <= 0:
        max_val = 1

    for row_idx, cls_name in enumerate(classes):
        y_top = top_margin + row_idx * cell_size
        draw.text((12, y_top + cell_size // 2 - 6), cls_name, fill=(27, 67, 50))
        row_sum = sum(confusion[row_idx])

        for col_idx in range(num_classes):
            x_left = left_margin + col_idx * cell_size
            count = confusion[row_idx][col_idx]
            pct = (count / row_sum * 100.0) if row_sum > 0 else 0.0

            intensity = count / max_val
            if row_idx == col_idx:
                # Green tint for diagonal
                r = int(235 - 175 * intensity)
                g = int(245 - 120 * intensity)
                b = int(235 - 165 * intensity)
            else:
                # Warm amber/terracotta tint for off-diagonal errors
                r = int(252 - 40 * intensity)
                g = int(248 - 140 * intensity)
                b = int(244 - 160 * intensity)

            draw.rectangle(
                [(x_left, y_top), (x_left + cell_size - 1, y_top + cell_size - 1)],
                fill=(r, g, b),
                outline=(180, 195, 180),
            )
            text_color = (
                (255, 255, 255) if (row_idx == col_idx and intensity > 0.55) else (25, 35, 25)
            )
            draw.text((x_left + 16, y_top + 20), f"{count}", fill=text_color)
            draw.text((x_left + 12, y_top + 38), f"({pct:.0f}%)", fill=text_color)

    draw.text(
        (12, height - 28),
        "Rows = True Class | Columns = Predicted Class",
        fill=(85, 100, 85),
    )

    output_png.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_png, format="PNG", optimize=True)
    return output_png
