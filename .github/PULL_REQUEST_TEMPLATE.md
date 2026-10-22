<!--
  🌱 HealthyCropping Pull Request Template
  Please fill out all relevant sections below to ensure smooth peer review and authorization.
-->

## 📋 Summary

<!-- Briefly summarize what this PR changes, why it is needed, and link the tracking issue. -->

- **Issue**: Closes #
- **Milestone**: `v0.3.0` <!-- or relevant milestone -->
- **Component**: `ml/` | `app/` | `api/` | `docs/` | `ci/`

### 💡 Description
<!-- 2-4 sentences explaining the context, problem, and implemented solution. -->

---

## 🏷️ Type of Change

- [ ] `feat` — A new feature or capability
- [ ] `fix` — A bug fix
- [ ] `refactor` — Code refactoring without behavioral changes
- [ ] `perf` — Performance optimization
- [ ] `test` — Adding or updating automated tests
- [ ] `docs` — Documentation or model cards only
- [ ] `ci` / `chore` — Tooling, workflows, or dependencies

---

## 🎯 Area Affected

- [ ] **ML** (`ml/`) — Data pipelines, training, eval, Grad-CAM, or TFLite export
- [ ] **App** (`app/`) — Expo React Native UI, offline SQLite, camera, or on-device inference
- [ ] **API** (`api/`) — FastAPI service, Firebase token auth, or Gemini RAG
- [ ] **Docs & Config** (`docs/`, `.github/`) — Architecture, datasets, reports, or CI workflows

---

## 🛠️ Key Changes & Decisions

<!-- Bullet points summarizing non-obvious technical decisions, algorithms, or tradeoffs. -->
- 

---

## 🧪 Local Verification & Quality Checklist

Before requesting authorization, verify that all applicable local checks pass:

- [ ] **Conventional Commits**: Every commit follows `<type>(<scope>): <summary>` (3–6 atomic commits per PR).
- [ ] **No Secrets / Prohibited Files**: No `.env`, `*.json` credentials, raw/processed datasets (`ml/data/`), or model weights (`*.tflite`, `*.keras`) committed.
- [ ] **App Checks** (if `app/` touched):
  ```bash
  cd app && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
  ```
- [ ] **ML Checks** (if `ml/` touched):
  ```bash
  cd ml && uv run ruff check . && uv run ruff format --check . && uv run mypy src scripts tests && uv run pytest
  ```
- [ ] **API Checks** (if `api/` touched):
  ```bash
  cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy src tests && uv run pytest
  ```
- [ ] **Documentation**: Updated `docs/PLAN.md`, `docs/DEVLOG.md`, or `CHANGELOG.md` if completing a milestone task.

---

## 📊 Proof of Verification (Screenshots / Metrics)

<!--
  - For UI changes: attach Android emulator screenshot or short video.
  - For ML changes: include Macro-F1, per-class F1, TFLite size (< 10 MB), or test accuracy.
  - If not applicable, write "N/A".
-->

| Verification Type | Result / Evidence |
|:------------------|:------------------|
| **CI / Tests**    | ✅ Passing locally |
| **Metrics / Size**|                   |
| **Visual Proof**  |                   |

---

## 🔒 Authorization & Code Review

> [!IMPORTANT]
> Branch protection requires **at least 1 approving review from a Code Owner (`@keylorpineda` or `@JAbarca74`)** and all 3 CI workflows (`App`, `API`, `ML`) in green before this PR can be rebase-merged (`--rebase`) into `develop`.

- [ ] Assigned reviewer: `@keylorpineda` / `@JAbarca74`
- [ ] Ready for review
