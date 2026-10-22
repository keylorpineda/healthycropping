"""Tenant-scoped document access: every read and write is filtered by `ownerUid`."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal

from healthycropping_api.store import DocumentAlreadyExistsError, DocumentStore

OWNER_FIELD = "ownerUid"

UpsertOutcome = Literal["created", "updated", "unchanged", "rejected"]


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

    def upsert(self, owner_uid: str, doc_id: str, data: dict[str, Any]) -> UpsertOutcome:
        """Write a client-synced document, last write wins on the client's `updated_at`.

        The client owns `updated_at` and `deleted_at` (tombstones are stored as sent), so
        replaying a batch never changes anything. A document owned by another user is never
        overwritten.
        """
        existing = self._store.get(self._collection, doc_id)
        if existing is None:
            document = {**data, "id": doc_id, OWNER_FIELD: owner_uid, "created_at": self._clock()}
            try:
                self._store.create(self._collection, doc_id, document)
            except DocumentAlreadyExistsError:
                # Lost a race with a concurrent sync of the same ID; compare against the winner.
                return self.upsert(owner_uid, doc_id, data)
            return "created"
        if existing.get(OWNER_FIELD) != owner_uid:
            return "rejected"
        if data["updated_at"] <= existing["updated_at"]:
            return "unchanged"
        self._store.update(self._collection, doc_id, {**data, "id": doc_id, OWNER_FIELD: owner_uid})
        return "updated"

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
