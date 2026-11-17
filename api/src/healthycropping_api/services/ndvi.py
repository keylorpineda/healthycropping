"""Monthly Sentinel-2 NDVI per plot from Google Earth Engine (#43).

The Earth Engine client is imported lazily and hidden behind `NdviProvider`, so the API
starts and its tests run without Earth Engine credentials. `EarthEngineNdviProvider` uses
the noncommercial Community tier through a service account (`docs/SETUP_SERVICES_ES.md` §4).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal, Protocol

from pydantic import BaseModel

# Harmonized surface reflectance: consistent band scaling across the 2022 processing change.
COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
# Scene Classification Layer classes kept as clear land: vegetation, bare soil, water,
# unclassified. Dropped: no data, saturated, dark/cloud shadow, clouds, cirrus, snow.
CLEAR_SCL_CLASSES: tuple[int, ...] = (4, 5, 6, 7)
SCALE_M = 10
MONTHS = 12
# Plots with only a reference point are sampled in a small square around it.
POINT_BUFFER_M = 30
MAX_PIXELS = 10_000_000
# A month with more than 80 % of the plot under cloud is reported as `cloudy` (#81).
MIN_CLEAR_FRACTION = 0.2

ATTRIBUTION = "Contains modified Copernicus Sentinel data, processed with Google Earth Engine."


class NdviUnavailableError(Exception):
    """Earth Engine could not be reached or refused the request."""


class NdviNotConfiguredError(Exception):
    """No Earth Engine project or credentials are configured."""


@dataclass(frozen=True)
class PlotGeometry:
    """A plot boundary ring of (longitude, latitude), or a point to buffer."""

    ring: tuple[tuple[float, float], ...] | None = None
    point: tuple[float, float] | None = None


@dataclass(frozen=True)
class MonthlyNdvi:
    month: str  # "YYYY-MM"
    ndvi: float | None
    # Share of the plot's pixels that were clear in at least one scene of the month.
    clear_fraction: float
    images: int


class NdviProvider(Protocol):
    def monthly(self, geometry: PlotGeometry, months: list[str]) -> list[MonthlyNdvi]: ...


class NdviMonth(BaseModel):
    month: str
    ndvi: float | None
    clear_fraction: float
    images: int
    status: Literal["ok", "cloudy", "no_data"]
    # Served from the Firestore cache without an Earth Engine request (#81).
    cached: bool = False


class NdviResponse(BaseModel):
    plot_id: str
    source: Literal["boundary", "point"]
    collection: str
    months: list[NdviMonth]
    attribution: str


def plot_geometry(plot: dict[str, Any]) -> tuple[PlotGeometry, Literal["boundary", "point"]] | None:
    """The plot's boundary (#41) when it has one, else its reference point (#136)."""
    boundary = plot.get("boundary")
    if isinstance(boundary, list) and len(boundary) >= 3:
        ring = tuple(
            (float(point["longitude"]), float(point["latitude"]))
            for point in boundary
            if isinstance(point, dict)
        )
        if len(ring) >= 3:
            return PlotGeometry(ring=ring), "boundary"
    latitude, longitude = plot.get("latitude"), plot.get("longitude")
    if isinstance(latitude, int | float) and isinstance(longitude, int | float):
        return PlotGeometry(point=(float(longitude), float(latitude))), "point"
    return None


def last_months(today: date, count: int = MONTHS) -> list[str]:
    """The `count` complete months before `today`'s month, oldest first."""
    year, month = today.year, today.month
    result: list[str] = []
    for _ in range(count):
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        result.append(f"{year:04d}-{month:02d}")
    return list(reversed(result))


def month_status(
    entry: MonthlyNdvi, min_clear_fraction: float
) -> Literal["ok", "cloudy", "no_data"]:
    if entry.images == 0:
        return "no_data"
    if entry.ndvi is None or entry.clear_fraction < min_clear_fraction:
        return "cloudy"
    return "ok"


def _clean(value: Any) -> float | None:
    if isinstance(value, int | float) and math.isfinite(value):
        return float(value)
    return None


class EarthEngineNdviProvider:
    """Computes all months in one Earth Engine request (`getInfo`) to save quota."""

    def __init__(self, project: str, credentials_path: str | None) -> None:
        self._project = project
        self._credentials_path = credentials_path
        self._ee: Any = None

    def _client(self) -> Any:
        if self._ee is not None:
            return self._ee
        try:
            import ee
            from google.oauth2 import service_account
        except ImportError as exc:  # pragma: no cover - dependency is declared
            raise NdviNotConfiguredError() from exc
        try:
            if self._credentials_path:
                credentials = service_account.Credentials.from_service_account_file(  # type: ignore[no-untyped-call]
                    self._credentials_path,
                    scopes=["https://www.googleapis.com/auth/earthengine"],
                )
                ee.Initialize(credentials=credentials, project=self._project)
            else:
                ee.Initialize(project=self._project)
        except Exception as exc:
            raise NdviUnavailableError(str(exc)) from exc
        self._ee = ee
        return ee

    def monthly(self, geometry: PlotGeometry, months: list[str]) -> list[MonthlyNdvi]:
        ee = self._client()
        if geometry.ring is not None:
            region = ee.Geometry.Polygon([[list(point) for point in geometry.ring]])
        elif geometry.point is not None:
            region = ee.Geometry.Point(list(geometry.point)).buffer(POINT_BUFFER_M).bounds()
        else:
            raise ValueError("geometry needs a ring or a point")

        def clear_ndvi(image: Any) -> Any:
            scl = image.select("SCL")
            clear = scl.remap(list(CLEAR_SCL_CLASSES), [1] * len(CLEAR_SCL_CLASSES), 0)
            return image.normalizedDifference(["B8", "B4"]).rename("ndvi").updateMask(clear)

        def month_stats(month: Any) -> Any:
            start = ee.Date(month)
            scenes = (
                ee.ImageCollection(COLLECTION)
                .filterBounds(region)
                .filterDate(start, start.advance(1, "month"))
            )
            # An empty collection reduces to an image without bands. Keep a masked
            # NDVI band so missing scenes become no_data instead of failing the year.
            composite = ee.Image(
                ee.Algorithms.If(
                    scenes.size(),
                    scenes.map(clear_ndvi).median(),
                    ee.Image.constant(0).rename("ndvi").selfMask(),
                )
            )
            mean = composite.reduceRegion(
                reducer=ee.Reducer.mean(), geometry=region, scale=SCALE_M, maxPixels=MAX_PIXELS
            ).get("ndvi")
            clear_pixels = composite.reduceRegion(
                reducer=ee.Reducer.count(), geometry=region, scale=SCALE_M, maxPixels=MAX_PIXELS
            ).get("ndvi")
            all_pixels = (
                ee.Image.constant(1)
                .rename("ndvi")
                .reduceRegion(
                    reducer=ee.Reducer.count(),
                    geometry=region,
                    scale=SCALE_M,
                    maxPixels=MAX_PIXELS,
                )
                .get("ndvi")
            )
            return ee.Dictionary(
                {
                    "month": month,
                    "ndvi": mean,
                    "clear": clear_pixels,
                    "total": all_pixels,
                    "images": scenes.size(),
                }
            )

        try:
            raw = ee.List([f"{month}-01" for month in months]).map(month_stats).getInfo()
        except Exception as exc:
            raise NdviUnavailableError(str(exc)) from exc
        return parse_months(raw, months)


def parse_months(raw: Any, months: list[str]) -> list[MonthlyNdvi]:
    """Turns Earth Engine's dictionaries into `MonthlyNdvi`, tolerating nulls per month."""
    by_month: dict[str, dict[str, Any]] = {}
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and isinstance(item.get("month"), str):
                by_month[str(item["month"])[:7]] = item
    result: list[MonthlyNdvi] = []
    for month in months:
        item = by_month.get(month, {})
        ndvi = _clean(item.get("ndvi"))
        clear = _clean(item.get("clear")) or 0.0
        total = _clean(item.get("total")) or 0.0
        images = _clean(item.get("images"))
        result.append(
            MonthlyNdvi(
                month=month,
                ndvi=None if ndvi is None else round(max(-1.0, min(1.0, ndvi)), 4),
                clear_fraction=round(min(1.0, clear / total), 4) if total > 0 else 0.0,
                images=int(images) if images is not None else 0,
            )
        )
    return result
