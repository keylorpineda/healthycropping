# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- FastAPI core in `api/`: `create_app` factory (`healthycropping_api.main:app`), environment settings, public `GET /health`, Pydantic v2 schemas, structured `{"error": {"code", "message"}}` responses, CORS, a Firebase ID token verification dependency (`firebase-admin`) protecting `GET /me` (`401` for missing, malformed, or expired tokens), and deny-all `firestore.rules` with `firebase.json` (`#32`).
- Multi-crop offline diagnosis in the app: banana model registry bundled in `app/src/ml/models/banana/`, banana selectable on the Home screen next to coffee and cacao, with tests for registry parity, model resource names, and the coming-soon state for crops without a model (`#31`).
- Float16 TFLite banana model export (`ml/scripts/export_banana_tflite.py`, `ml/models/banana/banana_v0.1.0_fp16.tflite`, `6.06 MB`, `97.50%` test accuracy with `0.00 pp` drop vs Keras and `100.0%` top-1 agreement), `--threshold-floor` export option, confidence threshold `0.80` (`98.45%` test precision at `97.0%` coverage), `ml/models/banana/registry.json`, and Banana Model Card (`docs/MODEL_CARD.md` §4) (`#71`).
- Banana `MobileNetV3-Large` frozen baseline (`97.00%` test accuracy, `0.9676` Macro-F1) and top-30 fine-tuned model (`97.50%` test accuracy, `0.9731` Macro-F1), CLI script (`ml/scripts/train_banana.py`), per-source evaluation (`ml/scripts/evaluate_by_source.py`), confusion matrices, and Grad-CAM visual explanations in `docs/EXPERIMENTS.md` (`#30`).
- Banana leaf dataset pipeline: BananaLSD (`OriginalSet` only, CC BY 4.0) and NM-AIST Banana Leaves Imagery (Zenodo `7670326`, CC BY 4.0) downloaders, HTTP Range extraction of image subsets from multi-gigabyte ZIP archives (`ml/src/healthycropping_ml/remote_zip.py`), `ml/configs/banana.yaml`, `ml/scripts/prepare_banana.py`, and the data report (`docs/data_reports/banana.md`, `docs/assets/data_reports/banana_grid.png`): `1,313` deduplicated images (`391` `healthy`, `622` `black_sigatoka`, `300` `fusarium_wilt`) across `770` groups with zero cross-split leakage (`#29`).
- Float16 TFLite cacao model export (`ml/scripts/export_cacao_tflite.py`, `ml/models/cacao/cacao_v0.1.0_fp16.tflite`, `6.06 MB`, `91.73%` test accuracy with `0.00 pp` drop vs Keras and `100.0%` top-1 agreement), validation-calibrated confidence threshold `0.51` (`90.15%` val precision), `ml/models/cacao/registry.json`, and Cacao Model Card (`docs/MODEL_CARD.md` §3) (`#70`).
- Cacao `MobileNetV3-Large` frozen baseline (`87.47%` test accuracy, `0.7946` Macro-F1) and top-30 fine-tuned model (`91.73%` test accuracy, `0.8502` Macro-F1, `0.9532` `healthy` F1, `0.8553` `monilia` F1, `0.7419` `black_pod` F1), CLI script (`ml/scripts/train_cacao.py`), confusion matrices (`docs/assets/confusion_matrices/cacao_*.png`), and Grad-CAM visual explanations (`docs/assets/gradcam/cacao_gradcam.png`) in `docs/EXPERIMENTS.md` (`#28`).
- Cacao pod dataset downloaders (`ml/scripts/download_cocoamonilia.py`, `ml/scripts/download_unab_cacao.py`), configuration (`ml/configs/cacao.yaml`), YOLO bounding-box pod cropper and preparation pipeline (`ml/scripts/prepare_cacao.py`), dataset report (`docs/data_reports/cacao.md`), and `224x224` sample grid (`docs/assets/data_reports/cacao_grid.png`) combining CocoaMoniliaDataSet (CC BY 4.0) and UNAB Cocoa Diseases (ODbL v1.0) into `2,646` deduplicated samples across `1,367` grouped tree/photo IDs (`#27`).

### Fixed

- Scan photos are copied from the volatile camera cache into the app's document directory (`expo-file-system`), and SQLite foreign keys are enforced on every connection (`#101`).
- On-device model loading: bundle registered TFLite models as Android raw resources via the `app/plugins/withTfliteModels.js` config plugin (SHA-256 verified), load them by resource name, route cacao to its own registry and model, disable banana until its model exists, and surface inference failures (`#100`).
- Replaced `android-actions/setup-android@v3` in `.github/workflows/release.yml` with preinstalled `$ANDROID_HOME` license acceptance (avoiding removed `sdkmanager tools` failure on Command-Line Tools 16.0), added `scripts/` to `ml` Mypy CI check, and pointed `.github/dependabot.yml` at `develop` and root `pnpm` workspace.

## [0.2.0] - 2026-10-16

### Added

- Offline-first SQLite persistence (`expo-sqlite`, `expo-crypto`), repository layer for farms, plots, and scans with sync queue metadata, History screen with multi-filter and swipe-to-delete with undo, Scan Detail screen with farm/plot location assignment, and Farms/Plots CRUD screens (`#26`).
- Camera screen with viewfinder framing guide and shutter flash, crop-specific photo tips modal, analyzing sweep-line animation, and result screen with severity progress meter, confidence breakdown, pop-in status badge with haptics, low-confidence retake state, and agronomic disclaimer (`#25`).
- On-device TFLite inference pipeline (`app/src/ml/`) with `expo-image-manipulator`, `jpeg-js` RGB decoding, training normalization, `react-native-fast-tflite`, threshold calibration, and Jest cross-platform tensor parity test (`#24`).
- Onboarding (3-slide educational flow with mandatory agronomic disclaimer acceptance), Home (camera-first layout, primary Scan CTA, crop selector chips, offline status pill, and empty state), and Settings screens (instant `es`/`en` language switcher, light/dark theme toggle, model version, dataset licenses) (`#23`).
- Reusable UI component library in `app/src/components/ui/` (`Button`, `Card`, `Chip`, `Badge`, `Sheet`, `Toast`, `Skeleton`, `EmptyState`, `ProgressMeter`) with spring micro-interactions, haptics, >= 48 dp touch targets, reduced motion support, and RNTL unit tests (`#22`).
- Agricultural design tokens (`app/src/theme/`) covering colors, typography, spacing, radii, elevation, and motion with dark/light themes and WCAG 2.1 AA mathematical contrast tests (`#21`).
- `ThemeProvider` and `useTheme()` hook integrating user theme preference with system appearance and reduced motion accessibility (`#21`).
- Expo SDK 52 Android application setup (`app/app.json`, `app/package.json`) with package `com.keylorpineda.healthycropping`, New Architecture, and Expo Router (`#20`).
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
- Coffee dataset preparation pipeline (`ml/configs/coffee.yaml`, `ml/scripts/prepare_coffee.py`, `ml/src/healthycropping_ml/preprocess.py`, `dedup.py`, `split.py`) performing EXIF orientation correction, `224x224` RGB conversion, perceptual-hash deduplication (`imagehash.phash`), and grouped stratified `70/15/15` splitting (`#14`).
- Coffee dataset report (`docs/data_reports/coffee.md`), `224x224` sample grid (`docs/assets/data_reports/coffee_grid.png`), and `< 50` training-image merging evaluation (`#15`).
- Frozen-backbone `MobileNetV3-Large` baseline training pipeline (`ml/src/healthycropping_ml/model.py`, `evaluate.py`, `train.py`, `ml/scripts/train_coffee.py`, `ml/notebooks/01_coffee_training.ipynb`), confusion matrix (`docs/assets/confusion_matrices/coffee_baseline.png`), and baseline metrics (`79.72%` test accuracy, `0.7135` test Macro-F1) in `docs/EXPERIMENTS.md` (`#16`).
- Top-block `MobileNetV3-Large` fine-tuning, validation logit bias calibration (`82.75%` uncalibrated / `81.35%` calibrated test accuracy, `0.8701` 4-major-class F1), confusion matrix (`docs/assets/confusion_matrices/coffee_finetuned.png`), and per-class Grad-CAM visual explanations (`ml/src/healthycropping_ml/gradcam.py`, `docs/assets/gradcam/coffee_gradcam.png`) (`#17`).
- Float16 TFLite export pipeline (`ml/src/healthycropping_ml/export_tflite.py`, `ml/scripts/export_coffee_tflite.py`): `6.06 MB` coffee model at `81.12%` test accuracy (`0.23 pp` below Keras), validation-calibrated confidence threshold `0.79` (`90.9%` accepted precision), `ml/models/coffee/registry.json`, and the shared preprocessing fixture `ml/fixtures/preprocessing_fixture_224.json` (`#18`).
- Coffee model card (`docs/MODEL_CARD.md` §2): intended use, data, Keras vs TFLite metrics, per-class results with abstention coverage, Grad-CAM, and limitations; TFLite export results in `docs/EXPERIMENTS.md` (`#19`).




