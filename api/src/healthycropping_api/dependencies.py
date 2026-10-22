"""FastAPI dependencies for tenant-scoped repositories."""

from typing import Annotated

from fastapi import Depends, Request

from healthycropping_api.repositories import OwnedRepository
from healthycropping_api.store import DocumentStore

FARMS_COLLECTION = "farms"
PLOTS_COLLECTION = "plots"


def get_document_store(request: Request) -> DocumentStore:
    store: DocumentStore = request.app.state.document_store
    return store


def get_farms(store: Annotated[DocumentStore, Depends(get_document_store)]) -> OwnedRepository:
    return OwnedRepository(store, FARMS_COLLECTION)


def get_plots(store: Annotated[DocumentStore, Depends(get_document_store)]) -> OwnedRepository:
    return OwnedRepository(store, PLOTS_COLLECTION)


Farms = Annotated[OwnedRepository, Depends(get_farms)]
Plots = Annotated[OwnedRepository, Depends(get_plots)]
