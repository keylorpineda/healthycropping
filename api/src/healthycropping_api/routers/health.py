"""Unauthenticated liveness probe (used by Render and the app's connectivity check)."""

from fastapi import APIRouter

from healthycropping_api import __version__
from healthycropping_api.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=__version__)
