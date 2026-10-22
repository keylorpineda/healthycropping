"""Tenant-scoped document access: every read and write is filtered by `ownerUid`."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from healthycropping_api.store import DocumentStore

OWNER_FIELD = "ownerUid"


def _utc_now() -> datetime:
    return datetime.now(UTC)


class OwnedRepository:
    """Documents of one collection, visible only to the user in `ownerUid`.

    Deletes are soft (`deleted_at` is set) so offline clients can sync removals.
    Documents owned by another user are reported as missing, never as forbidden,
    so callers cannot probe which IDs exist.
    """

    def __init__(
        self,
        store: DocumentStore,
        collection: str,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._store = store
        self._collection = collection
        self._clock = clock

    def get(self, owner_uid: str, doc_id: str) -> dict[str, Any] | None:
        document = self._store.get(self._collection, doc_id)
        if (
            document is None
            or document.get(OWNER_FIELD) != owner_uid
            or document.get("deleted_at") is not None
        ):
            return None
        return document

    def list(self, owner_uid: str, **equals: Any) -> list[dict[str, Any]]:
        documents = self._store.query(
            self._collection, {**equals, OWNER_FIELD: owner_uid, "deleted_at": None}
        )
        return sorted(documents, key=lambda document: document["created_at"])

    def create(self, owner_uid: str, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = self._clock()
        document = {
            **data,
            "id": doc_id,
            OWNER_FIELD: owner_uid,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        self._store.create(self._collection, doc_id, document)
        return document

    def update(self, owner_uid: str, doc_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        document = self.get(owner_uid, doc_id)
        if document is None:
            return None
        changes = {**changes, "updated_at": self._clock()}
        self._store.update(self._collection, doc_id, changes)
        return {**document, **changes}

    def delete(self, owner_uid: str, doc_id: str) -> bool:
        if self.get(owner_uid, doc_id) is None:
            return False
        now = self._clock()
        self._store.update(self._collection, doc_id, {"deleted_at": now, "updated_at": now})
        return True
