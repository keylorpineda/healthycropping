"""Lazy access to the shared Firebase Admin app."""

from typing import Any

import firebase_admin


def get_firebase_app(project_id: str | None) -> Any:
    """Return the default Firebase app, initializing it on first use.

    Credentials come from Application Default Credentials
    (`GOOGLE_APPLICATION_CREDENTIALS`) and are only loaded when a service is used.
    """
    try:
        return firebase_admin.get_app()
    except ValueError:
        options = {"projectId": project_id} if project_id else None
        return firebase_admin.initialize_app(options=options)
