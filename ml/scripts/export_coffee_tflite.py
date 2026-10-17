#!/usr/bin/env python3
"""CLI wrapper script to export the coffee model to float16 TFLite with registry and fixture."""

from __future__ import annotations

from healthycrop_ml.export_tflite import main

if __name__ == "__main__":
    raise SystemExit(main())
