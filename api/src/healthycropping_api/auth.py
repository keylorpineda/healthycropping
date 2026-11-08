"""Firebase ID token verification and the `get_current_user` dependency."""

from dataclasses import dataclass
from typing import Annotated, Any, Literal, Protocol

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

from healthycropping_api.errors import ApiError
from healthycropping_api.firebase import get_firebase_app

_BEARER_CHALLENGE = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True)
class AuthenticatedUser:
    uid: str
    email: str | None


class InvalidTokenError(Exception):
    def __init__(self, reason: Literal["expired", "invalid"]) -> None:
        super().__init__(reason)
        self.reason = reason


class VerifierUnavailableError(Exception):
    """The verifier could not reach Google's public signing keys."""


class TokenVerifier(Protocol):
    def verify(self, id_token: str) -> AuthenticatedUser: ...


class FirebaseTokenVerifier:
    """Verifies Firebase ID tokens with the Firebase Admin SDK.

    The Firebase app is initialized lazily so the API can start before credentials
    are loaded (see `get_firebase_app`).
    """

    def __init__(self, project_id: str | None) -> None:
        self._project_id = project_id

    def _get_app(self) -> Any:
        return get_firebase_app(self._project_id)

    def verify(self, id_token: str) -> AuthenticatedUser:
        try:
            claims = firebase_auth.verify_id_token(id_token, app=self._get_app())
        except firebase_auth.ExpiredIdTokenError as exc:
            raise InvalidTokenError("expired") from exc
        except firebase_auth.InvalidIdTokenError as exc:
            raise InvalidTokenError("invalid") from exc
        except firebase_auth.CertificateFetchError as exc:
            raise VerifierUnavailableError() from exc

        uid = claims.get("uid")
        if not isinstance(uid, str) or not uid:
            raise InvalidTokenError("invalid")
        email = claims.get("email")
        return AuthenticatedUser(uid=uid, email=email if isinstance(email, str) else None)


_bearer_scheme = HTTPBearer(auto_error=False, description="Firebase ID token")


def get_token_verifier(request: Request) -> TokenVerifier:
    verifier: TokenVerifier = request.app.state.token_verifier
    return verifier


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
) -> AuthenticatedUser:
    if credentials is None or not credentials.credentials:
        raise ApiError(
            401, "missing_token", "A Firebase ID bearer token is required.", _BEARER_CHALLENGE
        )
    try:
        return verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        if exc.reason == "expired":
            raise ApiError(
                401, "expired_token", "The Firebase ID token has expired.", _BEARER_CHALLENGE
            ) from exc
        raise ApiError(
            401, "invalid_token", "The Firebase ID token is invalid.", _BEARER_CHALLENGE
        ) from exc
    except VerifierUnavailableError as exc:
        raise ApiError(
            503, "auth_unavailable", "Token verification is temporarily unavailable."
        ) from exc


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
