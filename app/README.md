# HealthyCropping Mobile Client (`app/`)

The offline-first Android mobile client for **HealthyCropping** (`com.keylorpineda.healthycropping`), built with React Native 0.76 and Expo 52.

---

## Capabilities

- **On-Device Computer Vision**: Runs quantized float16/int8 TensorFlow Lite models locally via `react-native-fast-tflite` with sub-50ms inference latency.
- **Multi-Crop Diagnostics**: Dedicated model pipelines for Coffee Leaf (*Hemileia vastatrix*, *Cercospora*, Phoma), Cacao Pod (*Moniliophthora roreri*, *Phytophthora*), and Banana Leaf (*Pseudocercospora fijiensis*, *Cordana*).
- **Offline Persistence**: Local SQLite storage via `expo-sqlite` storing farms, plots, and scan diagnoses without requiring cellular signal.
- **Verified Tensor Parity**: Decodes and normalizes 224x224 RGB tensors identically to the Python training pipeline, verified by fixture parity tests.
- **Sync & Grounded RAG Ready**: Idempotent synchronization bridge with the FastAPI backend and Gemini RAG layer when connectivity is present.

---

## Directory Structure

```text
app/
├── assets/             # Bundled assets, splash screens, and TFLite models
│   └── models/         # Bundled .tflite weights (coffee, cacao, banana)
├── src/
│   ├── components/     # UI primitives and shared components
│   ├── db/             # SQLite schema, migrations, and local repositories
│   ├── hooks/          # React hooks for sensors, camera, and queries
│   ├── ml/             # TFLite inference runners and tensor preprocessors
│   ├── navigation/     # React Navigation configuration and routes
│   ├── screens/        # Screen views (Camera, Diagnosis, Farms, History)
│   ├── services/       # API clients and background synchronization
│   ├── theme/          # Design tokens (colors, typography, spacing)
│   └── types/          # TypeScript domain definitions
├── App.tsx             # Application entrypoint
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
2. **Tensor Parity**: The image preprocessing logic (`224x224` RGB normalization) in `src/ml/` must remain bit-for-bit aligned with `ml/src/preprocessing/`.
3. **Firestore Boundary**: The mobile client interacts exclusively with `api/` via Firebase Auth tokens; it never accesses cloud datastores directly.
