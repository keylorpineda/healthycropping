"""Build the animated README card (`docs/assets/readme-{light,dark}.svg`) and its tab buttons.

The card is a field-notebook / herbarium sheet drawn in SVG with CSS animations only (GitHub
strips scripts from images). Model numbers are read from `ml/models/<crop>/registry.json`, so the
card cannot drift from the exported models. Rebuild after a model or status change:

    cd ml && uv run python scripts/build_readme_card.py
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

REPO_ROOT = Path(__file__).resolve().parents[2]
WIDTH = 800
SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
MONO = "ui-monospace, 'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', monospace"


@dataclass(frozen=True)
class Palette:
    """Colours for one theme (values follow `app/src/theme/colors.ts`)."""

    name: str
    paper: str
    card: str
    ink: str
    muted: str
    rule: str
    accent: str
    deep: str
    leaf: str
    leaf_light: str
    vein: str
    rust: str
    coffee: str
    cacao: str
    banana: str
    healthy: str
    watch: str
    act: str
    low: str
    tape: str
    scan: str


LIGHT = Palette(
    name="light",
    paper="#F3EBDA",
    card="#FBF7EE",
    ink="#1F2A22",
    muted="#5C5146",
    rule="#C9B99A",
    accent="#2D7A4F",
    deep="#1B3B2B",
    leaf="#2D7A4F",
    leaf_light="#3D9E67",
    vein="#C2F3D6",
    rust="#D97706",
    coffee="#C0392B",
    cacao="#B45309",
    banana="#4D7C0F",
    healthy="#15803D",
    watch="#B45309",
    act="#B91C1C",
    low="#475569",
    tape="#E6D3A3",
    scan="#E74C3C",
)
DARK = Palette(
    name="dark",
    paper="#0E1F16",
    card="#142E21",
    ink="#E8E2DC",
    muted="#AE9F93",
    rule="#3A5A47",
    accent="#5FBE86",
    deep="#8FE0B0",
    leaf="#3D9E67",
    leaf_light="#5FBE86",
    vein="#E6FAEE",
    rust="#F59E0B",
    coffee="#E74C3C",
    cacao="#F59E0B",
    banana="#84CC16",
    healthy="#4ADE80",
    watch="#FBBF24",
    act="#F87171",
    low="#94A3B8",
    tape="#4D423A",
    scan="#F87171",
)


@dataclass(frozen=True)
class CropFacts:
    """What the card shows for one crop's model."""

    crop: str
    common: str
    latin: str
    organ: str
    labels: tuple[str, ...]
    test_accuracy: float
    macro_f1: float
    threshold: float
    coverage: float
    size_mb: float


# Test macro-F1 of the exported TFLite models, from docs/EXPERIMENTS.md (not in the registries).
MACRO_F1 = {"coffee": 0.7222, "cacao": 0.8502, "banana": 0.9731}
CROP_TEXT = {
    "coffee": ("Coffee", "Coffea arabica", "leaf, underside"),
    "cacao": ("Cacao", "Theobroma cacao", "pod"),
    "banana": ("Banana", "Musa spp.", "leaf blade"),
}
PHASES: tuple[tuple[str, str, bool], ...] = (
    ("0", "Repo & community", True),
    ("1", "Coffee data", True),
    ("2", "Coffee model", True),
    ("3", "App shell", True),
    ("4", "Camera & history", True),
    ("5", "Cacao & banana", True),
    ("6", "Accounts & sync", True),
    ("7", "Gemini RAG", True),
    ("8", "Field validation", False),
)


def load_crop_facts(models_dir: Path) -> list[CropFacts]:
    """Read the three registries into the numbers shown on the card."""
    facts = []
    for crop in ("coffee", "cacao", "banana"):
        data = json.loads((models_dir / crop / "registry.json").read_text(encoding="utf-8"))
        metrics = data["metrics"]
        common, latin, organ = CROP_TEXT[crop]
        facts.append(
            CropFacts(
                crop=crop,
                common=common,
                latin=latin,
                organ=organ,
                labels=tuple(data["labels"]),
                test_accuracy=float(metrics["tflite_test_accuracy"]),
                macro_f1=MACRO_F1[crop],
                threshold=float(data["confidence_threshold"]),
                coverage=float(metrics["threshold_test"]["coverage"]),
                size_mb=int(data["model_size_bytes"]) / 1_000_000,
            )
        )
    return facts


def t(
    x: float,
    y: float,
    text: str,
    cls: str,
    anchor: str = "start",
    extra: str = "",
) -> str:
    """One `<text>` element with escaped content."""
    a = "" if anchor == "start" else f' text-anchor="{anchor}"'
    return f'<text x="{x:g}" y="{y:g}" class="{cls}"{a}{extra}>{escape(text)}</text>'


def coffee_leaf(cx: float, cy: float, scale: float, p: Palette, cls: str = "") -> str:
    """A coffee leaf: elliptic blade with a pointed tip, midrib and paired veins."""
    veins = "".join(
        f'<path d="M0,{y} Q{side * w * 0.5},{y - 14} {side * w},{y - 34}" />'
        for y, w in ((-80, 34), (-45, 50), (-10, 58), (25, 56), (60, 44), (95, 26))
        for side in (-1, 1)
    )
    c = f' class="{cls}"' if cls else ""
    return (
        f'<g transform="translate({cx:g},{cy:g}) scale({scale:g})"{c}>'
        f'<path d="M0,-150 C78,-112 92,40 0,150 C-92,40 -78,-112 0,-150 Z" fill="{p.leaf}"/>'
        f'<path d="M0,-150 C40,-118 60,-40 52,20" fill="none" stroke="{p.leaf_light}" '
        'stroke-width="10" opacity=".55"/>'
        f'<g fill="none" stroke="{p.vein}" stroke-width="2.4" stroke-linecap="round" '
        f'opacity=".75"><path d="M0,-140 L0,150" />{veins}</g>'
        "</g>"
    )


def cacao_pod(cx: float, cy: float, scale: float, p: Palette) -> str:
    """A cacao pod: ridged ellipse on a short stalk."""
    ridges = "".join(f'<path d="M{x},-70 Q{x * 1.25},0 {x},70" />' for x in (-26, -12, 0, 12, 26))
    return (
        f'<g transform="translate({cx:g},{cy:g}) scale({scale:g})">'
        f'<rect x="-4" y="-98" width="8" height="22" rx="3" fill="{p.muted}"/>'
        f'<ellipse cx="0" cy="0" rx="44" ry="80" fill="{p.cacao}"/>'
        f'<ellipse cx="-14" cy="-20" rx="12" ry="40" fill="#FFFFFF" opacity=".16"/>'
        f'<g fill="none" stroke="{p.deep}" stroke-width="2" opacity=".35">{ridges}</g>'
        "</g>"
    )


def banana_leaf(cx: float, cy: float, scale: float, p: Palette) -> str:
    """A banana leaf blade: long oblong with oblique parallel veins."""
    veins = "".join(
        f'<path d="M0,{y} L{side * 40},{y - 26}" />'
        for y in range(-90, 100, 18)
        for side in (-1, 1)
    )
    return (
        f'<g transform="translate({cx:g},{cy:g}) scale({scale:g}) rotate(-18)">'
        f'<path d="M0,-120 C46,-100 48,90 0,120 C-48,90 -46,-100 0,-120 Z" fill="{p.banana}"/>'
        f'<g fill="none" stroke="{p.vein}" stroke-width="1.6" opacity=".55">'
        f'<path d="M0,-118 L0,118" stroke-width="3"/>{veins}</g>'
        "</g>"
    )


def style(p: Palette) -> str:
    """CSS for text classes and all animations; reduced motion shows the final frame."""
    return f"""<style>
.k {{ font: 700 13px {MONO}; fill: {p.muted}; letter-spacing: 3px; }}
.title {{ font: 700 60px {SERIF}; fill: {p.ink}; }}
.tag {{ font: italic 400 23px {SERIF}; fill: {p.muted}; }}
.h {{ font: 700 30px {SERIF}; fill: {p.ink}; }}
.b {{ font: 400 19px {SERIF}; fill: {p.ink}; }}
.m {{ font: 400 17px {SERIF}; fill: {p.muted}; }}
.it {{ font: italic 400 17px {SERIF}; fill: {p.muted}; }}
.d {{ font: 700 15px {MONO}; fill: {p.ink}; }}
.ds {{ font: 600 13px {MONO}; fill: {p.muted}; }}
.big {{ font: 700 44px {MONO}; fill: {p.accent}; }}
.stamp {{ font: 800 15px {MONO}; letter-spacing: 2px; }}
.pill {{ font: 700 13px {MONO}; fill: {p.card}; letter-spacing: 1px; }}
.num {{ font: 700 13px {MONO}; fill: {p.card}; }}
.fb {{ transform-box: fill-box; transform-origin: center; }}
.fl {{ transform-box: fill-box; transform-origin: left center; }}
.scan {{ animation: scan 3.2s ease-in-out infinite alternate; }}
.spot {{ animation: spot 6.4s ease-out infinite both; }}
.box {{ animation: box 6.4s ease-out infinite both; }}
.blink {{ animation: blink 1.2s steps(1) infinite; }}
.sway {{ animation: sway 5s ease-in-out infinite alternate; }}
.drift {{ animation: drift 14s linear infinite; }}
.rise {{ animation: rise .9s cubic-bezier(.2,.7,.2,1) both; }}
.pkt {{ animation: pkt 10s linear infinite; }}
.node {{ animation: node 10s steps(1) infinite; }}
.bar {{ animation: bar 9s cubic-bezier(.2,.7,.2,1) infinite both; }}
.stp {{ animation: stp 12s cubic-bezier(.2,.9,.3,1.4) infinite both; }}
.chk {{ stroke-dasharray: 30; animation: chk 12s ease-out infinite both; }}
.pulse {{ animation: pulse 1.8s ease-in-out infinite; }}
.cyc {{ animation: cyc 12s steps(1) infinite; }}
.meter {{ animation: meter 12s ease-out infinite both; }}
@keyframes scan {{ from {{ transform: translateY(-150px); }}
  to {{ transform: translateY(150px); }} }}
@keyframes spot {{ 0%, 30% {{ opacity: 0; transform: scale(.2); }} 40%, 90% {{ opacity: 1;
  transform: scale(1); }} 100% {{ opacity: 0; transform: scale(1); }} }}
@keyframes box {{ 0%, 55% {{ opacity: 0; }} 62%, 92% {{ opacity: 1; }} 100% {{ opacity: 0; }} }}
@keyframes blink {{ 50% {{ opacity: .15; }} }}
@keyframes sway {{ from {{ transform: rotate(-3deg); }} to {{ transform: rotate(3deg); }} }}
@keyframes drift {{ 0% {{ transform: translate(0,-40px) rotate(0); opacity: 0; }}
  10% {{ opacity: .5; }} 90% {{ opacity: .5; }}
  100% {{ transform: translate(-120px,420px) rotate(320deg); opacity: 0; }} }}
@keyframes rise {{ from {{ opacity: 0; transform: translateY(14px); }} }}
@keyframes pkt {{ 0% {{ transform: translateX(0); }}
  80%, 100% {{ transform: translateX(608px); }} }}
@keyframes node {{ 0% {{ opacity: .28; }} 20%, 100% {{ opacity: 0; }} }}
@keyframes bar {{ 0% {{ transform: scaleX(0); }} 25%, 100% {{ transform: scaleX(1); }} }}
@keyframes stp {{ 0% {{ opacity: 0; transform: scale(1.8) rotate(-8deg); }}
  6%, 100% {{ opacity: 1; transform: scale(1) rotate(-4deg); }} }}
@keyframes chk {{ 0% {{ stroke-dashoffset: 30; }} 5%, 100% {{ stroke-dashoffset: 0; }} }}
@keyframes pulse {{ 50% {{ opacity: .35; }} }}
@keyframes cyc {{ 0% {{ opacity: 1; }} 25%, 100% {{ opacity: 0; }} }}
@keyframes meter {{ 0% {{ transform: scaleX(0); }} 15%, 100% {{ transform: scaleX(1); }} }}
@media (prefers-reduced-motion: reduce) {{
  * {{ animation: none !important; }}
  .pkt, .scan {{ display: none; }}
}}
</style>"""


def section_header(y: float, kicker: str, title: str) -> str:
    """Kicker line, section title and a short rule."""
    return (
        t(64, y, kicker, "k")
        + t(64, y + 40, title, "h")
        + f'<rect x="64" y="{y + 56:g}" width="64" height="4" class="accent-fill"/>'
    )


def header(p: Palette) -> tuple[str, float]:
    """Title block with the scanned coffee leaf."""
    leaves = "".join(
        f'<g class="drift" style="animation-delay:{d}s">'
        f'<path d="M{x},40 c8,-6 18,-2 20,8 c-8,6 -18,2 -20,-8 z" fill="{p.leaf_light}" '
        'opacity=".5"/></g>'
        for x, d in ((470, 0), (560, -4), (650, -8), (730, -11))
    )
    spots = "".join(
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="{p.rust}" class="spot fb" '
        f'style="animation-delay:{delay}s"/>'
        for x, y, r, delay in (
            (-30, -40, 9, 0),
            (22, -10, 7, 0.15),
            (-14, 30, 11, 0.3),
            (30, 60, 6, 0.45),
            (-36, 80, 7, 0.6),
        )
    )
    leaf = (
        '<g transform="translate(610,300)">'
        '<g class="sway fb">' + coffee_leaf(0, 0, 1, p) + f"<g>{spots}</g>" + '<g class="box">'
        f'<path d="M-62,-70 h-14 v14 M62,-70 h14 v14 M-62,110 h-14 v-14 M62,110 h14 v-14" '
        f'fill="none" stroke="{p.scan}" stroke-width="3"/>'
        f'<rect x="-66" y="122" width="132" height="26" rx="4" fill="{p.scan}"/>'
        + t(0, 140, "leaf_rust 0.92", "num", "middle")
        + "</g></g>"
        f'<g class="scan"><rect x="-110" y="-2" width="220" height="3" fill="{p.scan}"/>'
        f'<rect x="-110" y="-26" width="220" height="24" fill="{p.scan}" opacity=".12"/></g>'
        "</g>"
    )
    pill = (
        f'<rect x="64" y="372" width="250" height="34" rx="17" fill="{p.deep}"/>'
        f'<circle cx="86" cy="389" r="6" fill="{p.healthy}" class="blink"/>'
        + t(102, 394, "AIRPLANE MODE · 0 B SENT", "pill")
    )
    body = (
        f"<g>{leaves}</g>"
        + t(64, 100, "FIELD NOTEBOOK · COSTA RICA · SHEET 01", "k")
        + t(60, 172, "Healthy", "title")
        + t(60, 236, "Cropping", "title")
        + t(64, 284, "Crop disease diagnosis that", "tag")
        + t(64, 314, "works where the signal doesn't.", "tag")
        + t(64, 350, "Coffee · cacao · banana, on the phone.", "m")
        + pill
        + leaf
    )
    return body, 500


def stats(y: float, p: Palette, facts: list[CropFacts]) -> tuple[str, float]:
    """Four specimen-label tiles with the headline numbers."""
    n_classes = sum(len(f.labels) for f in facts)
    size = max(f.size_mb for f in facts)
    tiles = (
        ("3", "crops,", "one model each"),
        (str(n_classes), "health and", "disease classes"),
        (f"{size:.1f}", "MB per model,", "float16"),
        ("0", "network calls", "to diagnose"),
    )
    out = ""
    for i, (num, label, label2) in enumerate(tiles):
        x = 64 + i * 172
        out += (
            f'<g class="rise" style="animation-delay:{0.2 + i * 0.15:.2f}s">'
            f'<rect x="{x}" y="{y}" width="156" height="118" rx="6" fill="{p.card}" '
            f'stroke="{p.rule}" stroke-width="1.5"/>'
            f'<rect x="{x}" y="{y}" width="156" height="8" rx="3" fill="{p.accent}"/>'
            + t(x + 16, y + 66, num, "big")
            + t(x + 16, y + 90, label, "ds")
            + t(x + 16, y + 106, label2, "ds")
            + "</g>"
        )
    return out, y + 160


def pipeline(y: float, p: Palette) -> tuple[str, float]:
    """How a scan works: five nodes with a travelling packet."""
    nodes = (
        ("PHOTO", "camera or", "gallery"),
        ("224 x 224", "RGB, same", "math as training"),
        ("TFLITE", "MobileNetV3", "float16"),
        ("VERDICT", "class, severity,", "confidence"),
        ("ADVICE", "cited manuals,", "when online"),
    )
    out = section_header(y, "HOW A SCAN WORKS", "Five steps, four of them offline")
    top = y + 100
    out += (
        f'<line x1="110" y1="{top + 40}" x2="566" y2="{top + 40}" stroke="{p.rule}" '
        'stroke-width="3"/>'
        f'<line x1="566" y1="{top + 40}" x2="718" y2="{top + 40}" stroke="{p.rule}" '
        'stroke-width="3" stroke-dasharray="8 7"/>'
    )
    for i, (name, l1, l2) in enumerate(nodes):
        cx = 110 + i * 152
        dashed = ' stroke-dasharray="6 5"' if i == 4 else ""
        out += (
            f'<circle cx="{cx}" cy="{top + 40}" r="34" fill="{p.card}" stroke="{p.accent}" '
            f'stroke-width="3"{dashed}/>'
            f'<circle cx="{cx}" cy="{top + 40}" r="34" fill="{p.accent}" class="node" '
            f'style="animation-delay:{i * 2}s;opacity:0"/>'
            + t(cx, top + 46, str(i + 1), "d", "middle")
            + t(cx, top + 104, name, "d", "middle")
            + t(cx, top + 128, l1, "ds", "middle")
            + t(cx, top + 146, l2, "ds", "middle")
        )
    out += (
        f'<g class="pkt"><circle cx="110" cy="{top + 40}" r="9" fill="{p.scan}"/>'
        f'<circle cx="110" cy="{top + 40}" r="16" fill="{p.scan}" opacity=".2"/></g>'
    )
    note = top + 196
    out += t(64, note, "If confidence is under the crop's calibrated threshold, the app", "m")
    out += t(64, note + 24, "asks for a new photo instead of guessing.", "m")
    return out, note + 64


def specimens(y: float, p: Palette, facts: list[CropFacts]) -> tuple[str, float]:
    """Three herbarium labels, one per crop model, with animated bars."""
    out = section_header(y, "THE SPECIMENS", "Three crops, three models")
    top = y + 96
    colors = {"coffee": p.coffee, "cacao": p.cacao, "banana": p.banana}
    drawings = {
        "coffee": lambda cx, cy: coffee_leaf(cx, cy, 0.36, p),
        "cacao": lambda cx, cy: cacao_pod(cx, cy, 0.62, p),
        "banana": lambda cx, cy: banana_leaf(cx, cy, 0.5, p),
    }
    for i, f in enumerate(facts):
        x = 64 + i * 232
        c = colors[f.crop]
        out += (
            f'<g class="rise" style="animation-delay:{0.3 + i * 0.2:.1f}s">'
            f'<rect x="{x}" y="{top}" width="212" height="470" rx="6" fill="{p.card}" '
            f'stroke="{p.rule}" stroke-width="1.5"/>'
            f'<rect x="{x + 70}" y="{top - 10}" width="72" height="22" fill="{p.tape}" '
            f'opacity=".85" transform="rotate(-3 {x + 106} {top})"/>'
            f'<g class="sway fb" style="animation-delay:{-i * 1.3}s">'
            + drawings[f.crop](x + 106, top + 92)
            + "</g>"
            + f'<line x1="{x + 16}" y1="{top + 168}" x2="{x + 196}" y2="{top + 168}" '
            f'stroke="{p.rule}"/>'
            + t(x + 16, top + 196, f.common.upper(), "d", extra=f' style="fill:{c}"')
            + t(x + 16, top + 218, f.latin, "it")
            + t(x + 16, top + 240, f"organ: {f.organ}", "ds")
        )
        for j, label in enumerate(f.labels):
            out += t(x + 16, top + 266 + j * 18, f"· {label}", "ds")
        rows = top + 384
        for k, (name, value, shown) in enumerate(
            (
                ("test accuracy", f.test_accuracy, f"{f.test_accuracy * 100:.1f}%"),
                ("macro-F1", f.macro_f1, f"{f.macro_f1:.2f}"),
            )
        ):
            ry = rows + k * 42
            delay = 0.6 + i * 0.25 + k * 0.2
            out += (
                t(x + 16, ry, name, "ds")
                + t(x + 196, ry, shown, "d", "end")
                + f'<rect x="{x + 16}" y="{ry + 8}" width="180" height="8" rx="4" '
                f'fill="{p.rule}" opacity=".5"/>'
                f'<rect x="{x + 16}" y="{ry + 8}" width="{180 * value:.1f}" height="8" rx="4" '
                f'fill="{c}" class="bar fl" style="animation-delay:{delay:.2f}s"/>'
            )
        out += t(
            x + 16,
            top + 460,
            f"threshold {f.threshold:.2f} · {f.size_mb:.1f} MB",
            "ds",
        )
        out += "</g>"
    note = top + 510
    coffee = facts[0]
    out += t(
        64,
        note,
        f"Coffee's macro-F1 ({coffee.macro_f1:.2f}) is under the 0.80 target: rare classes",
        "m",
    )
    out += t(
        64, note + 24, "have about 20 test leaves each. The analysis is in EXPERIMENTS.md.", "m"
    )
    return out, note + 70


def triage(y: float, p: Palette) -> tuple[str, float]:
    """The four verdicts stamped in turn, plus a confidence meter."""
    out = section_header(y, "THE VERDICT", "Every scan ends in one of four stamps")
    top = y + 100
    stamps = (
        ("HEALTHY", p.healthy, ("no action", "needed")),
        ("WATCH", p.watch, ("early or", "mild signs")),
        ("ACT NOW", p.act, ("treat or call", "a technician")),
        ("RETAKE", p.low, ("low confidence,", "take a new photo")),
    )
    for i, (word, color, meaning) in enumerate(stamps):
        x = 64 + i * 172
        out += (
            f'<g class="stp fb" style="animation-delay:{0.4 + i * 0.5:.1f}s">'
            f'<rect x="{x + 6}" y="{top}" width="144" height="54" rx="6" fill="none" '
            f'stroke="{color}" stroke-width="3.5"/>'
            f'<rect x="{x + 12}" y="{top + 6}" width="132" height="42" rx="4" fill="none" '
            f'stroke="{color}" stroke-width="1.2"/>'
            + t(x + 78, top + 33, word, "stamp", "middle", f' style="fill:{color}"')
            + "</g>"
            + t(x + 78, top + 82, meaning[0], "ds", "middle")
            + t(x + 78, top + 98, meaning[1], "ds", "middle")
        )
    # A result card that cycles through the four outcomes.
    cy = top + 140
    out += (
        f'<rect x="64" y="{cy}" width="672" height="120" rx="8" fill="{p.card}" '
        f'stroke="{p.rule}" stroke-width="1.5"/>'
    )
    cases = (
        ("coffee · leaf_rust", "ACT NOW", p.act, 0.92),
        ("cacao · healthy", "HEALTHY", p.healthy, 0.97),
        ("banana · black_sigatoka", "WATCH", p.watch, 0.84),
        ("coffee · leaf_miner", "RETAKE", p.low, 0.41),
    )
    for i, (name, word, color, conf) in enumerate(cases):
        out += (
            f'<g class="cyc" style="animation-delay:{i * 3}s;opacity:{1 if i == 0 else 0}">'
            + t(92, cy + 44, name, "d")
            + f'<rect x="560" y="{cy + 22}" width="150" height="34" rx="17" fill="{color}"/>'
            + t(635, cy + 44, word, "pill", "middle")
            + t(92, cy + 80, "confidence", "ds")
            + f'<rect x="200" y="{cy + 70}" width="420" height="12" rx="6" fill="{p.rule}" '
            'opacity=".5"/>'
            f'<rect x="200" y="{cy + 70}" width="{420 * conf:.0f}" height="12" rx="6" '
            f'fill="{color}" class="meter fl" style="animation-delay:{i * 3}s"/>'
            + t(690, cy + 81, f"{conf * 100:.0f}%", "d", "end")
            + "</g>"
        )
    out += t(92, cy + 106, "illustrative examples, not field results", "ds")
    return out, cy + 170


def roadmap(y: float, p: Palette) -> tuple[str, float]:
    """Phases as notebook entries with checkmarks drawn in sequence."""
    out = section_header(y, "SEASON LOG", "Where the project stands")
    top = y + 96
    for i, (num, name, done) in enumerate(PHASES):
        col, row = divmod(i, 5)
        x = 64 + col * 340
        ry = top + row * 44
        if done:
            mark = (
                f'<rect x="{x}" y="{ry}" width="28" height="28" rx="5" fill="{p.accent}"/>'
                f'<path d="M{x + 7},{ry + 14} l6,6 l10,-12" fill="none" stroke="{p.card}" '
                f'stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="chk" '
                f'style="animation-delay:{0.5 + i * 0.35:.2f}s"/>'
            )
        else:
            mark = (
                f'<rect x="{x}" y="{ry}" width="28" height="28" rx="5" fill="none" '
                f'stroke="{p.scan}" stroke-width="3" class="pulse"/>'
            )
        out += mark + t(x + 42, ry + 20, f"PHASE {num}", "d") + t(x + 124, ry + 20, name, "b")
    sy = top + 4 * 44 + 14
    out += (
        f'<g class="stp fb" style="animation-delay:4s">'
        f'<rect x="404" y="{sy - 4}" width="290" height="44" rx="5" fill="none" '
        f'stroke="{p.scan}" stroke-width="3"/>'
        + t(549, sy + 25, "v1.0.0 · IN THE FIELD", "stamp", "middle", f' style="fill:{p.scan}"')
        + "</g>"
    )
    nxt = sy + 80
    out += t(
        64, nxt, "Next season: plot maps, disease hotspots and weather risk alerts (v1.1),", "m"
    )
    out += t(64, nxt + 24, "then satellite NDVI and one more Costa Rican crop (v1.2).", "m")
    return out, nxt + 70


def monorepo(y: float, p: Palette) -> tuple[str, float]:
    """The three folders and the boundary rule."""
    out = section_header(y, "WHAT IS INSIDE", "One repository, three workshops")
    top = y + 96
    parts = (
        ("app/", "Expo React Native", ("TFLite on the phone", "SQLite offline history", "es / en")),
        (
            "api/",
            "FastAPI on Render",
            ("Firebase ID tokens", "sync, Cloudinary", "Gemini RAG, weather"),
        ),
        (
            "ml/",
            "Python 3.12 + uv",
            ("dedup + grouped split", "MobileNetV3-Large", "float16 export"),
        ),
    )
    for i, (folder, stack, lines) in enumerate(parts):
        x = 64 + i * 232
        out += (
            f'<g class="rise" style="animation-delay:{0.3 + i * 0.2:.1f}s">'
            f'<path d="M{x},{top + 14} h70 l12,-14 h130 v170 h-212 z" fill="{p.card}" '
            f'stroke="{p.rule}" stroke-width="1.5"/>'
            + t(x + 16, top + 48, folder, "d", extra=f' style="fill:{p.accent};font-size:20px"')
            + t(x + 16, top + 72, stack, "ds")
            + "".join(t(x + 16, top + 104 + j * 22, f"· {s}", "ds") for j, s in enumerate(lines))
            + "</g>"
        )
    rule = top + 220
    out += f'<rect x="64" y="{rule}" width="672" height="54" rx="6" fill="{p.deep}"/>' + t(
        400,
        rule + 33,
        "THE PHONE NEVER TALKS TO FIRESTORE · RULES DENY ALL CLIENTS",
        "pill",
        "middle",
    )
    return out, rule + 100


def footer(y: float, p: Palette) -> tuple[str, float]:
    """Disclaimer stamp, datasets and credits."""
    out = (
        f'<g class="stp fb" style="animation-delay:1s">'
        f'<rect x="120" y="{y}" width="560" height="78" rx="6" fill="none" stroke="{p.act}" '
        'stroke-width="3"/>'
        + t(400, y + 34, "SUPPORTS FIELD DECISIONS", "stamp", "middle", f' style="fill:{p.act}"')
        + t(
            400,
            y + 60,
            "DOES NOT REPLACE AN AGRONOMIST",
            "stamp",
            "middle",
            f' style="fill:{p.act}"',
        )
        + "</g>"
    )
    fy = y + 130
    out += t(400, fy, "Trained on RoCoLe, BRACOL, CocoaMoniliaDataSet, UNAB cacao,", "m", "middle")
    out += t(
        400,
        fy + 24,
        "NM-AIST banana leaves and BananaLSD, under their own licences.",
        "m",
        "middle",
    )
    out += t(400, fy + 64, "MIT code · free APK on GitHub Releases · no ads", "ds", "middle")
    out += t(400, fy + 88, "Keylor Pineda · Jefferson Abarca", "d", "middle")
    return out, fy + 130


def _sections(p: Palette, facts: list[CropFacts]) -> list[Callable[[float], tuple[str, float]]]:
    """Section builders in page order; each takes its top y and returns its body and bottom y."""
    return [
        lambda yy: stats(yy, p, facts),
        lambda yy: pipeline(yy, p),
        lambda yy: specimens(yy, p, facts),
        lambda yy: triage(yy, p),
        lambda yy: roadmap(yy, p),
        lambda yy: monorepo(yy, p),
        lambda yy: footer(yy, p),
    ]


def build_card(p: Palette, facts: list[CropFacts]) -> str:
    """Assemble the full sheet for one palette."""
    parts: list[str] = []
    body, y = header(p)
    parts.append(body)
    for build in _sections(p, facts):
        body, y = build(y)
        parts.append(body)
    height = int(y + 20)
    margin_lines = "".join(
        f'<line x1="36" y1="{yy}" x2="764" y2="{yy}" stroke="{p.rule}" opacity=".25"/>'
        for yy in range(140, height - 40, 36)
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {height}" '
        f'width="{WIDTH}" height="{height}" role="img" aria-labelledby="t d">'
        '<title id="t">HealthyCropping</title>'
        '<desc id="d">HealthyCropping, offline crop disease diagnosis for coffee, cacao and '
        "banana in Costa Rica. The full content of this card is repeated as text below it.</desc>"
        + style(p)
        + f"<style>.accent-fill {{ fill: {p.accent}; }}</style>"
        + f'<rect width="{WIDTH}" height="{height}" fill="{p.paper}"/>'
        f'<rect x="20" y="20" width="{WIDTH - 40}" height="{height - 40}" rx="10" '
        f'fill="{p.card}" opacity=".55" stroke="{p.rule}" stroke-width="2"/>'
        f'<rect x="28" y="28" width="{WIDTH - 56}" height="{height - 56}" rx="6" fill="none" '
        f'stroke="{p.rule}" stroke-width="1"/>'
        + margin_lines
        + f'<line x1="44" y1="28" x2="44" y2="{height - 28}" stroke="{p.coffee}" opacity=".35"/>'
        + "".join(parts)
        + "</svg>\n"
    )


def build_tab(label: str, p: Palette) -> str:
    """A small tab button that matches the card."""
    width = 24 + len(label) * 10
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width + 6} 46" '
        f'width="{width + 6}" height="46" role="img" aria-label="{escape(label)}">'
        f"<title>{escape(label)}</title>"
        f'<rect x="5" y="5" width="{width}" height="40" rx="6" fill="{p.deep}"/>'
        f'<rect x="1" y="1" width="{width}" height="40" rx="6" fill="{p.tape}" '
        f'stroke="{p.deep}" stroke-width="2"/>'
        f'<text x="{width / 2 + 1:g}" y="27" text-anchor="middle" font-family="{escape(MONO)}" '
        f'font-weight="700" font-size="15" letter-spacing="1" fill="{p.deep}">'
        f"{escape(label)}</text></svg>\n"
    )


TABS = {
    "download": "DOWNLOAD",
    "model-card": "MODEL CARD",
    "datasets": "DATASETS",
    "field": "FIELD VALIDATION",
    "setup": "SETUP",
}


def _write(path: Path, text: str) -> None:
    """Write with LF endings so the output is identical on Windows and Linux."""
    path.write_text(text, encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    """Write the light and dark cards and the tab buttons."""
    parser = argparse.ArgumentParser(description="Build the animated README card")
    parser.add_argument("--models-dir", type=Path, default=REPO_ROOT / "ml/models")
    parser.add_argument("--out-dir", type=Path, default=REPO_ROOT / "docs/assets/readme")
    args = parser.parse_args(argv)

    facts = load_crop_facts(args.models_dir)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for palette in (LIGHT, DARK):
        _write(args.out_dir / f"card-{palette.name}.svg", build_card(palette, facts))
    for key, label in TABS.items():
        _write(args.out_dir / f"tab-{key}.svg", build_tab(label, LIGHT))
    print(f"wrote {args.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
