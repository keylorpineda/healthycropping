# HealthyCrop — Master Implementation Plan

This document tracks the phased delivery of **HealthyCrop** (`com.keylorpineda.healthycrop`). Work proceeds strictly one phase at a time, in order. Every task maps to an atomic GitHub Issue (`0.5–2` days of work) on the GitHub Project board.

---

## Milestones Overview

| Milestone | Phases | Issues | Target Date | Deliverable |
| :--- | :--- | :--- | :--- | :--- |
| **`v0.1.0 — Foundation & Coffee ML`** | Phases 0–2 | `#10`–`#19` (10) | `2026-10-30` | Monorepo, CI, Community Standards, RoCoLe/BRACOL data pipeline, fine-tuned Coffee float16 TFLite model + shared fixture |
| **`v0.2.0 — Offline Android App & Coffee Diagnosis`** | Phases 3–4 | `#20`–`#26` (7) | `2026-11-13` | Expo Android dev build, design system & UI library, camera/gallery capture, on-device TFLite inference, SQLite history |
| **`v0.3.0 — Multi-Crop Models (Cacao & Banana)`** | Phase 5 | `#27`–`#31` (5) | `2026-11-27` | Cacao pod and Banana leaf datasets prepared, `MobileNetV3-Large` float16 TFLite models bundled, 3-crop offline diagnosis |
| **`v0.4.0 — Accounts & Sync`** | Phase 6 | `#32`–`#34`, `#46`–`#48` (6) | `2026-12-04` | FastAPI backend, Firebase Auth & Admin Firestore isolation, farms/plots CRUD, idempotent scan sync, signed Cloudinary uploads, Android sync engine |
| **`v0.5.0 — AI Explanations (Gemini RAG)`** | Phase 7 | `#35`–`#37`, `#49`–`#50` (5) | `2026-12-14` | Official manual fetcher/chunker, local RAG embedding index, `POST /explanations` with citations & refusal, caching/rate-limiting, Android UI integration |
| **`v1.0.0 — Field Validation & Release`** | Phase 8 | `#38`–`#39`, `#51`–`#53` (5) | `2026-12-22` | Costa Rican field validation & failure analysis, WCAG AA accessibility audit, final metrics/docs, and `v1.0.0` APK + models release |
| **`v1.1.0 — Maps, Hotspots & Weather Alerts`** | Post-MVP | `#40`–`#42` (Epics) | `2027-01-08` | Google Sign-In, OpenStreetMap plot map with hotspots, rule-based Open-Meteo weather risk alerts |
| **`v1.2.0 — Earth Engine NDVI & Crop Expansion`** | Post-MVP | `#43`–`#44` (Epics) | `2027-01-25` | Monthly cloud-masked Sentinel-2 NDVI per plot via Google Earth Engine Community tier, additional crops |

---

## Phase 0: Setup, Repo & Community Standards
**Milestone:** `v0.1.0 — Foundation & Coffee ML` (`#10`–`#12`)

### Tasks
- [x] Create root workspace files: `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.npmrc` (`node-linker=hoisted` documented), `pnpm-workspace.yaml`, root `package.json`, `.vscode/extensions.json`, and `.pre-commit-config.yaml`.
- [x] Create `.env.example` templates for `api/` and `app/`.
- [x] Complete GitHub Community Standards: `README.md`, `LICENSE` (MIT, Keylor Pineda), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CITATION.cff`, `CHANGELOG.md`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/` (`bug_report.yml`, `feature_request.yml`, `model_issue.yml`, `config.yml`), and `.github/dependabot.yml`.
- [x] Write `AGENTS.md` (< 4,000 characters) and core engineering docs: `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DATASETS.md`, `docs/MODEL_CARD.md`, `docs/EXPERIMENTS.md`, `docs/FIELD_VALIDATION.md`, `docs/DEVLOG.md`, and `docs/SETUP_SERVICES_ES.md` (in Spanish).
- [x] Configure empty test/lint/typecheck suites for `app/`, `api/`, and `ml/` alongside `.github/workflows/ci.yml` and `.github/workflows/release.yml`.
- [x] Create public GitHub repository `keylorpineda/healthycrop`, push initial commit, configure branch protection on `main`, set up labels, milestones (`v0.1.0`–`v1.2.0`), and link the GitHub Project board.
- [x] Create Phase 0–8 issues (and v1.1/v1.2 epics) after user approval of the issue list; retroactively close Phase 0 issues referencing the initial setup commits/PR.

### Done when
- Community Standards checklist is 100% complete on GitHub.
- Repository labels, concrete `v0.x`/`v1.x` milestones with due dates (`5–10` issues each), and GitHub Project board (`Todo`, `In progress`, `In review`, `Done`) exist.
- GitHub Actions `ci.yml` runs green on `main` across `app`, `api`, and `ml` empty suites.

---

## Phase 1: Coffee Data & Baseline
**Milestone:** `v0.1.0 — Foundation & Coffee ML` (`#13`–`#16`)

### Tasks
- [x] Inspect and verify licenses for **RoCoLe** (DOI `10.17632/c5yvn32dzg.2`) and **BRACOL** (Mendeley `yy2k5y8mxg`); record full metadata and citations in `docs/DATASETS.md`.
- [x] Implement idempotent, checksum-verified download scripts `ml/scripts/download_rocole.py` and `ml/scripts/download_bracol.py` targeting `ml/data/raw/<dataset>/` (with clear manual fallback + structural verification if automated download is blocked by host).
- [x] Create `ml/configs/coffee.yaml` defining class taxonomy mapping (`healthy`, `leaf_rust` + severity, `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite`), image size (`224x224`), and split parameters.
- [x] Implement `ml/scripts/prepare_coffee.py` (with unit-tested core logic in `ml/src/`) to fix EXIF orientation, drop corrupt images, convert to RGB, filter BRACOL to whole-leaf images, deduplicate across sources via perceptual hash (`imagehash`), and generate a leakage-free `70/15/15` split grouped by `group_id` (plant) and stratified by label (`seed=42`).
- [x] Evaluate any coffee class with `< 50` training images for merging and document the decision; generate `docs/data_reports/coffee.md` (split counts, sample grids, duplicates removed).
- [x] Implement baseline training script (`ml/src/train.py` + Colab notebook) using `MobileNetV3-Large` (`ImageNet` weights, frozen backbone only, class weights, standard augmentations) and log test metrics + confusion matrix in `docs/EXPERIMENTS.md`.

### Done when
- `download_rocole.py`, `download_bracol.py`, and `prepare_coffee.py` run reproducibly with unit tests covering deduplication and grouped stratified splitting (`seed=42`, zero `group_id` overlap across splits).
- Licenses and citations are recorded in `docs/DATASETS.md` and split stats/grids are committed in `docs/data_reports/coffee.md`.
- Frozen-backbone `MobileNetV3-Large` baseline metrics (per-class precision/recall/F1, macro-F1, confusion matrix PNG) are logged in `docs/EXPERIMENTS.md`.

---

## Phase 2: Coffee Model & Export
**Milestone:** `v0.1.0 — Foundation & Coffee ML` (`#17`–`#19`)

### Tasks
- [x] Fine-tune top layers of `MobileNetV3-Large` on the coffee dataset at a lower learning rate after head warm-up, with early stopping on validation macro-F1; log runs in `docs/EXPERIMENTS.md` (target test macro-F1 >= `0.80`, or document experiments and root causes).
- [x] Generate Grad-CAM visual explanations per coffee class for `README.md` and `docs/MODEL_CARD.md`.
- [x] Export the best coffee model to float16 TFLite (`< 10 MB`) via `ml/src/healthycrop_ml/export_tflite.py` and verify TFLite test accuracy is within `1 pp` of the Keras model.
- [x] Calibrate the validation confidence threshold and write `ml/models/coffee/registry.json` (model filename, version, ordered labels, input size `224x224`, normalization parameters, confidence threshold).
- [x] Create a deterministic shared fixture test (`ml/tests/test_preprocessing_fixture.py` + `ml/fixtures/preprocessing_fixture_224.json`) exporting reference RGB bytes and normalized tensor values so the React Native app can prove identical preprocessing.
- [x] Complete the coffee section of `docs/MODEL_CARD.md`.

### Done when
- Fine-tuned coffee model achieves macro-F1 >= `0.80` on the held-out test split (or thorough ablation is documented in `docs/EXPERIMENTS.md`).
- Exported float16 `.tflite` model is `< 10 MB` and its test accuracy is within `1.0` percentage point of the Keras checkpoint.
- `ml/models/coffee/registry.json` and the shared preprocessing fixture are committed and verified by automated tests.

---

## Phase 3: App Shell & Design System
**Milestone:** `v0.2.0 — Offline Android App & Coffee Diagnosis` (`#20`–`#23`)

### Tasks
- [ ] Initialize the Expo SDK Android application in `app/` (`com.keylorpineda.healthycrop`) using Expo Router, TypeScript strict, NativeWind, Reanimated, Gesture Handler, `expo-haptics`, `expo-image`, Zustand, and `i18next` (`es` default, `en` secondary); pin and document all native package versions in `docs/ARCHITECTURE.md`.
- [ ] Build the agricultural design token system in `app/src/theme/` (deep leaf greens, soil/coffee browns, crop accents for coffee/cacao/banana, light/dark themes, typography scale, spacing, radii, elevation, and reduced-motion-aware animation tokens).
- [ ] Build and unit-test the reusable UI component library in `app/src/components/ui/`: `Button` (press-in scale `0.97` + spring release), `Card`, `Chip` (spring + crop color morph), `Badge`, `Sheet`, `Toast`, `Skeleton`, `EmptyState`, and `ProgressMeter` (WCAG AA contrast, touch targets >= `48 dp`, accessibility labels).
- [ ] Implement the Onboarding screen (3 slides + mandatory non-replacement agronomic disclaimer), Home screen (camera-first layout with primary Scan CTA, crop selector chips, recent scans placeholder, offline/sync status pill), and Settings screen (language switcher `es`/`en`, light/dark theme toggle, account status placeholder, About screen with dataset credits and model versions).
- [ ] Build and verify the development build on a physical Android phone.

### Done when
- Design tokens (`app/src/theme/`) and all 9 UI components (`app/src/components/ui/`) pass Jest + React Native Testing Library tests with zero one-off inline style overrides.
- Onboarding, Home, and Settings screens work in both Spanish (`es`) and English (`en`) and light/dark themes on a physical Android phone.

---

## Phase 4: Camera, Inference & Offline History
**Milestone:** `v0.2.0 — Offline Android App & Coffee Diagnosis` (`#24`–`#26`)

### Tasks
- [ ] Implement the on-device inference pipeline in `app/src/ml/`: `expo-camera` / `expo-image-picker` -> `expo-image-manipulator` (`224x224` resize) -> `jpeg-js` raw RGB decoding -> training normalization -> `react-native-fast-tflite` execution with bundled `registry.json`.
- [ ] Write a Jest test verifying `app/src/ml/` preprocessing against the shared Python fixture from Phase 2 (exact tensor parity within floating-point tolerance).
- [ ] Implement crop-specific photo tips sheet before the first scan of each crop, Camera screen (framing guide pulse, shutter flash + light haptic, gallery picker), and Analyzing screen (scan-line sweep animation).
- [ ] Implement the Result screen: hero photo, severity eased progress meter, confidence count-up, status badge (`healthy` / `watch` / `act now`) with pop-in + matching haptic, low-confidence retake state (`"low confidence — retake the photo"`), local summary + next steps, and agronomic disclaimer.
- [ ] Implement `expo-sqlite` persistence for farms, plots, scans, and sync queue (`client_uuid`, `sync_status`), plus History screen (crop/status/farm filters, staggered entrance, swipe-to-delete with undo toast, pull-to-refresh), Scan Detail screen (card-to-detail transition), and Farms & Plots management screens.

### Done when
- Shared preprocessing fixture test passes in both `ml/` (`pytest`) and `app/` (`jest`).
- A coffee leaf photo captured or picked from gallery on a physical Android phone in airplane mode is diagnosed on-device, displays the animated Result screen, and persists in `expo-sqlite` across app restarts with working History and Farms/Plots management.

---

## Phase 5: Cacao & Banana Models
**Milestone:** `v0.3.0 — Multi-Crop Models (Cacao & Banana)` (`#27`–`#31`)

### Tasks
- [ ] Verify dataset licenses for **CocoaMoniliaDataSet** (Zenodo `10.5281/zenodo.17156051`), **UNAB cocoa diseases** (Kaggle `serranosebas/enfermedades-cacao-yolov4`), **Banana Leaves Imagery** (NM-AIST DSpace `20.500.12479/3003` / DOI `10.1038/s41597-025-04456-4`), and **BananaLSD** (Mendeley `9tb7k297ff`); update `docs/DATASETS.md`. Stop and ask user if any license is unclear.
- [ ] Implement download and preparation scripts (`download_*.py`, `prepare_cacao.py` with YOLO bounding-box pod cropping, `prepare_banana.py`, `ml/configs/cacao.yaml`, `ml/configs/banana.yaml`) with perceptual-hash deduplication and grouped `70/15/15` splits (`seed=42`); generate `docs/data_reports/cacao.md` and `docs/data_reports/banana.md`.
- [ ] Train baseline (frozen) and fine-tuned `MobileNetV3-Large` models for cacao (`healthy`, `monilia` by stage, `black_pod`) and banana (`healthy`, `black_sigatoka`, `fusarium_wilt`); log metrics, confusion matrices, and Grad-CAM samples in `docs/EXPERIMENTS.md` and `docs/MODEL_CARD.md`.
- [ ] Export float16 TFLite models (`< 10 MB` each, accuracy within `1 pp` of Keras), create `ml/models/cacao/registry.json` and `ml/models/banana/registry.json`, bundle all 3 crop models into `app/`, and enable cacao and banana selection in the app UI.

### Done when
- Cacao and banana data reports, experiment logs, Grad-CAM samples, and model card sections are complete.
- Both float16 `.tflite` models (`< 10 MB`, within `1 pp` of Keras accuracy) are bundled in `app/`, and all 3 crops (Coffee, Cacao, Banana) can be selected and diagnosed offline on a physical Android phone.

---

## Phase 6: API, Auth & Sync
**Milestone:** `v0.4.0 — Accounts & Sync` (`#32`–`#34`, `#46`–`#48`)

### Tasks
- [ ] Implement FastAPI application structure in `api/` (`GET /health`, Pydantic v2 schemas, structured error handling, CORS) and deployable Firestore security rules (`firestore.rules`) denying all direct client reads/writes (`#32`).
- [ ] Implement Firebase ID token verification dependency via `firebase-admin` and `CRUD /farms` + `CRUD /plots` with `ownerUid` multi-tenant isolation and User A vs. User B test (`#33`).
- [ ] Implement idempotent batch `POST /scans/sync` (by client UUID), `GET /scans`, and signed Cloudinary upload parameter generation (`max 1280 px`, scoped to `users/{uid}/scans`) (`#46`).
- [ ] Integrate Firebase Auth (email/password sign-up, sign-in, sign-out) and token injection in `app/`, keeping offline diagnosis unrestricted without an account (`#34`).
- [ ] Implement the Android SQLite sync engine (`app/src/services/sync.ts`), Cloudinary client upload (`<= 1280 px`), and `sync pulse -> checkmark morph` status indicator (`#47`).
- [ ] Verify end-to-end multi-tenant sync contract and Render deployment configuration (`#48`).

### Done when
- All `api/` endpoints pass `pytest + httpx`, `ruff`, and `mypy`, including the User A vs. User B isolation test and idempotent re-sync test.
- User can sign up/sign in on the Android app, create farms/plots, upload compressed scan photos via signed Cloudinary params, and sync offline scans idempotently to the API.

---

## Phase 7: Gemini RAG Explanations
**Milestone:** `v0.5.0 — AI Explanations (Gemini RAG)` (`#35`–`#37`, `#49`–`#50`)

### Tasks
- [ ] Implement `api/scripts/fetch_agronomic_docs.py` and section chunker over official technical documents per crop (ICAFE for coffee; official public agricultural institutions for cacao and banana) without committing restricted PDFs (`#35`).
- [ ] Implement `api/scripts/build_rag_index.py` and the local top-k retriever preserving `(source, section)` citation metadata (`#49`).
- [ ] Implement `POST /explanations` in `api/` using `google-genai` (`GEMINI_MODEL` env var, free-tier Flash model) to generate plain-Spanish/English explanations + next steps citing source and section, and explicitly declining when not covered (`#36`).
- [ ] Enforce strict privacy (never sending names, emails, or coordinates), response caching by `(crop, class, severity, language)`, and `20 requests/user/hour` rate limiting via `slowapi` (`#50`).
- [ ] Connect the app's Result and Scan Detail screens to display cached or freshly fetched RAG explanations with cited sources when online, and graceful offline fallback when disconnected (`#37`).

### Done when
- `POST /explanations` returns grounded explanations citing specific document titles and sections, declines out-of-scope queries in automated tests, never transmits PII/coordinates, caches by `(crop, class, severity, language)`, and enforces the `20/hour` per-user limit.
- App Result and Scan Detail screens render the cited AI explanation and next steps alongside the agronomic disclaimer.

---

## Phase 8: Testing, Field Validation & v1.0.0
**Milestone:** `v1.0.0 — Field Validation & Release` (`#38`–`#39`, `#51`–`#53`)

### Tasks
- [ ] Execute the Costa Rican field validation protocol across coffee, cacao, and banana photos in airplane mode and record empirical measurements in `docs/FIELD_VALIDATION.md` (`#38`).
- [ ] Analyze field validation agreement rates, confidence threshold calibration, and lighting/angle failure modes in `docs/FIELD_VALIDATION.md` (`#51`).
- [ ] Complete end-to-end WCAG AA contrast, `>= 48 dp` touch target, TalkBack label, and reduced-motion accessibility audit across all app screens (`#52`).
- [ ] Finalize `README.md` and `docs/MODEL_CARD.md` with empirical metrics tables, confusion matrices, Grad-CAM samples, and Android screenshots/demo GIF (`#53`).
- [ ] Tag `v1.0.0`, trigger `.github/workflows/release.yml`, and publish the GitHub Release containing `CHANGELOG.md` notes, the installable Android `.apk`, and the three `.tflite` models + `registry.json` files (`#39`).

### Done when
- `ci.yml` is green across all suites, `docs/FIELD_VALIDATION.md` and `README.md` are complete with real evaluation artifacts, and GitHub Release `v1.0.0` is live with the signed/installable APK and `.tflite` models attached.

---

## Post-MVP Roadmap (Epics)

### Milestone `v1.1.0 — Maps, Hotspots & Weather Alerts` (`#40`–`#42`, due `2027-01-08`)
- [ ] **Google Sign-In Integration (`#40`)**: Add native Google OAuth sign-in alongside email/password in Firebase Auth and the Android client.
- [ ] **OpenStreetMap Plot Map with Disease Hotspots (`#41`)**: Interactive offline-capable plot boundary and scan hotspot visualization using OpenStreetMap tiles.
- [ ] **Open-Meteo Weather Risk Alerts (`#42`)**: Conservative, rule-based microclimate disease risk estimates using Open-Meteo historical/forecast humidity, temperature, and precipitation data (with non-commercial `CC BY 4.0` attribution and clear estimation disclaimers).

### Milestone `v1.2.0 — Earth Engine NDVI & Crop Expansion` (`#43`–`#44`, due `2027-01-25`)
- [ ] **Earth Engine Sentinel-2 NDVI per Plot (`#43`)**: Monthly cloud-masked Sentinel-2 NDVI time series per plot via Google Earth Engine noncommercial Community tier in `api/` (service-account credentials strictly outside Git).
- [ ] **Additional Costa Rican Crops (`#44`)**: Expand the `ml/` pipeline and `app/` model registry to support additional regional crops.
