"""Tokenization shared by the index builder and the retriever (Spanish and English)."""

import re
import unicodedata

_TOKEN = re.compile(r"[a-z0-9]+")

# Common Spanish and English function words, accent-folded.
_STOPWORD_LINES = (
    "a al algo algunas algunos ante antes como con contra cual cuando de del desde",
    "donde durante e el ella ellas ellos en entre era es esa esas ese eso esos esta",
    "estan estas este esto estos fue fueron ha han hasta hay la las le les lo los mas",
    "me muy mientras ni no nos o otra otras otro otros para pero poco por porque que",
    "se sea ser si sin sobre son su sus tambien tanto te tiene tienen todo todos tras",
    "un una unas uno unos y ya",
    "an and are as at be been but by can for from had has have if in into is it its",
    "may more most not of on or other such than that the their them then there these",
    "they this those to was were when where which while who will with within",
)
STOPWORDS = frozenset(" ".join(_STOPWORD_LINES).split())


def fold_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _stem(token: str) -> str:
    """Very light plural folding: "hojas" -> "hoja", "lesiones" -> "lesion", "leaves" stays."""
    if len(token) > 5 and token.endswith("es") and token[-3] in "nrl":
        return token[:-2]
    if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    """Lowercase, strip accents, split on non-alphanumerics, drop stopwords and short tokens."""
    return [
        _stem(token)
        for token in _TOKEN.findall(fold_accents(text))
        if len(token) > 2 and token not in STOPWORDS and not token.isdigit()
    ]
