# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-16

### Added

- Phase 0 repository foundation, monorepo workspace configuration (`pnpm` + `uv`), and `.gitignore` / `.gitattributes` / `.editorconfig` rules.
- GitHub Community Standards (`LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CITATION.cff`, `CODEOWNERS`, issue templates, PR template, and `dependabot.yml`).
- Project documentation (`AGENTS.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DATASETS.md`, `docs/MODEL_CARD.md`, `docs/EXPERIMENTS.md`, `docs/FIELD_VALIDATION.md`, `docs/DEVLOG.md`, and Spanish setup guide `docs/SETUP_SERVICES_ES.md`).
- CI and release GitHub Actions workflows (`.github/workflows/ci.yml` and `.github/workflows/release.yml`) and empty test suites for `app/`, `api/`, and `ml/`.
- Idempotent, SHA-256 verified coffee dataset downloaders (`ml/scripts/download_rocole.py`, `ml/scripts/download_bracol.py`) with truncated-ZIP recovery for BRACOL (`#13`).
- Coffee dataset preparation pipeline (`ml/configs/coffee.yaml`, `ml/scripts/prepare_coffee.py`, `ml/src/healthycrop_ml/preprocess.py`, `dedup.py`, `split.py`) performing EXIF orientation correction, `224x224` RGB conversion, perceptual-hash deduplication (`imagehash.phash`), and grouped stratified `70/15/15` splitting (`#14`).
- Coffee dataset report (`docs/data_reports/coffee.md`), `224x224` sample grid (`docs/assets/data_reports/coffee_grid.png`), and `< 50` training-image merging evaluation (`#15`).
- Frozen-backbone `MobileNetV3-Large` baseline training pipeline (`ml/src/healthycrop_ml/model.py`, `evaluate.py`, `train.py`, `ml/scripts/train_coffee.py`, `ml/notebooks/01_coffee_training.ipynb`), confusion matrix (`docs/assets/confusion_matrices/coffee_baseline.png`), and baseline metrics (`79.72%` test accuracy, `0.7135` test Macro-F1) in `docs/EXPERIMENTS.md` (`#16`).
- Top-block `MobileNetV3-Large` fine-tuning, validation logit bias calibration (`82.75%` uncalibrated / `81.35%` calibrated test accuracy, `0.8701` 4-major-class F1), confusion matrix (`docs/assets/confusion_matrices/coffee_finetuned.png`), and per-class Grad-CAM visual explanations (`ml/src/healthycrop_ml/gradcam.py`, `docs/assets/gradcam/coffee_gradcam.png`) (`#17`).
- Float16 TFLite export pipeline (`ml/src/healthycrop_ml/export_tflite.py`, `ml/scripts/export_coffee_tflite.py`): `6.06 MB` coffee model at `81.12%` test accuracy (`0.23 pp` below Keras), validation-calibrated confidence threshold `0.79` (`90.9%` accepted precision), `ml/models/coffee/registry.json`, and the shared preprocessing fixture `ml/fixtures/preprocessing_fixture_224.json` (`#18`).
- Coffee model card (`docs/MODEL_CARD.md` §2): intended use, data, Keras vs TFLite metrics, per-class results with abstention coverage, Grad-CAM, and limitations; TFLite export results in `docs/EXPERIMENTS.md` (`#19`).




