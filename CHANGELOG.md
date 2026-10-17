# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-16

### Added

- Offline-first SQLite persistence (`expo-sqlite`, `expo-crypto`), repository layer for farms, plots, and scans with sync queue metadata, History screen with multi-filter and swipe-to-delete with undo, Scan Detail screen with farm/plot location assignment, and Farms/Plots CRUD screens (`#26`).
- Camera screen with viewfinder framing guide and shutter flash, crop-specific photo tips modal, analyzing sweep-line animation, and result screen with severity progress meter, confidence breakdown, pop-in status badge with haptics, low-confidence retake state, and agronomic disclaimer (`#25`).
- On-device TFLite inference pipeline (`app/src/ml/`) with `expo-image-manipulator`, `jpeg-js` RGB decoding, training normalization, `react-native-fast-tflite`, threshold calibration, and Jest cross-platform tensor parity test (`#24`).
- Onboarding (3-slide educational flow with mandatory agronomic disclaimer acceptance), Home (camera-first layout, primary Scan CTA, crop selector chips, offline status pill, and empty state), and Settings screens (instant `es`/`en` language switcher, light/dark theme toggle, model version, dataset licenses) (`#23`).
- Reusable UI component library in `app/src/components/ui/` (`Button`, `Card`, `Chip`, `Badge`, `Sheet`, `Toast`, `Skeleton`, `EmptyState`, `ProgressMeter`) with spring micro-interactions, haptics, >= 48 dp touch targets, reduced motion support, and RNTL unit tests (`#22`).
- Agricultural design tokens (`app/src/theme/`) covering colors, typography, spacing, radii, elevation, and motion with dark/light themes and WCAG 2.1 AA mathematical contrast tests (`#21`).
- `ThemeProvider` and `useTheme()` hook integrating user theme preference with system appearance and reduced motion accessibility (`#21`).
- Expo SDK 52 Android application setup (`app/app.json`, `app/package.json`) with package `com.keylorpineda.healthycrop`, New Architecture, and Expo Router (`#20`).
- Internationalization subsystem (`app/src/i18n/`) with Spanish default, English secondary, symmetric translation keys, and mandatory agronomic disclaimer (`#20`).
- Zustand preferences store (`app/src/stores/preferences.ts`) managing locale, light/dark/system theme, and onboarding state (`#20`).
- Jest + React Native Testing Library configuration (`jest-expo`) with native module mocks and unit tests (`#20`).

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




