"""POST /explanations: grounded, cited explanations of an on-device diagnosis."""

import logging
from pathlib import Path

from fastapi import APIRouter, Request

from healthycropping_api.auth import CurrentUser
from healthycropping_api.config import Settings
from healthycropping_api.errors import ApiError
from healthycropping_api.rag.explain import (
    ExplanationService,
    ExplanationUnavailableError,
    is_supported,
)
from healthycropping_api.rag.index import IndexFormatError, RagIndex
from healthycropping_api.schemas import ErrorResponse, ExplanationRequest, ExplanationResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/explanations",
    tags=["explanations"],
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)

DEFAULT_INDEX_PATH = Path(__file__).resolve().parents[3] / ".cache" / "rag" / "index.json"
UNAVAILABLE = ApiError(503, "explanations_unavailable", "Explanations are not available right now.")


def index_loader(settings: Settings) -> "IndexLoader":
    return IndexLoader(
        Path(settings.rag_index_path) if settings.rag_index_path else DEFAULT_INDEX_PATH
    )


class IndexLoader:
    """Loads the index on first use and keeps it; a missing index is reported per request."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._index: RagIndex | None = None

    def __call__(self) -> RagIndex:
        if self._index is None:
            try:
                self._index = RagIndex.load(self.path)
            except (OSError, ValueError, IndexFormatError) as exc:
                logger.error("RAG index unavailable at %s: %s", self.path, exc)
                raise UNAVAILABLE from exc
        return self._index


def _service(request: Request) -> ExplanationService:
    service: ExplanationService | None = request.app.state.explanation_service
    if service is None:
        raise UNAVAILABLE
    return service


@router.post("")
def create_explanation(
    body: ExplanationRequest, user: CurrentUser, request: Request
) -> ExplanationResponse:
    if not is_supported(body.crop, body.disease_class):
        raise ApiError(
            422, "unsupported_class", f"'{body.disease_class}' is not a {body.crop} model class."
        )
    try:
        return _service(request).explain(body)
    except ExplanationUnavailableError as exc:
        logger.warning("Explanation failed: %s", exc)
        raise UNAVAILABLE from exc
