#!/usr/bin/env python3
"""Regenerate the EXIF orientation fixture used by the ml and app preprocessing tests."""

from __future__ import annotations

from healthycropping_ml.exif_fixture import main

if __name__ == "__main__":
    raise SystemExit(main())
