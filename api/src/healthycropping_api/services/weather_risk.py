"""Conservative, rule-based disease risk from a plot's microclimate.

Every threshold below is either taken from a cited source (`basis="source"`) or is
an explicit engineering choice awaiting agronomist validation (`basis="provisional"`),
and the response says which. Nothing here is a forecast model: a "favourable day"
only means the recorded or forecast weather matched conditions the sources link
to infection.

- Coffee leaf rust: mean temperature 21.6-23.6 C with leaf wetness and relative
  humidity above 80 % is the most favourable condition for infection (Capucho et
  al., 2013). ICAFE's guide (2020) adds that rust is favoured by warm, humid
  conditions caused by rain or dew, which is how leaf wetness is approximated.
- Cacao moniliasis: incidence rises when relative humidity stays above 80 % and
  temperature above 24 C for 6 to 8 hours a day (CATIE, 2021).
- Banana black Sigatoka: the indexed sources (CORBANA, 2011) only say that rain
  splash spreads conidia and ascospores are released in humid periods; no
  verified numeric threshold was found, so no level is computed.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Final, Literal

from pydantic import BaseModel

from healthycropping_api.services.weather import Microclimate, WeatherAttribution

RiskLevel = Literal["low", "moderate", "high"]
RiskStatus = Literal["evaluated", "insufficient_evidence"]
Basis = Literal["source", "provisional"]

WINDOW_DAYS: Final = 7
# Provisional: favourable days in a 7-day window -> level. Chosen to stay
# conservative (a single favourable day is already "moderate").
MODERATE_FROM_DAYS: Final = 1
HIGH_FROM_DAYS: Final = 3
# Provisional leaf-wetness proxy: rain, or air within 1 C of its dew point (dew).
WET_RAIN_HOURS: Final = 1.0
DEW_POINT_SPREAD_C: Final = 1.0

DISCLAIMER: Final = (
    "Estimated from weather data with simple published thresholds; it is not a "
    "diagnosis. Inspect the plot and consult an agronomist before applying "
    "agrochemicals."
)


class Source(BaseModel):
    citation: str
    url: str


CAPUCHO_2013 = Source(
    citation=(
        "Capucho, A. S. et al. (2013). Climate favourability to leaf rust in Conilon "
        "coffee. Australasian Plant Pathology 42(5), 511-514."
    ),
    url="https://doi.org/10.1007/s13313-012-0187-6",
)
ICAFE_2020 = Source(
    citation="ICAFE-CICAFE (2020). Guía técnica para el cultivo de café, Roya (p. 55).",
    url="https://www.icafe.cr/",
)
CATIE_2021 = Source(
    citation=(
        "CATIE (2021). Guía para el manejo integrado de enfermedades en el cultivo de "
        "cacao. Manual técnico 146, Moniliasis (pp. 7-12)."
    ),
    url="https://repositorio.catie.ac.cr/",
)
CORBANA_2011 = Source(
    citation="CORBANA (2011). Manejo de la Sigatoka negra en el cultivo del banano.",
    url="https://www.corbana.co.cr/",
)


class Threshold(BaseModel):
    name: str
    description: str
    basis: Basis
    source: Source | None = None


class WindowRisk(BaseModel):
    window: Literal["recent", "upcoming"]
    days: int
    favourable_days: int
    favourable_dates: list[str]
    level: RiskLevel


class DiseaseRisk(BaseModel):
    crop: str
    disease_class: str
    status: RiskStatus
    level: RiskLevel | None
    recent: WindowRisk | None
    upcoming: WindowRisk | None
    explanation: str
    thresholds: list[Threshold]
    disclaimer: str = DISCLAIMER


class WeatherRiskResponse(BaseModel):
    plot_id: str
    latitude: float
    longitude: float
    stale: bool
    risks: list[DiseaseRisk]
    attribution: WeatherAttribution


@dataclass(frozen=True)
class Day:
    date: str
    temperature_mean_c: float | None
    humidity_mean_pct: float | None
    precipitation_hours: float | None
    hours: list[tuple[float | None, float | None, float | None]]  # (temp, rh, dew point)


def split_days(climate: Microclimate) -> list[Day]:
    """Group hourly values under their local date (`YYYY-MM-DDTHH:MM` -> `YYYY-MM-DD`)."""
    by_date: dict[str, list[tuple[float | None, float | None, float | None]]] = {}
    hourly = climate.hourly
    for i, stamp in enumerate(hourly.time):
        by_date.setdefault(stamp[:10], []).append(
            (hourly.temperature_c[i], hourly.relative_humidity_pct[i], hourly.dew_point_c[i])
        )
    daily = climate.daily
    return [
        Day(
            date=date,
            temperature_mean_c=daily.temperature_mean_c[i],
            humidity_mean_pct=daily.relative_humidity_mean_pct[i],
            precipitation_hours=daily.precipitation_hours[i],
            hours=by_date.get(date, []),
        )
        for i, date in enumerate(daily.date)
    ]


def level_for(favourable_days: int) -> RiskLevel:
    if favourable_days >= HIGH_FROM_DAYS:
        return "high"
    if favourable_days >= MODERATE_FROM_DAYS:
        return "moderate"
    return "low"


def _max_level(a: RiskLevel, b: RiskLevel) -> RiskLevel:
    order: tuple[RiskLevel, ...] = ("low", "moderate", "high")
    return a if order.index(a) >= order.index(b) else b


def is_wet(day: Day) -> bool:
    if day.precipitation_hours is not None and day.precipitation_hours >= WET_RAIN_HOURS:
        return True
    return any(
        temp is not None and dew is not None and temp - dew <= DEW_POINT_SPREAD_C
        for temp, _, dew in day.hours
    )


def coffee_rust_favourable(day: Day) -> bool:
    return (
        day.temperature_mean_c is not None
        and 21.6 <= day.temperature_mean_c <= 23.6
        and day.humidity_mean_pct is not None
        and day.humidity_mean_pct > 80
        and is_wet(day)
    )


MONILIA_MIN_HOURS: Final = 6


def monilia_favourable(day: Day) -> bool:
    hours = sum(
        1
        for temp, rh, _ in day.hours
        if temp is not None and rh is not None and rh > 80 and temp > 24
    )
    return hours >= MONILIA_MIN_HOURS


WINDOW_THRESHOLD = Threshold(
    name="window_levels",
    description=(
        f"Favourable days in each {WINDOW_DAYS}-day window: 0 -> low, "
        f"{MODERATE_FROM_DAYS}-{HIGH_FROM_DAYS - 1} -> moderate, {HIGH_FROM_DAYS}+ -> high."
    ),
    basis="provisional",
)
WETNESS_THRESHOLD = Threshold(
    name="leaf_wetness_proxy",
    description=(
        f"A day counts as wet with at least {WET_RAIN_HOURS:g} hour of rain or an hour "
        f"with air temperature within {DEW_POINT_SPREAD_C:g} C of the dew point (dew)."
    ),
    basis="provisional",
    source=ICAFE_2020,
)

COFFEE_THRESHOLDS: Final = [
    Threshold(
        name="rust_temperature_humidity",
        description=(
            "Daily mean temperature between 21.6 and 23.6 C and mean relative humidity "
            "above 80 %, with leaf wetness."
        ),
        basis="source",
        source=CAPUCHO_2013,
    ),
    WETNESS_THRESHOLD,
    WINDOW_THRESHOLD,
]
CACAO_THRESHOLDS: Final = [
    Threshold(
        name="monilia_humid_warm_hours",
        description=(
            f"At least {MONILIA_MIN_HOURS} hours in the day with relative humidity above "
            "80 % and temperature above 24 C."
        ),
        basis="source",
        source=CATIE_2021,
    ),
    WINDOW_THRESHOLD,
]


def _window(
    days: list[Day], window: Literal["recent", "upcoming"], check: Callable[[Day], bool]
) -> WindowRisk:
    favourable = [day.date for day in days if check(day)]
    return WindowRisk(
        window=window,
        days=len(days),
        favourable_days=len(favourable),
        favourable_dates=favourable,
        level=level_for(len(favourable)),
    )


def _evaluate(
    crop: str,
    disease_class: str,
    days: list[Day],
    today: str,
    check: Callable[[Day], bool],
    thresholds: list[Threshold],
    label: str,
) -> DiseaseRisk:
    """`recent` = up to 7 days before `today`; `upcoming` = `today` and up to 6 after."""
    recent = _window([d for d in days if d.date < today][-WINDOW_DAYS:], "recent", check)
    upcoming = _window([d for d in days if d.date >= today][:WINDOW_DAYS], "upcoming", check)
    return DiseaseRisk(
        crop=crop,
        disease_class=disease_class,
        status="evaluated",
        level=_max_level(recent.level, upcoming.level),
        recent=recent,
        upcoming=upcoming,
        explanation=(
            f"{label}: {recent.favourable_days} of the last {recent.days} days and "
            f"{upcoming.favourable_days} of the next {upcoming.days} days matched the "
            "favourable conditions listed in `thresholds`."
        ),
        thresholds=thresholds,
    )


def _insufficient(crop: str, disease_class: str, explanation: str, source: Source) -> DiseaseRisk:
    return DiseaseRisk(
        crop=crop,
        disease_class=disease_class,
        status="insufficient_evidence",
        level=None,
        recent=None,
        upcoming=None,
        explanation=explanation,
        thresholds=[
            Threshold(
                name="no_verified_threshold",
                description=explanation,
                basis="source",
                source=source,
            )
        ],
    )


def assess(crop: str, climate: Microclimate, today: str) -> list[DiseaseRisk]:
    """Risks for the plot's crop; `today` is the local date (`YYYY-MM-DD`)."""
    days = split_days(climate)
    if crop == "coffee":
        return [
            _evaluate(
                crop,
                "leaf_rust",
                days,
                today,
                coffee_rust_favourable,
                COFFEE_THRESHOLDS,
                "Coffee leaf rust",
            )
        ]
    if crop == "cacao":
        return [
            _evaluate(
                crop,
                "monilia",
                days,
                today,
                monilia_favourable,
                CACAO_THRESHOLDS,
                "Cacao moniliasis",
            )
        ]
    if crop == "banana":
        return [
            _insufficient(
                crop,
                "black_sigatoka",
                (
                    "No verified numeric weather threshold for black Sigatoka was found in "
                    "the indexed sources, so no level is estimated. Rain splash spreads the "
                    "disease and spores are released in humid periods; CORBANA's BANACLIMA "
                    "service gives regional alerts."
                ),
                CORBANA_2011,
            )
        ]
    return []
