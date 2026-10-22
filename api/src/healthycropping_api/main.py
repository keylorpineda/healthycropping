"""FastAPI application factory. Run with `uvicorn healthycropping_api.main:app`."""

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import firestore

from healthycropping_api import __version__
from healthycropping_api.auth import FirebaseTokenVerifier, TokenVerifier
from healthycropping_api.config import Settings
from healthycropping_api.errors import register_error_handlers
from healthycropping_api.firebase import get_firebase_app
from healthycropping_api.routers import farms, health, me, plots, scans, uploads
from healthycropping_api.store import DocumentStore, FirestoreDocumentStore


def _firestore_store(project_id: str | None) -> DocumentStore:
    def client_factory() -> Any:
        return firestore.client(get_firebase_app(project_id))

    return FirestoreDocumentStore(client_factory)


def create_app(
    settings: Settings | None = None,
    token_verifier: TokenVerifier | None = None,
    document_store: DocumentStore | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="HealthyCropping API", version=__version__)
    app.state.settings = settings
    app.state.token_verifier = token_verifier or FirebaseTokenVerifier(settings.firebase_project_id)
    app.state.document_store = document_store or _firestore_store(settings.firebase_project_id)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(farms.router)
    app.include_router(plots.router)
    app.include_router(scans.router)
    app.include_router(uploads.router)
    return app


app = create_app()
