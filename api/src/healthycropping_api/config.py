"""Runtime settings loaded from environment variables."""

import os
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """Application settings; see `api/.env.example` for the variables."""

    env: str = "development"
    cors_origins: tuple[str, ...] = ()
    firebase_project_id: str | None = None

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "Settings":
        source = os.environ if environ is None else environ
        origins = tuple(
            origin.strip() for origin in source.get("CORS_ORIGINS", "").split(",") if origin.strip()
        )
        return cls(
            env=source.get("ENV", "development"),
            cors_origins=origins,
            firebase_project_id=source.get("FIREBASE_PROJECT_ID") or None,
        )
