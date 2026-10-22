"""FirestoreDocumentStore translates the protocol into Firestore client calls."""

from typing import Any

import pytest
from google.api_core.exceptions import AlreadyExists

from healthycropping_api.store import DocumentAlreadyExistsError, FirestoreDocumentStore


class FakeSnapshot:
    def __init__(self, data: dict[str, Any] | None) -> None:
        self.exists = data is not None
        self._data = data

    def to_dict(self) -> dict[str, Any] | None:
        return self._data


class FakeDocument:
    def __init__(self, collection: "FakeCollection", doc_id: str) -> None:
        self._documents = collection.documents
        self._doc_id = doc_id

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self._documents.get(self._doc_id))

    def create(self, data: dict[str, Any]) -> None:
        if self._doc_id in self._documents:
            raise AlreadyExists("exists")  # type: ignore[no-untyped-call]
        self._documents[self._doc_id] = dict(data)

    def update(self, changes: dict[str, Any]) -> None:
        self._documents[self._doc_id].update(changes)


class FakeQuery:
    def __init__(self, documents: dict[str, dict[str, Any]], filters: list[Any]) -> None:
        self._documents = documents
        self.filters = filters

    def where(self, *, filter: Any) -> "FakeQuery":
        return FakeQuery(self._documents, [*self.filters, filter])

    def stream(self) -> list[FakeSnapshot]:
        return [
            FakeSnapshot(data)
            for data in self._documents.values()
            if all(data.get(f.field_path) == f.value for f in self.filters if f.op_string == "==")
        ]


class FakeCollection(FakeQuery):
    def __init__(self) -> None:
        self.documents: dict[str, dict[str, Any]] = {}
        super().__init__(self.documents, [])

    def document(self, doc_id: str) -> FakeDocument:
        return FakeDocument(self, doc_id)


class FakeClient:
    def __init__(self) -> None:
        self.collections: dict[str, FakeCollection] = {}

    def collection(self, name: str) -> FakeCollection:
        return self.collections.setdefault(name, FakeCollection())


@pytest.fixture
def firestore_store() -> FirestoreDocumentStore:
    return FirestoreDocumentStore(FakeClient)


def test_create_get_update(firestore_store: FirestoreDocumentStore) -> None:
    firestore_store.create("farms", "f1", {"id": "f1", "name": "A"})
    firestore_store.update("farms", "f1", {"name": "B"})

    assert firestore_store.get("farms", "f1") == {"id": "f1", "name": "B"}
    assert firestore_store.get("farms", "missing") is None


def test_create_existing_raises(firestore_store: FirestoreDocumentStore) -> None:
    firestore_store.create("farms", "f1", {"id": "f1"})

    with pytest.raises(DocumentAlreadyExistsError):
        firestore_store.create("farms", "f1", {"id": "f1"})


def test_query_applies_every_equality_filter(firestore_store: FirestoreDocumentStore) -> None:
    firestore_store.create("plots", "p1", {"ownerUid": "a", "farm_id": "f1", "deleted_at": None})
    firestore_store.create("plots", "p2", {"ownerUid": "a", "farm_id": "f2", "deleted_at": None})
    firestore_store.create("plots", "p3", {"ownerUid": "b", "farm_id": "f1", "deleted_at": None})

    result = firestore_store.query("plots", {"ownerUid": "a", "farm_id": "f1", "deleted_at": None})

    assert result == [{"ownerUid": "a", "farm_id": "f1", "deleted_at": None}]


def test_client_is_created_once_and_lazily() -> None:
    calls: list[FakeClient] = []

    def factory() -> FakeClient:
        calls.append(FakeClient())
        return calls[-1]

    firestore_store = FirestoreDocumentStore(factory)
    assert calls == []

    firestore_store.get("farms", "f1")
    firestore_store.get("plots", "p1")
    assert len(calls) == 1
