"""Retrieval queries built from a diagnosis, never from user-provided text.

The explanation endpoint only knows `(crop, disease_class, severity, language)`
(no names, emails or coordinates), so the query is assembled from fixed,
bilingual keyword lists. Spanish and English terms are both included because
some sources are in English (FAO) and the answer language is chosen later.
"""

from typing import Final, Literal

Severity = Literal["healthy", "watch", "actNow"]

DISEASE_TERMS: Final[dict[tuple[str, str], str]] = {
    ("coffee", "leaf_rust"): "roya cafeto hemileia vastatrix manchas amarillas polvo anaranjado "
    "coffee leaf rust",
    ("coffee", "leaf_miner"): "minador hoja leucoptera coffeella galerias insecto leaf miner",
    ("coffee", "red_spider_mite"): "aranita roja acaro oligonychus bronceado hojas spider mite",
    ("coffee", "cercospora"): "chasparria cercospora coffeicola mancha hierro manchas circulares "
    "borde amarillo",
    ("coffee", "brown_leaf_spot"): "derrite phoma manchas humedas cafe anillos muerte puntas ramas",
    ("cacao", "monilia"): "moniliasis monilia moniliophthora roreri mazorcas gibas mancha "
    "chocolate esporulacion frutos",
    ("cacao", "black_pod"): "mazorca negra phytophthora mancha parda micelio zoosporas frutos",
    ("banana", "black_sigatoka"): "sigatoka negra mycosphaerella fijiensis hojas lesiones "
    "deshoje black sigatoka",
    ("banana", "fusarium_wilt"): "fusarium wilt panama disease tr4 marchitez fusarium "
    "oxysporum cubense yellowing pseudostem vascular",
}

# What the explanation needs at each severity level.
SEVERITY_TERMS: Final[dict[str, str]] = {
    "healthy": "prevencion manejo cultural prevention",
    "watch": "sintomas signos reconocer identificar monitoreo prevencion "
    "symptoms signs identify monitoring prevention",
    "actNow": "control combate manejo integrado fungicida aplicar aplicacion eliminar "
    "destruir erradicacion dosis control management eradication destroy quarantine",
}


# Candidates are already filtered to the diagnosed disease, so the disease terms
# only help a little; ranking is driven by what the severity calls for (symptoms
# and prevention for "watch", control and eradication for "actNow").
DISEASE_WEIGHT: Final = 0.35
SEVERITY_WEIGHT: Final = 1.0

WeightedQuery = list[tuple[str, float]]


def build_query(crop: str, disease_class: str, severity: str) -> WeightedQuery:
    """Weighted keyword query for one diagnosis; raises KeyError for an unknown key."""
    return [
        (DISEASE_TERMS[(crop, disease_class)], DISEASE_WEIGHT),
        (SEVERITY_TERMS[severity], SEVERITY_WEIGHT),
    ]
