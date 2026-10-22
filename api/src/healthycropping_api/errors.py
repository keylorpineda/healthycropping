"""Structured error handling: every error response has the `ErrorResponse` shape."""

import logging
from collections.abc import Mapping
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from healthycropping_api.schemas import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """An expected failure with a stable machine-readable `code`."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


def _error_response(
    status_code: int,
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message, details=details))
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(exclude_none=True),
        headers=headers,
    )


def _status_code_name(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase.lower().replace(" ", "_").replace("-", "_")
    except ValueError:
        return "http_error"


async def _handle_api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return _error_response(exc.status_code, exc.code, exc.message, headers=exc.headers)


async def _handle_http_exception(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    return _error_response(
        exc.status_code,
        _status_code_name(exc.status_code),
        str(exc.detail),
        headers=exc.headers,
    )


async def _handle_validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details: list[dict[str, Any]] = jsonable_encoder(
        [{"loc": err["loc"], "msg": err["msg"], "type": err["type"]} for err in exc.errors()]
    )
    return _error_response(422, "validation_error", "Request validation failed.", details)


async def _handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return _error_response(500, "internal_error", "An unexpected error occurred.")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
