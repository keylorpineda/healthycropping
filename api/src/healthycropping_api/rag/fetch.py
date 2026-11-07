"""Download official documents into the git-ignored RAG cache, verifying checksums."""

import hashlib
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO

from healthycropping_api.rag.sources import SourceSpec

USER_AGENT = "HealthyCropping-RAG-fetcher/0.1 (+https://github.com/keylorpineda/healthycropping)"
TIMEOUT_SECONDS = 60

Opener = Callable[[urllib.request.Request], BinaryIO]


class ChecksumMismatchError(RuntimeError):
    """Raised when a downloaded document does not match its configured SHA-256."""


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _default_opener(request: urllib.request.Request) -> BinaryIO:
    response: BinaryIO = urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS)
    return response


def fetch_document(
    source: SourceSpec,
    docs_dir: Path,
    opener: Opener = _default_opener,
) -> tuple[Path, str]:
    """Return the cached document path and its SHA-256, downloading it if needed.

    A cached file that matches the configured checksum is reused, so repeated runs
    make no requests. A download that does not match is deleted and reported.
    """
    docs_dir.mkdir(parents=True, exist_ok=True)
    target = docs_dir / source.filename
    if target.exists() and (source.sha256 is None or sha256_of(target) == source.sha256):
        return target, sha256_of(target)

    partial = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(source.url, headers={"User-Agent": USER_AGENT})
    with opener(request) as response, partial.open("wb") as handle:
        for block in iter(lambda: response.read(1 << 20), b""):
            handle.write(block)

    digest = sha256_of(partial)
    if source.sha256 is not None and digest != source.sha256:
        partial.unlink()
        raise ChecksumMismatchError(
            f"{source.id}: expected sha256 {source.sha256}, downloaded {digest} from {source.url}"
        )
    partial.replace(target)
    return target, digest
