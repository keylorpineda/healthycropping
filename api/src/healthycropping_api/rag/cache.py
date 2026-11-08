"""In-process cache of explanations keyed by the diagnosis alone.

An explanation depends only on `(crop, disease_class, severity, language)` and the
bundled index, so every farmer with the same diagnosis can share one answer. That
keeps Gemini calls (and the free-tier quota) to at most one per key per process.
Concurrent misses on the same key wait for the first one instead of calling the
model twice. Failures are never stored, so the next request retries.
"""

import threading
from collections import OrderedDict
from collections.abc import Callable
from typing import Final

from healthycropping_api.schemas import ExplanationRequest, ExplanationResponse

CacheKey = tuple[str, str, str, str]

# The key space is bounded by the taxonomy (classes x severities x languages is a
# few dozen keys); the cap only guards against a future taxonomy growing unnoticed.
DEFAULT_MAX_ENTRIES: Final = 512


def cache_key(request: ExplanationRequest) -> CacheKey:
    return (request.crop, request.disease_class, request.severity, request.language)


class ExplanationCache:
    """Thread-safe LRU cache with single-flight computation per key."""

    def __init__(self, max_entries: int = DEFAULT_MAX_ENTRIES) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        self._max_entries = max_entries
        self._entries: OrderedDict[CacheKey, ExplanationResponse] = OrderedDict()
        self._lock = threading.Lock()
        self._key_locks: dict[CacheKey, threading.Lock] = {}

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)

    def get(self, key: CacheKey) -> ExplanationResponse | None:
        with self._lock:
            value = self._entries.get(key)
            if value is not None:
                self._entries.move_to_end(key)
            return value

    def put(self, key: CacheKey, value: ExplanationResponse) -> None:
        with self._lock:
            self._entries[key] = value
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def get_or_create(
        self,
        key: CacheKey,
        create: Callable[[], ExplanationResponse],
        should_store: Callable[[ExplanationResponse], bool],
    ) -> ExplanationResponse:
        cached = self.get(key)
        if cached is not None:
            return cached
        with self._lock:
            key_lock = self._key_locks.setdefault(key, threading.Lock())
        with key_lock:
            cached = self.get(key)
            if cached is not None:
                return cached
            value = create()
            if should_store(value):
                self.put(key, value)
            return value
