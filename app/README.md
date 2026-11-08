# HealthyCropping Mobile Client (`app/`)

The offline-first Android mobile client for **HealthyCropping** (`com.keylorpineda.healthycropping`), built with React Native 0.76 and Expo 52.

---

## Capabilities

- **On-Device Computer Vision**: Runs float16 TensorFlow Lite models (`MobileNetV3-Large`, `6.06 MB` each) locally via `react-native-fast-tflite`. On-device latency has not been benchmarked yet (Phase 8, `#75`).
- **Multi-Crop Diagnostics**: One model per crop: coffee leaf (`healthy`, `leaf_rust`, `leaf_miner`, `cercospora`, `brown_leaf_spot`, `red_spider_mite`), cacao pod (`healthy`, `monilia`, `black_pod`) and banana leaf (`healthy`, `black_sigatoka`, `fusarium_wilt`). All three are wired into the app; the on-device check with all three models is pending (`#31`).
- **Offline Persistence**: Local SQLite storage via `expo-sqlite` for farms, plots, and scan diagnoses, with no cellular signal required.
- **Verified Tensor Parity**: Decodes and normalizes 224x224 RGB tensors identically to the Python training pipeline, verified by fixture parity tests.
- **Sync & Grounded RAG (in development)**: Account sync with the FastAPI backend (Phase 6) and cited Gemini explanations (Phase 7) are not available in the app yet.

---

## Directory Structure

```text
app/
├── assets/             # App icon and splash images
├── plugins/            # Expo config plugin that copies the .tflite models from ml/models/ into Android res/raw
├── src/
│   ├── app/            # Expo Router screens (home, scan, history, farms, settings, onboarding)
│   ├── components/     # UI primitives and shared components
│   ├── db/             # SQLite schema, migrations, and local repositories
│   ├── i18n/           # Spanish (default) and English translations
│   ├── ml/             # Model registries, preprocessing and TFLite inference
│   ├── screens/        # Screen implementations used by the routes
│   ├── stores/         # Zustand preference store
│   └── theme/          # Design tokens (colors, typography, spacing)
├── app.json            # Expo configuration
└── package.json        # Dependencies and scripts (pnpm only)
```

---

## Development

All commands in `app/` must use **pnpm** exclusively.

```bash
cd app
pnpm install
```

### Quality Assurance

```bash
# Type check TypeScript definitions
pnpm typecheck

# Lint source files
pnpm lint

# Check code formatting
pnpm format:check

# Run unit tests
pnpm test
```

### Running on Android

```bash
# Start Metro bundler
pnpm start

# Build and run Android development build
pnpm android
```

---

## Architectural Principles

1. **Strict Offline First**: No user operation (capturing, diagnosing, creating farms, reviewing history) depends on remote API availability.
2. **Tensor Parity**: The image preprocessing logic (`224x224` RGB normalization) in `src/ml/` must remain bit-for-bit aligned with `ml/src/healthycropping_ml/preprocess.py`.
3. **Firestore Boundary**: The mobile client interacts exclusively with `api/` via Firebase Auth tokens; it never accesses cloud datastores directly.
