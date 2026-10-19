# HealthyCropping — Engineering Development Log (DEVLOG)

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
  - Implemented [`ml/src/healthycroppingping_ml/download.py`](../ml/src/healthycroppingping_ml/download.py), [`ml/scripts/download_rocole.py`](../ml/scripts/download_rocole.py), [`ml/scripts/download_bracol.py`](../ml/scripts/download_bracol.py), and [`ml/tests/test_download.py`](../ml/tests/test_download.py).
- **Coffee Data Preparation, Perceptual-Hash Deduplication & Grouped Split (`#14`)**:
  - Created [`ml/configs/coffee.yaml`](../ml/configs/coffee.yaml) defining the 6-class coffee taxonomy (`healthy`, `leaf_rust` + severity `1`–`4`, `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite`), `224x224` target size, and `70/15/15` split parameters.
  - Implemented [`ml/src/healthycroppingping_ml/config.py`](../ml/src/healthycroppingping_ml/config.py), [`ml/src/healthycroppingping_ml/preprocess.py`](../ml/src/healthycroppingping_ml/preprocess.py), [`ml/src/healthycroppingping_ml/dedup.py`](../ml/src/healthycroppingping_ml/dedup.py), [`ml/src/healthycroppingping_ml/split.py`](../ml/src/healthycroppingping_ml/split.py), [`ml/scripts/prepare_coffee.py`](../ml/scripts/prepare_coffee.py), and [`ml/tests/test_prepare_coffee.py`](../ml/tests/test_prepare_coffee.py).
  - Processed `2,902` mapped raw images (`1,560` RoCoLe + `1,342` BRACOL valid whole leaves after dropping `62` undetermined stress rows), removed `78` near-duplicate images (`d_Hamming <= 2`), and produced `2,824` leak-free `224x224` RGB images across `train` (`1,969`), `val` (`426`), and `test` (`429`).
- **Coffee Data Report & Small-Class Merging Evaluation (`#15`)**:
  - Implemented [`ml/src/healthycroppingping_ml/report.py`](../ml/src/healthycroppingping_ml/report.py), [`ml/scripts/generate_coffee_report.py`](../ml/scripts/generate_coffee_report.py), and [`ml/tests/test_report.py`](../ml/tests/test_report.py).
  - Generated [`docs/data_reports/coffee.md`](data_reports/coffee.md) and [`docs/assets/data_reports/coffee_grid.png`](assets/data_reports/coffee_grid.png), confirming all 6 primary coffee classes exceed the `50` training-image threshold (`cercospora` smallest at `96` train images) and documenting why `leaf_rust` severity levels (`1`–`4`, where `severity=4` has only `42` train images) are consolidated into `leaf_rust` with `severity` metadata.
- **Frozen-Backbone `MobileNetV3-Large` Baseline & Metrics (`#16`)**:
  - Implemented [`ml/src/healthycroppingping_ml/evaluate.py`](../ml/src/healthycroppingping_ml/evaluate.py), [`ml/src/healthycroppingping_ml/model.py`](../ml/src/healthycroppingping_ml/model.py), [`ml/src/healthycroppingping_ml/train.py`](../ml/src/healthycroppingping_ml/train.py), [`ml/scripts/train_coffee.py`](../ml/scripts/train_coffee.py), [`ml/notebooks/01_coffee_training.ipynb`](../ml/notebooks/01_coffee_training.ipynb), and [`ml/tests/test_model_and_eval.py`](../ml/tests/test_model_and_eval.py).
  - Trained the frozen-backbone baseline (`coffee-v0.1.0-baseline`), achieving **`82.16%` validation accuracy (`0.7637` validation Macro-F1)** and **`79.72%` held-out test accuracy (`0.7135` test Macro-F1)**, with confusion matrix saved to [`docs/assets/confusion_matrices/coffee_baseline.png`](assets/confusion_matrices/coffee_baseline.png) and full per-class metrics logged in [`docs/EXPERIMENTS.md`](EXPERIMENTS.md).

### Decisions
1. **Explicit `[-1.0, 1.0]` Input Normalization (`include_preprocessing=False`)**:
   - Configured `MobileNetV3Large(include_preprocessing=False)` and explicit `(rgb - 127.5) / 127.5` tensor normalization in `preprocess.py` so the Python training pipeline and the React Native `app/src/ml/` inference pipeline operate on the exact same `float32` input tensor range (`[-1.0, 1.0]`).

### Problems Solved
- **Upstream Truncated BRACOL ZIP Archive**:
  - Mendeley's hosted `BRACOL_coffee_leaf_ images_datasets.zip` (`164,516,964` bytes) was uploaded truncated mid-entry at EOF (`leaf/images/688.jpg`), lacking a ZIP central directory (`PK\x05\x06`). Implemented `_extract_zip_local_headers_safe` in [`ml/src/healthycroppingping_ml/download.py`](../ml/src/healthycroppingping_ml/download.py) to sequentially parse `PK\x03\x04` local file headers, inflate and CRC-verify all `1,401` intact whole-leaf images plus `leaf/dataset.csv`, and safely skip the single truncated trailing entry.
- **Cross-Plant Duplicate Leakage in RoCoLe**:
  - `imagehash.phash` deduplication discovered `78` exact/near-duplicate photos in RoCoLe that had been assigned to *different* plant IDs upstream (e.g., `C1P38E1` identical to `C1P35E1`). Deduplicating before `grouped_stratified_split` prevented those duplicate photos from leaking across `train`, `val`, and `test`.
- **Keras 3 `RandomContrast` Default `value_range=(0, 255)` Clipping Bug**:
  - In Keras 3, `layers.RandomContrast` defaults to `value_range=(0, 255)` and clips output values to that range during training. When fed `[-1.0, 1.0]` normalized tensors, it clipped all negative pixel values (`[-1.0, 0.0)`) to `0.0` during training while leaving validation unclipped, capping validation Macro-F1 at `0.4075`. Explicitly passing `value_range=(-1.0, 1.0)` and adding `LayerNormalization` before the classification head jumped frozen-backbone validation Macro-F1 from `0.4075` to **`0.7637`** (`79.72%` test accuracy).

---

## Phase 2 — Coffee Model & Export (Completed, 2026-10-16)

### Built
- **Top-Block Fine-Tuning, Logit Calibration & Grad-CAM Visual Explanations (`#17`)**:
  - Implemented [`ml/src/healthycroppingping_ml/gradcam.py`](../ml/src/healthycroppingping_ml/gradcam.py) and [`ml/tests/test_gradcam.py`](../ml/tests/test_gradcam.py) to compute per-class `GradientTape` spatial activation heatmaps and render 3-panel explanation grids (`Original 224x224` | `Grad-CAM Activation` | `Lesion Focus Overlay`).
  - Enhanced [`ml/src/healthycroppingping_ml/train.py`](../ml/src/healthycroppingping_ml/train.py) with low-RAM `(7, 7, 160)` spatial-feature extraction, $D_4$ dihedral augmentation, `SpatialDropout2D(0.20)`, `AdamW` with `CosineDecay`, and Menon et al. (ICLR 2021) validation-set logit bias calibration.
  - Improved coffee test accuracy from `79.72%` to **`82.75%`** (`0.8701` mean F1 across the 4 major classes covering `89.7%` of the test set; `83.57%` validation accuracy / `0.7911` validation Macro-F1 and `0.7290`–`0.7463` 6-class test Macro-F1 after long-tail calibration), and saved [`docs/assets/confusion_matrices/coffee_finetuned.png`](assets/confusion_matrices/coffee_finetuned.png) and [`docs/assets/gradcam/coffee_gradcam.png`](assets/gradcam/coffee_gradcam.png).
- **GitFlow Branching Structure (`develop` + `main`)**:
  - Configured `develop` as the default protected integration branch (receiving rebase-merged `--rebase` work PRs) and `main` as the protected release branch (receiving merge-commit `--merge` release PRs `chore(release): vX.Y.Z` from `develop`).
- **Float16 TFLite Export, Confidence Threshold, Registry & Shared Fixture (`#18`)**:
  - Implemented [`ml/src/healthycroppingping_ml/export_tflite.py`](../ml/src/healthycroppingping_ml/export_tflite.py) and [`ml/scripts/export_coffee_tflite.py`](../ml/scripts/export_coffee_tflite.py): strips training-only `aug_*` and `head_dropout` layers, exports a batch-1 SavedModel, converts it to float16 TFLite, and evaluates it with the TFLite interpreter on all `426` validation and `429` test images.
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


---

## Phase 3 — App Shell & Design System (In Progress, 2026-10-16)

### Built
- **Expo SDK 52 Android Development Build Setup (`#20`)**:
  - Configured `app/app.json` for Android package `com.keylorpineda.healthycroppingping` with camera and storage permissions, New Architecture enabled (`newArchEnabled: true`), and file-based routing rooted at `src/app`.
  - Installed and pinned Expo SDK 52 (`expo@~52.0.49`, `react@18.3.1`, `react-native@0.76.7`, `expo-router@~4.0.22`, `react-native-reanimated@~3.16.7`, `react-native-gesture-handler@~2.20.2`, `react-native-screens@~4.4.0`, `react-native-safe-area-context@4.12.0`, `expo-haptics@~14.0.1`, `expo-image@~2.0.7`, `expo-localization@~16.0.1`, `zustand@^5.0.15`, `i18next@^24.2.3`, `react-i18next@^15.7.4`).
  - Documented complete pinned toolchain and SDK matrix in `docs/ARCHITECTURE.md` §6.
  - Implemented `app/src/i18n/` with Spanish (`es`) as default market language and English (`en`) secondary, featuring symmetric key structure and mandatory agronomic non-replacement disclaimer.
  - Implemented Zustand preferences store (`app/src/stores/preferences.ts`) for language and theme management.
  - Configured Jest + React Native Testing Library (`jest-expo@~52.0.6`, `@testing-library/react-native@^13.3.3`) with Windows/pnpm module transformations and comprehensive unit tests.
- **Agricultural Design Tokens & Light/Dark Theme System (`#21`)**:
  - Implemented Costa Rican agroecosystem-inspired design token system in `app/src/theme/`: colors (deep leaf greens, soil/coffee browns, coffee/cacao/banana crop accents, semantic status colors), typography scale, spacing, radii, elevation (Android elevations + iOS shadow parameters), and motion tokens (instant, micro, fast, normal, relaxed, spring presets).
  - Built `ThemeProvider` and `useTheme()` hook reacting dynamically to user preferences and system appearance.
  - Implemented `useReducedMotion()` accessibility hook querying system-level accessibility settings.
  - Added unit test suite in `app/src/theme/__tests__/` asserting token integrity and mathematically proving WCAG 2.1 AA relative luminance contrast ratios (>= 4.5:1 for body text, >= 3.0:1 for large text / UI graphical components) across light and dark palettes.
  - Refactored `app/src/app/index.tsx` to consume theme tokens exclusively with zero inline hex literals.
- **Reusable UI Component Library with Micro-Interactions (`#22`)**:
  - Implemented 9 reusable UI primitives in `app/src/components/ui/` with zero one-off inline style overrides, strictly utilizing `app/src/theme/` tokens:
    - `Button`: Press-in spring scale (`0.97`) with snappy release, light haptic feedback via `expo-haptics`, loading indicator, disabled state, and enforced $\ge 48\text{ dp}$ touch target.
    - `Card`: Surface container with elevated (`elevation.sm`), outlined, and flat variants, supporting pressable interactions with spring feedback.
    - `Chip`: Crop selector (`coffee`, `cacao`, `banana`) with spring scale, haptic selection, crop color morphing, and accessible checkbox state.
    - `Badge`: Status and crop indicator pills using WCAG AA-calibrated palettes (`healthy`, `watch`, `actNow`, `lowConfidence`, crop accents).
    - `Sheet`: Animated bottom sheet modal with sliding/fading transitions, grab handle, accessible dismiss backdrop, and close button.
    - `Toast`: In-app notification card with slide-in animation, haptic announcements, auto-dismiss timer, and accessible live regions (`assertive` for errors, `polite` for info/success).
    - `Skeleton`: Shimmer loading placeholder with repeating pulse animation and static fallback for reduced motion, properly hidden from accessibility screen readers.
    - `EmptyState`: Centered empty state layout with icon wrapper, title, description, and primary/secondary action buttons.
    - `ProgressMeter`: Severity-aware progress bar with eased width animation, supporting automatic status mapping (`healthy`, `watch`, `actNow`) and explicit variants.
  - Authored comprehensive Jest + React Native Testing Library test suite in `app/src/components/ui/__tests__/components.test.tsx` verifying rendering, interactions, accessibility roles/labels, and touch target constraints across all 9 primitives.
- **Onboarding, Home, and Settings Screens (`#23`)**:
  - Built `OnboardingScreen` (`app/src/screens/OnboardingScreen.tsx`) featuring 3 educational slides (offline diagnostics, calibrated AI, agronomic decision support), animated paging indicators, and mandatory agronomic disclaimer acceptance required to complete onboarding.
  - Built `HomeScreen` (`app/src/screens/HomeScreen.tsx`) with camera-first layout, large primary Scan CTA for one-handed operation in the field, coffee/cacao/banana crop selection chips, recent scans section with `EmptyState`, and visible offline/sync status indicator.
  - Built `SettingsScreen` (`app/src/screens/SettingsScreen.tsx`) providing instant `es`/`en` language switcher, light/dark/system theme toggle, account/local mode placeholder, dataset credits and licenses (RoCoLe CC BY 4.0, BRACOL CC BY-NC 4.0), active Float16 model version display, and onboarding replay option.
  - Configured Expo Router stack navigation in `app/src/app/` (`_layout.tsx`, `index.tsx`, `settings.tsx`, `onboarding.tsx`) with automatic first-time onboarding dispatching.
  - Authored full unit test coverage in `app/src/screens/__tests__/screens.test.tsx` and updated `app/src/app/__tests__/index.test.tsx`, testing all user flows in Spanish and English with 100% symmetric key structures.
- **On-Device TFLite Inference Pipeline & Shared Fixture Parity (`#24`)**:
  - Installed and pinned native image processing and ML packages (`expo-image-manipulator@~13.0.6`, `jpeg-js@^0.4.4`, `react-native-fast-tflite@1.6.1`, and `@types/node@26.6.5`), updating `docs/ARCHITECTURE.md` §6.
  - Bundled Coffee model registry (`app/src/ml/models/coffee/registry.json`) and shared preprocessing fixture (`app/src/ml/fixtures/preprocessing_fixture_224.json`).
  - Implemented core ML pipeline in `app/src/ml/`:
    - `preprocess.ts`: JPEG decompression via `jpeg-js` (yielding exact 3-channel RGB data), `base64ToUint8Array` binary decoder, and `normalizeRgbTensor` producing normalized float32 tensors in range `[-1.0, 1.0]`.
    - `inference.ts`: Numerically stable `softmax`, `evaluatePrediction` assessing probabilities against the `0.79` calibrated confidence threshold, disease severity mapping, and high-level `runInference` pipeline.
  - Authored cross-platform preprocessing parity test (`app/src/ml/__tests__/parity.test.ts`) loading the Phase 2 Python fixture and verifying exact tensor parity across 35 coordinate canvas probes and overall tensor summary statistics (min `-1.0`, max `1.0`, sum `-447.15`) within float32 tolerance (`1e-5`).
  - Authored unit test suite (`app/src/ml/__tests__/inference.test.ts`) verifying softmax stability, threshold abstention, disease severity mapping, and mock runner execution.
- **Camera Screen, Photo Tips, Analyzing Animation & Result Screen (`#25`)**:
  - Installed and pinned `expo-camera@~16.0.18` and `expo-image-picker@~16.0.6`, documented in `docs/ARCHITECTURE.md` §6.
  - Built `PhotoTipsSheet` (`app/src/components/camera/PhotoTipsSheet.tsx`) providing crop-specific guidance (coffee undersides for rust/miner, whole cacao pods for monilia/black pod, leaf striations for banana sigatoka).
  - Built `CameraScreen` (`app/src/screens/CameraScreen.tsx`) with real-time viewfinder, pulsing framing guide, shutter flash effect, tactile haptic feedback (`expo-haptics`), and gallery image picker.
  - Built `AnalyzingOverlay` (`app/src/components/camera/AnalyzingOverlay.tsx`) with continuous sweep scan-line animation, reduced-motion accessibility support, and 100% offline indicator badge.
  - Built `ResultScreen` (`app/src/screens/ResultScreen.tsx`) displaying the hero photo, severity-colored `ProgressMeter`, pop-in diagnosis status badge (`healthy`, `watch`, `actNow`), tactile haptic feedback (Success/Warning/Error), low-confidence retake guidance (`"Confianza baja — repita la captura"`), probability breakdown by class, recommended next steps, and non-replacement agronomic disclaimer.
  - Implemented `/scan` route (`app/src/app/scan.tsx`) integrating Camera -> Analyzing -> Result pipeline with fallback error handling, connected to `HomeScreen`'s primary Scan CTA.
  - Authored comprehensive Jest + RNTL unit and integration test suite (`app/src/screens/__tests__/camera_result.test.tsx`), verifying all user interactions and Spanish/English copy parity.
- **`expo-sqlite` Persistence, History Screen, Scan Detail & Farms/Plots CRUD (`#26`)**:
  - Installed and pinned `expo-sqlite@~15.1.2` and `expo-crypto@~14.0.2`, updating `docs/ARCHITECTURE.md` §6.
  - Implemented offline-first relational database architecture in `app/src/db/`:
    - DDL schema (`schema.ts`) with WAL mode (`journal_mode = WAL`), foreign keys enabled, tables for `farms`, `plots`, `scans`, and sync queue indices (`farm_id`, `plot_id`, `crop`, `severity`, `scanned_at`, `deleted_at`, `sync_status`).
    - Standard repositories (`farmsRepository`, `plotsRepository`, `scansRepository`) supporting client-generated UUIDs (RFC 4122 v4 via `expo-crypto`), soft-deletes (`deleted_at`), query filters, and swipe-to-delete undo restoration.
    - Added unit test suite in `app/src/db/__tests__/repositories.test.ts`.
  - Built `HistoryScreen` (`app/src/screens/HistoryScreen.tsx`) with crop filter chips (`all`, `coffee`, `cacao`, `banana`), severity filter (`all`, `healthy`, `watch`, `actNow`), farm filter, card list, swipe/tap to delete with undo `Toast`, and pull-to-refresh.
  - Built `ScanDetailScreen` (`app/src/screens/ScanDetailScreen.tsx`) with full diagnosis breakdown, confidence meter, probability list, farm/plot association bottom sheet (`Sheet`), and deletion option.
  - Built `FarmsScreen` (`app/src/screens/FarmsScreen.tsx`) allowing farmers to register farms (name, region, altitude) and add plots (name, crop, area in ha) with inline delete.
  - Wired Expo Router stack routes (`/history`, `/scan-detail`, `/farms`) in `app/src/app/`, connected automatic diagnosis persistence on `/scan`, and exposed History and Farms navigation from `HomeScreen`.
  - Authored comprehensive Jest + RNTL test suite in `app/src/screens/__tests__/history_farms.test.tsx` verifying screen flows and Spanish/English translations.

### Problems Solved
- **Jest pnpm / Windows Module Resolution for React Native**:
  - `pnpm`'s hoisted directory structure places packages inside `.pnpm/<name>@<ver>/node_modules/<name>`, and Windows uses backslashes in paths. Configured `transformIgnorePatterns` in `app/jest.config.js` to match both Windows separators and `.pnpm` paths so `@react-native`, `react-native`, and `expo` are properly transformed through Babel, resolving syntax errors on Flow type annotations in `@react-native/js-polyfills`.

---

## Phase 5 — Cacao & Banana Models (`v0.3.0`)

### Decisions Made
- **Cacao Dataset Licensing & YOLO Pod Cropping (`#27`)**:
  - Verified open licenses in `docs/DATASETS.md` for **CocoaMoniliaDataSet** (Zenodo `10.5281/zenodo.17156051`, CC BY 4.0) and **UNAB Cocoa Diseases** (`serranosebas/enfermedades-cacao-yolov4`, ODbL v1.0).
  - Implemented `ml/scripts/download_cocoamonilia.py` (with Zenodo `md5:` checksum verification) and `ml/scripts/download_unab_cacao.py` (with Kaggle public API v1 download fallback).
  - Verified `classes.txt` in UNAB (`0 = Fitoftora` -> `black_pod`, `1 = Monilia` -> `monilia`, `2 = Sana` -> `healthy`) and configured `ml/configs/cacao.yaml` with `5%` bounding-box margin (`box_margin: 0.05`).
  - Implemented `ml/scripts/prepare_cacao.py` cropping each YOLO pod bounding box to `224x224` RGB while grouping all pods from the same parent photograph under `group_id = unab_<stem>` to prevent cross-split leakage.
  - Produced `2,646` clean preprocessed cacao pod images (`1,863` `healthy`, `556` `monilia`, `227` `black_pod`) across `1,367` distinct `group_id`s after removing `5` perceptual-hash near-duplicates (`d_Hamming <= 2`), with zero `group_id` overlap across the `70/15/15` split (`seed=42`).
  - Generated `docs/data_reports/cacao.md` and `docs/assets/data_reports/cacao_grid.png`, and added unit tests in `ml/tests/test_prepare_cacao.py` and `ml/tests/test_download.py`.
- **Standardized Milestone Granularity & Release CI Fix**:
  - Standardized all 8 repository milestones (`v0.1.0` through `v1.2.0`) to 7–10 single-PR issues each without duplicate PR milestone counting.
  - Replaced `android-actions/setup-android@v3` in `.github/workflows/release.yml` so Command-Line Tools 16.0 no longer fails on the removed `tools` package.
- **Cacao `MobileNetV3-Large` Baseline, Top-30 Fine-Tuning & Grad-CAMs (`#28`)**:
  - Implemented `ml/scripts/train_cacao.py` and `ml/tests/test_train_cacao.py`.
  - Trained frozen-backbone baseline `cacao-v0.1.0-baseline` (`87.47%` test accuracy, `0.7946` test Macro-F1) and top-30 fine-tuned model `cacao-v0.1.0-finetuned` (`91.73%` test accuracy, `0.8502` test Macro-F1, `0.9532` `healthy` F1, `0.8553` `monilia` F1, `0.7419` `black_pod` F1).
  - Generated test confusion matrices (`docs/assets/confusion_matrices/cacao_baseline.png`, `cacao_finetuned.png`) and Grad-CAM visual explanations (`docs/assets/gradcam/cacao_gradcam.png`) and documented all runs in `docs/EXPERIMENTS.md`.
- **Cacao Float16 TFLite Export, Threshold Calibration & Model Card (`#70`)**:
  - Implemented `ml/scripts/export_cacao_tflite.py` and exported `ml/models/cacao/cacao_v0.1.0_fp16.tflite` (`6,055,744` bytes = `6.06 MB`, `< 10 MB`).
  - Verified bit-level parity: TFLite test accuracy is **`91.73%`** (`0.00 pp` drop vs. Keras) with **`100.00%`** top-1 agreement (`399/399` test pods).
  - Calibrated confidence threshold `0.51` (`90.15%` validation accepted precision, `91.73%` test accepted precision at `100.0%` coverage), wrote `ml/models/cacao/registry.json`, and populated `docs/MODEL_CARD.md` §3 and `docs/EXPERIMENTS.md` §3.6.

### Problems Solved
- **Scan Photo Persistence & SQLite Foreign Keys (`#101`)**:
  - Scans stored the camera/image-picker cache URI, which Android may purge at any time. `persistScanPhoto` (`app/src/db/photoStorage.ts`, `expo-file-system`) now copies each photo into `documentDirectory/scans/<uuid>.<ext>` before the scan is written, falling back to the original URI if the copy fails.
  - `initDatabase` now runs `PRAGMA foreign_keys = ON` on every connection, so the schema's `ON DELETE CASCADE` (farms -> plots) and `ON DELETE SET NULL` (scans) clauses are enforced.
- **On-Device Model Bundling & Multi-Crop Registry Routing (`#100`)**:
  - `react-native-fast-tflite` 1.6.1 treats any `{ url }` containing `://` as a disk path or HTTP URL, so the former `file:///android_asset/models/...` source could never resolve a bundled model. Bundled models are now loaded by Android raw resource name (`getModelResourceName` in `app/src/ml/registry.ts`), which the library resolves with `getIdentifier(name, "raw")`.
  - Added the Expo config plugin `app/plugins/withTfliteModels.js`, which copies every model listed in `app/src/ml/models/<crop>/registry.json` from `ml/models/<crop>/` into `android/app/src/main/res/raw/` during `expo prebuild`, verifies its SHA-256, warns on missing weights, and fails when `HEALTHYCROPPING_REQUIRE_MODELS=1` (set for the `v1.0.0` release APK build).
  - Cacao and banana registries previously spread the coffee registry and pointed at the 6-class coffee model, so every cacao/banana scan failed with an output dimension mismatch. The app now loads the exported cacao registry, keeps banana unselectable until its model exists, persists a registry-derived `model_version`, and shows an error toast when inference fails.

### Banana Datasets (`#29`)
- Verified both banana licenses through their public APIs: BananaLSD (Mendeley `9tb7k297ff`, CC BY 4.0) and Banana Imagery Dataset - Tanzania (Zenodo `7670326`, `cc-by-4.0`; the NM-AIST DSpace mirror times out).
- The Zenodo record is nine 2-7 GB ZIP archives (~34 GB). Added `ml/src/healthycropping_ml/remote_zip.py`, which reads only the End Of Central Directory and Central Directory through HTTP `Range` requests and extracts contiguous, CRC-32-verified batches of entries (ZIP64-aware). `ml/scripts/download_banana_nmaist.py` uses it to pull the first 300 `healthy`, 150 `black_sigatoka`, and 300 `fusarium_wilt` images (~2 GB instead of 34 GB). Zenodo throttles single connections, so batches are fetched over 6 parallel, rate-limited connections that retry HTTP 429 after `Retry-After`.
- BananaLSD `AugmentedSet/` is excluded (synthetic copies of `OriginalSet/` photos would leak across splits); `cordana` and `pestalotiopsis` (`335` photos) are outside the taxonomy.
- NM-AIST publishes no plant IDs, so blocks of 10 consecutive capture numbers share a `group_id`. pHash removed `39` near-duplicates (all within BananaLSD `healthy`). Final dataset: `1,313` images, `770` groups, `913 / 200 / 200` split with zero group overlap.
- `fusarium_wilt` only exists in NM-AIST; NM-AIST `healthy` and `black_sigatoka` photos are also ingested so the model cannot separate the classes by source alone.

### Banana Training & Export (`#30`, `#71`)
- Trained `banana-v0.1.0-baseline` (`0.9676` test Macro-F1) and `banana-v0.1.0-finetuned` (`0.9731`) with the cacao recipe on CPU (TensorFlow `2.21.0` has no native Windows GPU support; each run takes about one minute thanks to cached spatial features).
- Added `breakdown_by_group` (`ml/src/healthycropping_ml/evaluate.py`) and `ml/scripts/evaluate_by_source.py` to check for source shortcuts, since `fusarium_wilt` only comes from NM-AIST: NM-AIST `healthy` (`51/51`) and `fusarium_wilt` (`45/46`) are separated within the same source, so the model is not classifying by photo style alone.
- Validation precision saturated (`99.5%` at full coverage), so threshold calibration returned `0.30` (chance level for 3 classes) and the app would never ask for a retake. Added `--threshold-floor` to the export pipeline (default `0.30` keeps coffee/cacao unchanged) and exported banana with `0.80`, which rejects `3` of `5` test errors at `97%` coverage.
- The export wrote `registry.json` and the shared preprocessing fixture with CRLF line endings on Windows, producing spurious diffs; both are now written with `newline="
"`.
