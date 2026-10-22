"""FastAPI application factory. Run with `uvicorn healthycropping_api.main:app`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from healthycropping_api import __version__
from healthycropping_api.auth import FirebaseTokenVerifier, TokenVerifier
from healthycropping_api.config import Settings
from healthycropping_api.errors import register_error_handlers
from healthycropping_api.routers import health, me


def create_app(
    settings: Settings | None = None,
    token_verifier: TokenVerifier | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="HealthyCropping API", version=__version__)
    app.state.settings = settings
    app.state.token_verifier = token_verifier or FirebaseTokenVerifier(settings.firebase_project_id)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)

    app.include_router(health.router)
    app.include_router(me.router)
    return app


app = create_app()
