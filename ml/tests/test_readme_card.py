"""The committed README card must match what the registries produce."""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CARD_DIR = REPO_ROOT / "docs" / "assets" / "readme"


def _build(out_dir: Path) -> None:
    scripts_dir = str(REPO_ROOT / "ml" / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import build_readme_card

    assert build_readme_card.main(["--out-dir", str(out_dir)]) == 0


def test_committed_card_is_up_to_date(tmp_path: Path) -> None:
    _build(tmp_path)
    built = sorted(path.name for path in tmp_path.glob("*.svg"))
    assert built == sorted(path.name for path in CARD_DIR.glob("*.svg"))
    for name in built:
        expected = (tmp_path / name).read_text(encoding="utf-8")
        committed = (CARD_DIR / name).read_text(encoding="utf-8")
        assert committed == expected, f"{name} is stale: run scripts/build_readme_card.py"


def test_card_is_valid_svg_without_scripts(tmp_path: Path) -> None:
    _build(tmp_path)
    for path in tmp_path.glob("*.svg"):
        text = path.read_text(encoding="utf-8")
        root = ET.fromstring(text)
        assert root.tag == "{http://www.w3.org/2000/svg}svg"
        assert "<script" not in text
        assert "http" not in text.replace("http://www.w3.org/2000/svg", "")


def test_card_shows_registry_numbers(tmp_path: Path) -> None:
    _build(tmp_path)
    light = (tmp_path / "card-light.svg").read_text(encoding="utf-8")
    for shown in ("81.1%", "91.7%", "97.5%", "threshold 0.79", "threshold 0.51"):
        assert shown in light
    assert "prefers-reduced-motion" in light
