"""Authenticated identity of the caller."""

from fastapi import APIRouter

from healthycropping_api.auth import CurrentUser
from healthycropping_api.schemas import ErrorResponse, UserResponse

router = APIRouter(tags=["account"], responses={401: {"model": ErrorResponse}})


@router.get("/me")
def read_me(user: CurrentUser) -> UserResponse:
    return UserResponse(uid=user.uid, email=user.email)
