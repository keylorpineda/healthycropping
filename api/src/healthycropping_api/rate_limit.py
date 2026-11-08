"""Per-user rate limits (slowapi) for endpoints that spend the Gemini quota.

Limits are keyed by the Firebase `uid`, never by IP: many farmers share one
mobile carrier NAT, and one user switching networks must not reset the count.
The authenticated user is resolved first (401 and 422 do not spend quota) and
stored on `request.state` for the key function. Counters live in process memory,
which fits the single Render instance; they reset when the process restarts.
"""

import math
import time
from typing import Annotated, Final

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from healthycropping_api.auth import AuthenticatedUser, CurrentUser
from healthycropping_api.errors import error_response

EXPLANATIONS_LIMIT: Final = "20/hour"
_UID_STATE: Final = "rate_limit_uid"


def uid_key(request: Request) -> str:
    uid = getattr(request.state, _UID_STATE, None)
    if not isinstance(uid, str) or not uid:
        # An empty key would make slowapi skip the limit silently; fail loudly instead.
        raise RuntimeError("Rate-limited endpoints must depend on `RateLimitedUser`.")
    return f"uid:{uid}"


limiter = Limiter(key_func=uid_key, storage_uri="memory://")


def get_rate_limited_user(user: CurrentUser, request: Request) -> AuthenticatedUser:
    setattr(request.state, _UID_STATE, user.uid)
    return user


RateLimitedUser = Annotated[AuthenticatedUser, Depends(get_rate_limited_user)]


def _retry_after_seconds(request: Request) -> int:
    current = getattr(request.state, "view_rate_limit", None)
    if current is None:
        return 1
    item, identifiers = current
    reset_time = limiter.limiter.get_window_stats(item, *identifiers).reset_time
    return max(1, math.ceil(reset_time - time.time()))


async def _handle_rate_limit_exceeded(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RateLimitExceeded)
    return error_response(
        429,
        "rate_limited",
        f"Too many requests: the limit is {exc.detail}. Try again later.",
        headers={"Retry-After": str(_retry_after_seconds(request))},
    )


def register_rate_limiting(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _handle_rate_limit_exceeded)
