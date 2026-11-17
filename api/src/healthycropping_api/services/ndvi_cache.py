"""Firestore cache and quota guard for plot NDVI (#81).

A complete month of Sentinel-2 data does not change, so each `(owner, plot, month)` value is
stored once and reused until the plot geometry changes. Only missing months reach Earth
Engine, and a process-wide daily budget keeps the Community tier quota from being exhausted.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any, Final

from healthycropping_api.services.ndvi import MonthlyNdvi, PlotGeometry
from healthycropping_api.store import DocumentAlreadyExistsError, DocumentStore

NDVI_CACHE_COLLECTION: Final = "ndviCache"
# Scenes for a month keep arriving for a few days after it ends.
SETTLE_DAYS: Final = 10
# Earth Engine computations per UTC day across all users of this API instance.
DAILY_EARTH_ENGINE_BUDGET: Final = 500


def geometry_key(geometry: PlotGeometry) -> str:
    """Stable short hash of the geometry; a redrawn boundary invalidates cached months."""
    payload = {
        "ring": [[round(lon, 6), round(lat, 6)] for lon, lat in geometry.ring or ()],
        "point": [round(value, 6) for value in geometry.point] if geometry.point else None,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]


def is_settled(month: str, today: date) -> bool:
    """True once `SETTLE_DAYS` have passed since the end of `month` ("YYYY-MM")."""
    year, number = (int(part) for part in month.split("-"))
    next_month = date(year + (number // 12), number % 12 + 1, 1)
    return today >= next_month + timedelta(days=SETTLE_DAYS)


def is_cacheable(entry: MonthlyNdvi, today: date) -> bool:
    # A month without scenes may still get them; never freeze an empty answer.
    return entry.images > 0 and is_settled(entry.month, today)


class NdviCache:
    def __init__(self, store: DocumentStore) -> None:
        self._store = store

    @staticmethod
    def _doc_id(owner_uid: str, plot_id: str, month: str) -> str:
        return f"{owner_uid}:{plot_id}:{month}"

    def get(self, owner_uid: str, plot_id: str, month: str, key: str) -> MonthlyNdvi | None:
        document = self._store.get(NDVI_CACHE_COLLECTION, self._doc_id(owner_uid, plot_id, month))
        if document is None or document.get("geometryKey") != key:
            return None
        return _from_document(month, document)

    def put(self, owner_uid: str, plot_id: str, key: str, entry: MonthlyNdvi) -> None:
        doc_id = self._doc_id(owner_uid, plot_id, entry.month)
        data: dict[str, Any] = {
            "ownerUid": owner_uid,
            "plotId": plot_id,
            "month": entry.month,
            "geometryKey": key,
            "ndvi": entry.ndvi,
            "clearFraction": entry.clear_fraction,
            "images": entry.images,
            "computedAt": datetime.now(UTC).isoformat(),
        }
        try:
            self._store.create(NDVI_CACHE_COLLECTION, doc_id, data)
        except DocumentAlreadyExistsError:
            self._store.update(NDVI_CACHE_COLLECTION, doc_id, data)


def _from_document(month: str, document: dict[str, Any]) -> MonthlyNdvi | None:
    ndvi, clear, images = (
        document.get("ndvi"),
        document.get("clearFraction"),
        document.get("images"),
    )
    if ndvi is not None and not isinstance(ndvi, int | float):
        return None
    if not isinstance(clear, int | float) or not isinstance(images, int):
        return None
    return MonthlyNdvi(
        month=month,
        ndvi=None if ndvi is None else float(ndvi),
        clear_fraction=float(clear),
        images=images,
    )


class DailyQuota:
    """Thread-safe counter that resets at UTC midnight."""

    def __init__(
        self,
        limit: int = DAILY_EARTH_ENGINE_BUDGET,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self._limit = limit
        self._today = today
        self._day: date | None = None
        self._used = 0
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        with self._lock:
            day = self._today()
            if day != self._day:
                self._day, self._used = day, 0
            if self._used >= self._limit:
                return False
            self._used += 1
            return True

    def seconds_until_reset(self, now: datetime | None = None) -> int:
        current = now or datetime.now(UTC)
        tomorrow = datetime.combine(current.date() + timedelta(days=1), datetime.min.time(), UTC)
        return max(1, int((tomorrow - current).total_seconds()))
