"""Pydantic v2 request and response schemas shared across routers."""

from datetime import datetime
from typing import Annotated, Any, ClassVar, Literal, Self

from pydantic import UUID4, AwareDatetime, BaseModel, ConfigDict, Field, model_validator

# Mirrors SUPPORTED_CROPS in app/src/version.ts.
Crop = Literal["coffee", "cacao", "banana"]

Name = Annotated[str, Field(min_length=1, max_length=120)]
AltitudeM = Annotated[float, Field(ge=0, le=6000)]
AreaHa = Annotated[float, Field(gt=0, le=100_000)]
# WGS84 decimal degrees of one reference point inside the plot (#136).
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class UserResponse(BaseModel):
    uid: str
    email: str | None


class RequestModel(BaseModel):
    """Rejects unknown fields so clients cannot set server-owned ones such as `ownerUid`."""

    model_config = ConfigDict(extra="forbid")


class PatchModel(RequestModel):
    """Partial update: omitted fields are kept; `required_fields` may not be set to null."""

    required_fields: ClassVar[tuple[str, ...]] = ()

    @model_validator(mode="after")
    def _reject_null_required_fields(self) -> Self:
        for field in self.required_fields:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"'{field}' cannot be null")
        return self


class PlotLocationMixin(BaseModel):
    """A plot point is all or nothing: one coordinate alone cannot locate weather data."""

    @model_validator(mode="after")
    def _require_both_coordinates(self) -> Self:
        sent = {"latitude", "longitude"} & self.model_fields_set
        if len(sent) == 1:
            raise ValueError("'latitude' and 'longitude' must be sent together")
        latitude = getattr(self, "latitude", None)
        longitude = getattr(self, "longitude", None)
        if (latitude is None) != (longitude is None):
            raise ValueError("'latitude' and 'longitude' must both be set or both be null")
        return self


class FarmCreate(RequestModel):
    id: UUID4
    name: Name
    region: Name
    altitude_m: AltitudeM | None = None


class FarmUpdate(PatchModel):
    required_fields = ("name", "region")

    name: Name | None = None
    region: Name | None = None
    altitude_m: AltitudeM | None = None


class FarmResponse(BaseModel):
    id: str
    name: str
    region: str
    altitude_m: float | None
    created_at: datetime
    updated_at: datetime


class PlotCreate(RequestModel, PlotLocationMixin):
    id: UUID4
    farm_id: UUID4
    name: Name
    crop: Crop
    area_ha: AreaHa | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None


class PlotUpdate(PatchModel, PlotLocationMixin):
    required_fields = ("farm_id", "name", "crop")

    farm_id: UUID4 | None = None
    name: Name | None = None
    crop: Crop | None = None
    area_ha: AreaHa | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None


class PlotResponse(BaseModel):
    id: str
    farm_id: str
    name: str
    crop: Crop
    area_ha: float | None
    # Plots stored before #136 have no coordinates.
    latitude: float | None = None
    longitude: float | None = None
    created_at: datetime
    updated_at: datetime


# Mirrors DiagnosisSeverity in app/src/ml/types.ts.
Severity = Literal["healthy", "watch", "actNow"]
Probability = Annotated[float, Field(ge=0, le=1)]
Label = Annotated[str, Field(min_length=1, max_length=64)]
CloudinaryPublicId = Annotated[str, Field(min_length=1, max_length=255)]
SyncStatus = Literal["created", "updated", "unchanged", "rejected"]

MAX_SYNC_BATCH = 100


class ScanIn(RequestModel):
    """A scan as stored on the device, minus device-only columns (photo URI, sync status)."""

    id: UUID4
    farm_id: UUID4 | None = None
    plot_id: UUID4 | None = None
    crop: Crop
    predicted_class: Label
    severity: Severity
    confidence: Probability
    threshold: Probability
    is_low_confidence: bool
    model_version: Label
    cloudinary_public_id: CloudinaryPublicId | None = None
    scanned_at: AwareDatetime
    updated_at: AwareDatetime
    deleted_at: AwareDatetime | None = None


class ScanSyncRequest(RequestModel):
    scans: Annotated[list[ScanIn], Field(min_length=1, max_length=MAX_SYNC_BATCH)]

    @model_validator(mode="after")
    def _reject_duplicate_ids(self) -> Self:
        ids = [scan.id for scan in self.scans]
        if len(set(ids)) != len(ids):
            raise ValueError("scan ids must be unique within a batch")
        return self


class ScanSyncResult(BaseModel):
    id: str
    status: SyncStatus
    code: str | None = None


class ScanSyncResponse(BaseModel):
    results: list[ScanSyncResult]


class ScanResponse(BaseModel):
    id: str
    farm_id: str | None
    plot_id: str | None
    crop: Crop
    predicted_class: str
    severity: Severity
    confidence: float
    threshold: float
    is_low_confidence: bool
    model_version: str
    cloudinary_public_id: str | None
    scanned_at: datetime
    updated_at: datetime
    created_at: datetime


class ScanSignatureRequest(RequestModel):
    scan_id: UUID4


class ScanSignatureResponse(BaseModel):
    """Signed parameters for a direct device-to-Cloudinary upload; never includes the secret."""

    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    public_id: str
    transformation: str
    upload_url: str


ExplanationLanguage = Literal["es", "en"]
DeclineReason = Literal["healthy", "no_sources", "not_covered"]


class ExplanationRequest(RequestModel):
    """Only the diagnosis: no names, emails, farm data or coordinates can be sent."""

    crop: Crop
    disease_class: Label
    severity: Severity
    language: ExplanationLanguage


class Citation(BaseModel):
    source_title: str
    publisher: str
    year: int
    section: str
    first_page: int
    last_page: int
    url: str


class ExplanationResponse(BaseModel):
    crop: Crop
    disease_class: str
    severity: Severity
    language: ExplanationLanguage
    covered: bool
    summary: str | None
    next_steps: list[str]
    citations: list[Citation]
    declined_reason: DeclineReason | None = None
