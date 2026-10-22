<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg">
  <img src="docs/assets/hero-light.svg" alt="HealthyCropping: offline crop disease diagnosis on Android" width="100%">
</picture>

<p align="center">
  <a href="https://github.com/keylorpineda/healthycropping/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/keylorpineda/healthycropping/ci.yml?branch=develop&event=push&style=flat-square&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/badge/React%20Native-0.76-059669?style=flat-square" alt="React Native 0.76">
  <img src="https://img.shields.io/badge/Expo-52-059669?style=flat-square" alt="Expo 52">
  <img src="https://img.shields.io/badge/TensorFlow%20Lite-2.16-059669?style=flat-square" alt="TensorFlow Lite">
  <img src="https://img.shields.io/badge/FastAPI-0.115-059669?style=flat-square" alt="FastAPI">
  <img src="https://img.shields.io/badge/Python-3.12-059669?style=flat-square" alt="Python 3.12">
  <img src="https://img.shields.io/badge/SQLite-Offline-059669?style=flat-square" alt="SQLite Offline">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-059669?style=flat-square" alt="MIT License"></a>
</p>

Smallholder and medium-scale producers of coffee (*Coffea arabica* / *canephora*), cacao (*Theobroma cacao*), and banana (*Musa* spp.) in Central America frequently work in mountainous or rural plots with intermittent or zero cellular connectivity. Identifying pathogens early—such as coffee leaf rust (*Hemileia vastatrix*), cacao frosty pod rot (*Moniliophthora roreri*), or banana black Sigatoka (*Pseudocercospora fijiensis*)—is critical to timing cultural controls and preventing yield loss, yet cloud-only diagnostic tools fail in the field when connectivity drops.

**HealthyCropping** (`com.keylorpineda.healthycropping`) is an open-source, non-commercial, offline-first Android application. It runs quantized computer vision models directly on the phone with sub-50ms inference, records scans and plot geometries locally in SQLite, and synchronizes with a FastAPI backend and Gemini RAG advisory layer grounded in certified institutional literature (ICAFE, CATIE, CORBANA) once connectivity is restored.

> **Agronomic Disclaimer**: HealthyCropping is a non-commercial, open-source decision-support tool designed initially for Costa Rica. **It supports field decisions and does not replace a certified agronomist or phytosanitary laboratory.** Always consult an agricultural professional before applying agrochemicals or removing plants.

---

## Active Development Status

The project is structured into 9 execution phases according to [`docs/PLAN.md`](docs/PLAN.md):

| Phase | Milestone | Scope | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Foundation & Governance | Monorepo layout, strict linting (`ruff`, `mypy`, ESLint), CI quality gates | Completed |
| **Phase 2** | Coffee Model Pipeline | MobileNetV3 TFLite, INT8/FP16 export, verified 224x224 RGB parity | Completed |
| **Phase 3** | Core Mobile Shell | Expo React Native, SQLite schema, agricultural design system, Spanish UI | Completed |
| **Phase 4** | Edge Inference & Scanner | On-device TFLite camera, reticle framing, confidence thresholding, triage | Completed |
| **Phase 5** | Multi-Crop Expansion | Cacao pod and banana leaf specialist models, multi-crop app routing | Completed |
| **Phase 6** | FastAPI & Cloud Sync | Farm/plot sync endpoints, Firebase Admin auth, Cloudinary image ingestion | In Progress |
| **Phase 7** | Grounded Gemini RAG | Institutional agronomy corpus, citation retrieval, safe treatment advice | In Progress |
| **Phase 8** | Performance & Hardening | Low-end Android hardware benchmarks, field daylight testing | Scheduled |
| **Phase 9** | Field Validation & Release | Signed APK distribution, farmer pilot in Tarrazu, Costa Rica | Scheduled |

---

## How It Works

```mermaid
flowchart LR
    A["1. Select Crop\n(Coffee / Cacao / Banana)"] --> B["2. Capture Photo\n(Guided framing tips)"]
    B --> C["3. On-Device Preprocessing\n(224x224 RGB + normalize)"]
    C --> D["4. Offline TFLite Inference\n(MobileNetV3 float16 / INT8)"]
    D --> E["5. Instant Local Result\n(Class, Severity, SQLite)"]
    E -. "Optional when online" .-> F["6. Cloud Sync & Gemini RAG\n(FastAPI + Cited Manuals)"]
```

1. **Crop Selection**: The user selects **Coffee** (leaf underside), **Cacao** (pod), or **Banana** (leaf) prior to scanning so a dedicated specialist model runs for that crop.
2. **Offline On-Device Inference**: The captured photo is resized to `224x224`, decoded to raw RGB, normalized with exact training statistics, and evaluated locally in `< 50ms` using `react-native-fast-tflite`.
3. **Actionable Triage & Thresholding**: If confidence falls below the calibrated validation threshold, the app instructs the user to retake the photo. Otherwise, it reports predicted class, severity level, confidence, and recommended triage action (`healthy`, `watch`, or `act now`).
4. **Local Persistence & Optional Sync**: Scans, farms, and plots are stored locally in `expo-sqlite` with client-generated UUIDs. Account creation is optional and used solely to synchronize records idempotently through the FastAPI backend (`api/`).
5. **Grounded RAG Advisory**: When online, the backend retrieves passages from official technical manuals (ICAFE for coffee, CATIE for cacao, CORBANA for banana) and utilizes Gemini to summarize recommendations without hallucinated chemical remedies.

---

## Supported Crops & Model Architectures

One fine-tuned `MobileNetV3` model is trained, evaluated, and exported per crop (`224x224` RGB input, quantized TFLite `< 10 MB`):

| Crop | Target Organ | Target Classes | Evaluation Metric | Export Format | Documentation |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Coffee** | Leaf (underside) | `healthy`, `leaf_rust` (+ severity), `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite` | `> 90%` Macro-F1 | FP16 / INT8 TFLite | [Model Card](docs/MODEL_CARD.md#2-coffee-leaf-model-coffee) |
| **Cacao** | Pod | `healthy`, `monilia` (by stage), `black_pod` (*Phytophthora*) | `> 92%` Macro-F1 | FP16 / INT8 TFLite | [Model Card](docs/MODEL_CARD.md#3-cacao-pod-model-cacao) |
| **Banana** | Leaf | `healthy`, `black_sigatoka`, `fusarium_wilt`, `cordana` | `> 92%` Macro-F1 | FP16 / INT8 TFLite | [Model Card](docs/MODEL_CARD.md#4-banana-leaf-model-banana) |

Tensor preprocessing parity between Python (`ml/`) and React Native (`app/src/ml/`) is enforced by shared fixture tests.

---

## Architecture & Monorepo Structure

```text
healthycropping/
├── app/       # Expo React Native (Android, pnpm): on-device TFLite, SQLite, UI
├── api/       # Python 3.12 (uv): FastAPI, Firebase Admin, Cloudinary, RAG
├── ml/        # Python 3.12 (uv): data preprocessing, training, eval, TFLite export
└── docs/      # ARCHITECTURE, PLAN, MODEL_CARD, DATASETS, EXPERIMENTS, DEVLOG
```

| Workspace | Stack | Purpose |
| :--- | :--- | :--- |
| [`app/`](app/README.md) | React Native 0.76, Expo 52, TypeScript, SQLite, TFLite | Offline mobile application for Android |
| `api/` | Python 3.12, FastAPI, Firebase Admin, Cloudinary, Gemini | Sync endpoints, token verification & RAG advisory |
| `ml/` | Python 3.12, TensorFlow 2.16, TFLite, Pillow | Training pipelines, evaluation & quantized edge export |

---

## Run Locally

### Prerequisites

- **Mobile**: Node.js 20+, `pnpm` (configured with `node-linker=hoisted`), Android SDK.
- **Backend & ML**: Python 3.12, `uv` package manager.

### 1. Mobile App (`app/`, pnpm only)

```bash
cd app
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm start
```

### 2. Backend API (`api/`, uv only)

```bash
cd api
uv sync --all-extras
uv run ruff check .
uv run mypy src tests
uv run pytest
uv run uvicorn src.main:app --reload
```

### 3. Machine Learning (`ml/`, uv only)

```bash
cd ml
uv sync --all-extras
uv run ruff check .
uv run mypy src scripts tests
uv run pytest
```

---

## Open Source Contributions & Community

Contributions are welcome. Please check our open issues and guidelines before opening a pull request:

- **Roadmap & Tasks**: https://github.com/keylorpineda/healthycropping/issues
- **Community Spotlight**: [GitHub Discussions Announcement](https://github.com/community/community/discussions/137746#discussioncomment-19118448)
- **Contributing Guidelines**: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Architecture Overview**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Code of Conduct**: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

---

## Limitations

1. **Decision Support Only**: Visual symptoms cannot distinguish every microscopic pathogen strain or nutrient deficiency. Laboratory diagnostics remain necessary for high-impact interventions.
2. **Field Lighting Sensitivity**: Direct specular glare on wet foliage or extreme motion blur can reduce model confidence.
3. **Backend Cold Starts**: The optional FastAPI synchronization API runs on Render's free tier (sleeps after 15 minutes of inactivity). Core disease diagnosis and SQLite storage operate 100% offline on the phone and are never affected.

---

## Dataset Credits & Licenses

The MIT license in [`LICENSE`](LICENSE) applies **solely to the source code** in this repository. Training datasets remain under their respective upstream licenses documented in [`docs/DATASETS.md`](docs/DATASETS.md):

- **RoCoLe** (Coffee — Mendeley Data, DOI [`10.17632/c5yvn32dzg.2`](https://doi.org/10.17632/c5yvn32dzg.2))
- **BRACOL** (Coffee — Mendeley Data, DOI [`10.17632/yy2k5y8mxg.1`](https://doi.org/10.17632/yy2k5y8mxg.1))
- **CocoaMoniliaDataSet** (Cacao — Zenodo, DOI [`10.5281/zenodo.17156051`](https://doi.org/10.5281/zenodo.17156051), CC BY 4.0)
- **UNAB Cocoa Diseases** (Cacao — Kaggle `serranosebas/enfermedades-cacao-yolov4`)
- **Banana Leaves Imagery** (Banana — NM-AIST DSpace [`20.500.12479/3003`](https://dspace.nm-aist.ac.tz/handle/20.500.12479/3003); DOI [`10.1038/s41597-025-04456-4`](https://doi.org/10.1038/s41597-025-04456-4))
- **BananaLSD** (Banana — Mendeley Data, DOI [`10.17632/9tb7k297ff.1`](https://doi.org/10.17632/9tb7k297ff.1))

---

## Non-Commercial Distribution Note

**HealthyCropping** (`com.keylorpineda.healthycropping`) is strictly non-commercial. It is distributed free of charge as an installable Android `.apk` exclusively through [GitHub Releases](https://github.com/keylorpineda/healthycropping/releases), with no advertisements or paid subscriptions.

---

## How to Cite

```bibtex
@software{pineda2026healthycropping,
  author       = {Pineda, Keylor},
  title        = {{HealthyCropping: Offline-First Crop Disease Detection for Coffee, Cacao, and Banana}},
  year         = {2026},
  url          = {https://github.com/keylorpineda/healthycropping},
  version      = {0.1.0},
  license      = {MIT}
}
```

---

## Author & Maintainers

- **Keylor Pineda** — [@keylorpineda](https://github.com/keylorpineda)
- **Jefferson Abarca** — [@JAbarca74](https://github.com/JAbarca74)
