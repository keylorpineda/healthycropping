"""Validate the shared app-to-api sync contract fixture (#48).

Ensures the Pydantic request and response models match the exact JSON payload shapes
and statuses emitted by the Expo app, and exercises the end-to-end lifecycle
(create farm/plot, patch farm, sync scans, idempotent replay, tenant isolation)
against the FastAPI routers.
"""

import json
from pathlib import Path
from typing import Any, get_args

from fastapi.testclient import TestClient

from healthycropping_api.schemas import (
    FarmCreate,
    FarmUpdate,
    PlotCreate,
    PlotUpdate,
    ScanIn,
    ScanSignatureRequest,
    ScanSignatureResponse,
    ScanSyncRequest,
    SyncStatus,
)
from tests.conftest import USER_B_TOKEN, bearer

REPO_ROOT: Path = Path(__file__).resolve().parents[2]
FIXTURE_PATH: Path = REPO_ROOT / "app" / "src" / "services" / "fixtures" / "sync_contract.json"


def load_fixture() -> dict[str, Any]:
    with FIXTURE_PATH.open(encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
        return data


def test_contract_fixture_validates_against_pydantic_models() -> None:
    fixture = load_fixture()

    farm_create = FarmCreate.model_validate(fixture["farm_create"])
    farm_update = FarmUpdate.model_validate(fixture["farm_update"])
    plot_create = PlotCreate.model_validate(fixture["plot_create"])
    plot_update = PlotUpdate.model_validate(fixture["plot_update"])
    scan_sync_request = ScanSyncRequest.model_validate(fixture["scan_sync_request"])
    scan_signature_request = ScanSignatureRequest.model_validate(fixture["scan_signature_request"])

    assert farm_create is not None
    assert farm_update is not None
    assert plot_create is not None
    assert plot_update is not None
    assert scan_sync_request is not None
    assert scan_signature_request is not None


def test_contract_field_parity() -> None:
    fixture = load_fixture()

    assert set(fixture["farm_create"]) == set(FarmCreate.model_fields)
    assert set(fixture["plot_create"]) == set(PlotCreate.model_fields)
    for scan in fixture["scan_sync_request"]["scans"]:
        assert set(scan) == set(ScanIn.model_fields)

    assert set(fixture["scan_sync_statuses"]) == set(get_args(SyncStatus))
    assert set(fixture["scan_signature_fields"]) == set(ScanSignatureResponse.model_fields)


def test_contract_end_to_end_sync_and_isolation(client: TestClient) -> None:
    fixture = load_fixture()

    # 1. POST farm_create to /farms -> 201
    farm_resp = client.post("/farms", json=fixture["farm_create"], headers=bearer())
    assert farm_resp.status_code == 201
    farm_id: str = str(fixture["farm_create"]["id"])

    # 2. POST plot_create to /plots -> 201
    plot_resp = client.post("/plots", json=fixture["plot_create"], headers=bearer())
    assert plot_resp.status_code == 201

    # 3. PATCH farm_update to /farms/{id} -> 200
    patch_resp = client.patch(f"/farms/{farm_id}", json=fixture["farm_update"], headers=bearer())
    assert patch_resp.status_code == 200

    # 4. POST scan_sync_request to /scans/sync -> 200 with statuses ["created", "created"]
    sync_resp_1 = client.post("/scans/sync", json=fixture["scan_sync_request"], headers=bearer())
    assert sync_resp_1.status_code == 200
    results_1: list[dict[str, Any]] = sync_resp_1.json()["results"]
    assert [r["status"] for r in results_1] == ["created", "created"]

    # 5. replay the same request -> ["unchanged", "unchanged"]
    sync_resp_2 = client.post("/scans/sync", json=fixture["scan_sync_request"], headers=bearer())
    assert sync_resp_2.status_code == 200
    results_2: list[dict[str, Any]] = sync_resp_2.json()["results"]
    assert [r["status"] for r in results_2] == ["unchanged", "unchanged"]

    # 6. and the same request with user B's token (USER_B_TOKEN) -> both items "rejected"
    # Per routers/scans.py: item 0 references User A's farm -> "farm_not_found"
    # item 1 has no farm/plot/photo but its id belongs to User A -> "id_conflict"
    sync_resp_b = client.post(
        "/scans/sync", json=fixture["scan_sync_request"], headers=bearer(USER_B_TOKEN)
    )
    assert sync_resp_b.status_code == 200
    results_b: list[dict[str, Any]] = sync_resp_b.json()["results"]
    assert [r["status"] for r in results_b] == ["rejected", "rejected"]
    assert results_b[0]["code"] == "farm_not_found"
    assert results_b[1]["code"] == "id_conflict"
