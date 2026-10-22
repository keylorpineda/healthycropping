"""Document storage behind a small protocol (Firestore in production, in-memory in tests)."""

from collections.abc import Callable, Mapping
from typing import Any, Protocol

from google.api_core.exceptions import AlreadyExists
from google.cloud.firestore_v1.base_query import FieldFilter


class DocumentAlreadyExistsError(Exception):
    """A document with the requested ID already exists."""


class DocumentStore(Protocol):
    """Raw document access. Callers must go through `OwnedRepository` for tenant isolation."""

    def get(self, collection: str, doc_id: str) -> dict[str, Any] | None: ...

    def create(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        """Create a document; raise `DocumentAlreadyExistsError` if the ID is taken."""
        ...

    def update(self, collection: str, doc_id: str, changes: dict[str, Any]) -> None: ...

    def query(self, collection: str, equals: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Return the documents whose fields equal every value in `equals`."""
        ...


class FirestoreDocumentStore:
    """`DocumentStore` backed by the Firestore Admin client, created on first use."""

    def __init__(self, client_factory: Callable[[], Any]) -> None:
        self._client_factory = client_factory
        self._client: Any = None

    def _collection(self, collection: str) -> Any:
        if self._client is None:
            self._client = self._client_factory()
        return self._client.collection(collection)

    def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        snapshot = self._collection(collection).document(doc_id).get()
        if not snapshot.exists:
            return None
        data: dict[str, Any] = snapshot.to_dict()
        return data

    def create(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        try:
            self._collection(collection).document(doc_id).create(data)
        except AlreadyExists as exc:
            raise DocumentAlreadyExistsError(doc_id) from exc

    def update(self, collection: str, doc_id: str, changes: dict[str, Any]) -> None:
        self._collection(collection).document(doc_id).update(changes)

    def query(self, collection: str, equals: Mapping[str, Any]) -> list[dict[str, Any]]:
        query = self._collection(collection)
        for field, value in equals.items():
            query = query.where(filter=FieldFilter(field, "==", value))
        return [snapshot.to_dict() for snapshot in query.stream()]
