# Contributing to HealthyCropping

Thank you for your interest in contributing to **HealthyCropping**. This document outlines our development setup, conventions, quality checks, and pull request workflow.

## Language Policy

- Write **all code, comments, docstrings, commit messages, issues, pull requests, file names, and documentation in English**, except [`docs/SETUP_SERVICES_ES.md`](docs/SETUP_SERVICES_ES.md), which is maintained in Spanish.
- The Android application UI uses `i18next` with **Spanish (`es`) as the default locale** and **English (`en`)** as the secondary locale.

## Prerequisites & Tooling

- **Node.js**: Current LTS (see [`.nvmrc`](.nvmrc), `24.18.0`).
- **Package Manager (JS/TS)**: **`pnpm` only** (pinned in root [`package.json`](package.json)). Never use `npm` or `yarn`, and never commit `package-lock.json` or `yarn.lock`.
- **Python**: **Python 3.12** managed via **`uv`** (separate `uv` projects in `ml/` and `api/`).
- **Android Development**: Android SDK Platform-Tools (`adb`), JDK 17, and an Android device or emulator for running the Expo development build (`react-native-fast-tflite` requires a native development build and cannot run inside Expo Go).

## Local Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/keylorpineda/healthycrop.git
   cd healthycrop
   ```

2. Install JavaScript dependencies from the repository root:
   ```bash
   pnpm install
   ```

3. Set up the Python environments for `api/` and `ml/`:
   ```bash
   cd api && uv sync --all-extras && cd ..
   cd ml && uv sync --all-extras && cd ..
   ```

4. Copy the environment variable templates:
   ```bash
   cp api/.env.example api/.env
   cp app/.env.example app/.env
   ```
   Follow [`docs/SETUP_SERVICES_ES.md`](docs/SETUP_SERVICES_ES.md) for step-by-step instructions on configuring external services.

## Non-Negotiable Engineering Rules

1. **`pnpm` only** for JavaScript/TypeScript workspaces.
2. **Zero data leakage**: ML splits (`70/15/15`, seed `42`) are grouped by `group_id` (plant/tree) after perceptual-hash deduplication across sources.
3. **Identical preprocessing**: Python training/export and the React Native inference pipeline (`app/src/ml/`) must produce identical input tensors (verified by a shared fixture test).
4. **Strict data boundary**: The Android app authenticates with Firebase Auth (ID tokens) and communicates exclusively with the FastAPI backend (`api/`). The app **never** accesses Firestore directly.
5. **No secrets, datasets, or model weights in Git**: Never commit `.env` files, service account keys, `google-services.json`, `kaggle.json`, raw/processed datasets, or `.tflite`/`.keras` weights.

## Issue & Branch Workflow

1. **Branches**:
   - **`develop`** (Default branch): Integration of finished work. Protected: PR + green CI required.
   - **`main`**: Completed versions only (`v0.1.0`, `v0.2.0`, ..., `v1.0.0`, `v1.1.0`, `v1.2.0`). Updated only by release PRs from `develop` (`chore(release): vX.Y.Z`) merged with a merge commit, then tagged `vX.Y.Z`.
   - **`<type>/<id>-<short-desc>`**: Short-lived work branches cut from `develop`, e.g.:
     ```text
     feat/17-coffee-finetune --rebase--> develop --release PR (merge commit)--> main --> tag vX.Y.Z
     ```

2. **Every change starts with an issue**:
   - Ensure an issue exists with `Context`, `Scope`, `Out of scope`, `Acceptance criteria`, and `Dependencies`, plus `type:*`, `area:*`, and `priority:*` labels, active `vX.Y.Z` Milestone, and GitHub Project board status.
   - Move the issue to **In progress** before starting work.

3. **Conventional Commits**:
   Format every commit message and PR title using Conventional Commits:
   ```text
   <type>(<optional scope>): <imperative summary, lowercase, no period>
   ```
   - Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   - Common scopes: `ml`, `app`, `api`, `ci`, `docs`, `repo`, `release`, `ui`, `i18n`, `auth`

## Quality Checks Before Opening a PR

All checks must pass locally before pushing. Fix root causes; never disable linter rules or skip tests.

- **App (`app/`)**:
  ```bash
  pnpm --filter @healthycropping/app lint
  pnpm --filter @healthycropping/app format:check
  pnpm --filter @healthycropping/app typecheck
  pnpm --filter @healthycropping/app test
  ```

- **API (`api/`)**:
  ```bash
  cd api
  uv run ruff check .
  uv run ruff format --check .
  uv run mypy src tests
  uv run pytest
  ```

- **ML (`ml/`)**:
  ```bash
  cd ml
  uv run ruff check .
  uv run ruff format --check .
  uv run mypy src scripts tests
  uv run pytest
  ```

## Pull Request Flow & Peer Review Authorization

1. **Structured Template**: Every PR must fill out the `.github/PULL_REQUEST_TEMPLATE.md` checklist completely (summary, affected area, key decisions, verification proof, and local checks).
2. **Target Branch**: Open the Pull Request targeting `develop` and include `Closes #<issue-number>` in the body.
3. **Mandatory Peer Review Authorization**:
   - Branch protection enforces **at least 1 approving code review from `@keylorpineda` (Code Owner)** before merge.
   - Any new push dismisses stale reviews and requires re-approval (`require_last_push_approval: true`).
4. **Automated CI**: Ensure all 3 CI workflows (`App`, `API`, `ML`) are green.
5. **Rebase-Merge**: Once approved and CI is green, work PRs are merged into `develop` using **rebase (`--rebase`)** to maintain clean, atomic Conventional Commits. Move the issue to **Done** on the Project board.
6. **Release PRs to `main`**: When a milestone is complete, open a release PR from `develop` to `main` titled `chore(release): vX.Y.Z`, merge with **squash (`--squash`)** to keep `main` strictly to 1 commit per stable version, and tag `vX.Y.Z`.

