"""Pydantic v2 response schemas shared across routers."""

from typing import Any, Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class UserResponse(BaseModel):
    uid: str
    email: str | None
