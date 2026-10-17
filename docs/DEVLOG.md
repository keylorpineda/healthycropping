# HealthyCrop — Engineering Development Log (DEVLOG)

This log documents what was built, key architectural decisions, and technical problems solved at the end of each phase.

---

## Phase 0 — Setup, Repo & Community Standards (2026-10-16)

### Built
- **Monorepo & Toolchain Foundation**:
  - Root configuration files: [`.gitignore`](../.gitignore), [`.gitattributes`](../.gitattributes) (enforcing LF), [`.editorconfig`](../.editorconfig), [`.nvmrc`](../.nvmrc) (`24.18.0`), [`.npmrc`](../.npmrc), [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), root [`package.json`](../package.json) (`pnpm@11.17.0`), [`.vscode/extensions.json`](../.vscode/extensions.json), and [`.pre-commit-config.yaml`](../.pre-commit-config.yaml).
  - Environment variable templates [`api/.env.example`](../api/.env.example) and [`app/.env.example`](../app/.env.example).
  - Minimal `app/` (`pnpm` + TypeScript + ESLint + Prettier + Jest), `api/` (`uv` + Python 3.12 + Ruff + Mypy + Pytest), and `ml/` (`uv` + Python 3.12 + Ruff + Mypy + Pytest) empty test suites so CI verifies the entire toolchain from commit one.
- **GitHub Community Standards & Automation**:
  - [`LICENSE`](../LICENSE) (MIT, Keylor Pineda), [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) (Contributor Covenant 2.1), [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`SECURITY.md`](../SECURITY.md), [`SUPPORT.md`](../SUPPORT.md), [`CITATION.cff`](../CITATION.cff), [`CHANGELOG.md`](../CHANGELOG.md), [`.github/CODEOWNERS`](../.github/CODEOWNERS), [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md), [`.github/dependabot.yml`](../.github/dependabot.yml), and structured issue templates (`bug_report.yml`, `feature_request.yml`, `model_issue.yml`, `config.yml`).
  - GitHub Actions workflows [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and [`.github/workflows/release.yml`](../.github/workflows/release.yml).
  - Public repository [`keylorpineda/healthycrop`](https://github.com/keylorpineda/healthycrop) with `main` branch protection requiring CI checks, 13 custom labels, 3 milestones (`MVP`, `v1.1`, `v1.2`), linked GitHub Project board (`Project #3`), and 35 structured roadmap issues (`#10`–`#44`, with Phase 0 issues `#10`–`#12` retroactively closed and moved to `Done`).
- **Engineering & Product Documentation**:
  - [`AGENTS.md`](../AGENTS.md) (`< 4,000` characters) codifying commands, conventions, non-negotiables, and session workflow.
  - [`docs/PLAN.md`](PLAN.md), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/DATASETS.md`](DATASETS.md), [`docs/MODEL_CARD.md`](MODEL_CARD.md), [`docs/EXPERIMENTS.md`](EXPERIMENTS.md), [`docs/FIELD_VALIDATION.md`](FIELD_VALIDATION.md), [`docs/SETUP_SERVICES_ES.md`](SETUP_SERVICES_ES.md) (step-by-step Spanish guide), and [`README.md`](../README.md).

### Decisions
1. **Hoisted `pnpm` Node Linker (`node-linker=hoisted`)**:
   - Expo and React Native native autolinking (`Gradle`, Metro bundler, and Babel plugins) frequently fail when traversing `pnpm`'s default symlinked virtual store in a monorepo. Setting `node-linker=hoisted` in [`.npmrc`](../.npmrc) preserves `pnpm`'s speed and deterministic `pnpm-lock.yaml` while presenting a flat `node_modules` tree compatible with native Android builds.
2. **Independent `uv` Projects for `api/` and `ml/`**:
   - `api/` (deployed to Render's lightweight container environment) requires a fast, minimal dependency tree (`fastapi`, `firebase-admin`, `google-genai`, `cloudinary`), whereas `ml/` requires heavy scientific/training packages (`tensorflow`, `scikit-learn`, `imagehash`). Keeping separate `pyproject.toml` and `uv.lock` files in `api/` and `ml/` prevents ML dependencies from bloating the API deployment image.
3. **Strict Client/Database Security Boundary**:
   - Documented and architected the system so the Android client never initializes the Firestore client SDK. All data reads/writes pass through `api/` with Firebase ID tokens verified by `firebase-admin`, eliminating client-side security rule misconfigurations.

### Problems Solved
- **Missing Global `python` Alias on Windows**:
  - On Windows 11, the default Microsoft Store `python.exe` execution alias returned an exit code `1` because Python was not installed globally on `PATH`. Configured `uv` (`uv python install 3.12` / `uv run --python 3.12`) to manage an isolated Python 3.12 runtime automatically for both `api/` and `ml/`.

---

## Phase 1 — Coffee Data & Baseline (2026-10-16)

### Built
- **Dataset Verification & Download Pipeline (`#13`)**:
  - Verified **RoCoLe** (`10.17632/c5yvn32dzg.2`) and **BRACOL** (`10.17632/yy2k5y8mxg.1`) licenses (`CC BY 4.0`) via Mendeley Data API and documented exact metadata in [`docs/DATASETS.md`](DATASETS.md).
  - Implemented [`ml/src/healthycrop_ml/download.py`](../ml/src/healthycrop_ml/download.py), [`ml/scripts/download_rocole.py`](../ml/scripts/download_rocole.py), [`ml/scripts/download_bracol.py`](../ml/scripts/download_bracol.py), and [`ml/tests/test_download.py`](../ml/tests/test_download.py).
- **Coffee Data Preparation, Perceptual-Hash Deduplication & Grouped Split (`#14`)**:
  - Created [`ml/configs/coffee.yaml`](../ml/configs/coffee.yaml) defining the 6-class coffee taxonomy (`healthy`, `leaf_rust` + severity `1`–`4`, `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite`), `224x224` target size, and `70/15/15` split parameters.
  - Implemented [`ml/src/healthycrop_ml/config.py`](../ml/src/healthycrop_ml/config.py), [`ml/src/healthycrop_ml/preprocess.py`](../ml/src/healthycrop_ml/preprocess.py), [`ml/src/healthycrop_ml/dedup.py`](../ml/src/healthycrop_ml/dedup.py), [`ml/src/healthycrop_ml/split.py`](../ml/src/healthycrop_ml/split.py), [`ml/scripts/prepare_coffee.py`](../ml/scripts/prepare_coffee.py), and [`ml/tests/test_prepare_coffee.py`](../ml/tests/test_prepare_coffee.py).
  - Processed `2,902` mapped raw images (`1,560` RoCoLe + `1,342` BRACOL valid whole leaves after dropping `62` undetermined stress rows), removed `78` near-duplicate images (`d_Hamming <= 2`), and produced `2,824` leak-free `224x224` RGB images across `train` (`1,969`), `val` (`426`), and `test` (`429`).
- **Coffee Data Report & Small-Class Merging Evaluation (`#15`)**:
  - Implemented [`ml/src/healthycrop_ml/report.py`](../ml/src/healthycrop_ml/report.py), [`ml/scripts/generate_coffee_report.py`](../ml/scripts/generate_coffee_report.py), and [`ml/tests/test_report.py`](../ml/tests/test_report.py).
  - Generated [`docs/data_reports/coffee.md`](data_reports/coffee.md) and [`docs/assets/data_reports/coffee_grid.png`](assets/data_reports/coffee_grid.png), confirming all 6 primary coffee classes exceed the `50` training-image threshold (`cercospora` smallest at `96` train images) and documenting why `leaf_rust` severity levels (`1`–`4`, where `severity=4` has only `42` train images) are consolidated into `leaf_rust` with `severity` metadata.
- **Frozen-Backbone `MobileNetV3-Large` Baseline & Metrics (`#16`)**:
  - Implemented [`ml/src/healthycrop_ml/evaluate.py`](../ml/src/healthycrop_ml/evaluate.py), [`ml/src/healthycrop_ml/model.py`](../ml/src/healthycrop_ml/model.py), [`ml/src/healthycrop_ml/train.py`](../ml/src/healthycrop_ml/train.py), [`ml/scripts/train_coffee.py`](../ml/scripts/train_coffee.py), [`ml/notebooks/01_coffee_training.ipynb`](../ml/notebooks/01_coffee_training.ipynb), and [`ml/tests/test_model_and_eval.py`](../ml/tests/test_model_and_eval.py).
  - Trained the frozen-backbone baseline (`coffee-v0.1.0-baseline`), achieving **`82.16%` validation accuracy (`0.7637` validation Macro-F1)** and **`79.72%` held-out test accuracy (`0.7135` test Macro-F1)**, with confusion matrix saved to [`docs/assets/confusion_matrices/coffee_baseline.png`](assets/confusion_matrices/coffee_baseline.png) and full per-class metrics logged in [`docs/EXPERIMENTS.md`](EXPERIMENTS.md).

### Decisions
1. **Explicit `[-1.0, 1.0]` Input Normalization (`include_preprocessing=False`)**:
   - Configured `MobileNetV3Large(include_preprocessing=False)` and explicit `(rgb - 127.5) / 127.5` tensor normalization in `preprocess.py` so the Python training pipeline and the React Native `app/src/ml/` inference pipeline operate on the exact same `float32` input tensor range (`[-1.0, 1.0]`).

### Problems Solved
- **Upstream Truncated BRACOL ZIP Archive**:
  - Mendeley's hosted `BRACOL_coffee_leaf_ images_datasets.zip` (`164,516,964` bytes) was uploaded truncated mid-entry at EOF (`leaf/images/688.jpg`), lacking a ZIP central directory (`PK\x05\x06`). Implemented `_extract_zip_local_headers_safe` in [`ml/src/healthycrop_ml/download.py`](../ml/src/healthycrop_ml/download.py) to sequentially parse `PK\x03\x04` local file headers, inflate and CRC-verify all `1,401` intact whole-leaf images plus `leaf/dataset.csv`, and safely skip the single truncated trailing entry.
- **Cross-Plant Duplicate Leakage in RoCoLe**:
  - `imagehash.phash` deduplication discovered `78` exact/near-duplicate photos in RoCoLe that had been assigned to *different* plant IDs upstream (e.g., `C1P38E1` identical to `C1P35E1`). Deduplicating before `grouped_stratified_split` prevented those duplicate photos from leaking across `train`, `val`, and `test`.
- **Keras 3 `RandomContrast` Default `value_range=(0, 255)` Clipping Bug**:
  - In Keras 3, `layers.RandomContrast` defaults to `value_range=(0, 255)` and clips output values to that range during training. When fed `[-1.0, 1.0]` normalized tensors, it clipped all negative pixel values (`[-1.0, 0.0)`) to `0.0` during training while leaving validation unclipped, capping validation Macro-F1 at `0.4075`. Explicitly passing `value_range=(-1.0, 1.0)` and adding `LayerNormalization` before the classification head jumped frozen-backbone validation Macro-F1 from `0.4075` to **`0.7637`** (`79.72%` test accuracy).

---

## Phase 2 — Coffee Model & Export (Completed, 2026-10-16)

### Built
- **Top-Block Fine-Tuning, Logit Calibration & Grad-CAM Visual Explanations (`#17`)**:
  - Implemented [`ml/src/healthycrop_ml/gradcam.py`](../ml/src/healthycrop_ml/gradcam.py) and [`ml/tests/test_gradcam.py`](../ml/tests/test_gradcam.py) to compute per-class `GradientTape` spatial activation heatmaps and render 3-panel explanation grids (`Original 224x224` | `Grad-CAM Activation` | `Lesion Focus Overlay`).
  - Enhanced [`ml/src/healthycrop_ml/train.py`](../ml/src/healthycrop_ml/train.py) with low-RAM `(7, 7, 160)` spatial-feature extraction, $D_4$ dihedral augmentation, `SpatialDropout2D(0.20)`, `AdamW` with `CosineDecay`, and Menon et al. (ICLR 2021) validation-set logit bias calibration.
  - Improved coffee test accuracy from `79.72%` to **`82.75%`** (`0.8701` mean F1 across the 4 major classes covering `89.7%` of the test set; `83.57%` validation accuracy / `0.7911` validation Macro-F1 and `0.7290`–`0.7463` 6-class test Macro-F1 after long-tail calibration), and saved [`docs/assets/confusion_matrices/coffee_finetuned.png`](assets/confusion_matrices/coffee_finetuned.png) and [`docs/assets/gradcam/coffee_gradcam.png`](assets/gradcam/coffee_gradcam.png).
- **GitFlow Branching Structure (`develop` + `main`)**:
  - Configured `develop` as the default protected integration branch (receiving rebase-merged `--rebase` work PRs) and `main` as the protected release branch (receiving merge-commit `--merge` release PRs `chore(release): vX.Y.Z` from `develop`).
- **Float16 TFLite Export, Confidence Threshold, Registry & Shared Fixture (`#18`)**:
  - Implemented [`ml/src/healthycrop_ml/export_tflite.py`](../ml/src/healthycrop_ml/export_tflite.py) and [`ml/scripts/export_coffee_tflite.py`](../ml/scripts/export_coffee_tflite.py): strips training-only `aug_*` and `head_dropout` layers, exports a batch-1 SavedModel, converts it to float16 TFLite, and evaluates it with the TFLite interpreter on all `426` validation and `429` test images.
  - Coffee model: `6,061,508` bytes, `81.12%` TFLite test accuracy vs `81.35%` Keras (`0.23 pp` drop, `99.77%` top-1 agreement).
  - Calibrated the abstention threshold on validation as the lowest top-1 probability reaching `>= 90%` accepted precision: `0.79` (`90.9%` precision at `69.5%` coverage on val; `87.7%` precision at `72.0%` coverage on test). Written to [`ml/models/coffee/registry.json`](../ml/models/coffee/registry.json) together with labels, input spec, normalization, model SHA-256, and metrics.
  - Generated [`ml/fixtures/preprocessing_fixture_224.json`](../ml/fixtures/preprocessing_fixture_224.json): seeded `224x224` RGB bytes, probe pixels, and the SHA-256 of the expected little-endian float32 tensor, verified by `ml/tests/test_preprocessing_fixture.py` (Jest side lands in Phase 4).
- **Coffee Model Card (`#19`)**:
  - Completed the coffee section of [`docs/MODEL_CARD.md`](MODEL_CARD.md): intended use, data provenance and split, Keras vs float16 TFLite metrics, per-class TFLite results with abstention coverage at `0.79`, Grad-CAM, and coffee-specific limitations (macro-F1 `0.72` vs `0.80` target, no Costa Rican training images, no severity output yet).

### Problems Solved
- **Keras 3 Variables Not Frozen by Concrete-Function Conversion**:
  - `TFLiteConverter.from_concrete_functions` on a Keras 3 model produced a `226 KB` model that output `NaN` (weights stayed as unresolved resource variables). Exporting through `keras.export.ExportArchive` to a SavedModel and converting with `from_saved_model` froze all weights (`6.06 MB`) and matched Keras outputs.

### Phase 2 Outcome
- Done-when status: float16 `.tflite` `< 10 MB` and within `1 pp` ✅; registry and shared fixture committed and tested ✅; test macro-F1 `>= 0.80` not met, with root causes and ablations documented in `docs/EXPERIMENTS.md` (the accepted fallback).