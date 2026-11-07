"""Download official agronomic manuals and chunk their configured sections.

Usage (from `api/`, with the `rag` extra installed):

    uv run python scripts/fetch_agronomic_docs.py
    uv run python scripts/fetch_agronomic_docs.py --offline   # reuse cached documents only

Documents go to `api/.cache/rag/docs/` and chunks to `api/.cache/rag/chunks.jsonl`;
both are git-ignored. The run prints chunk coverage per crop and disease class and
exits with status 1 if a disease class of a configured crop has no chunks.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from healthycropping_api.rag.chunking import (
    DEFAULT_MAX_CHARS,
    DEFAULT_OVERLAP_CHARS,
    Chunk,
    build_chunks,
)
from healthycropping_api.rag.extract import read_pdf_pages
from healthycropping_api.rag.fetch import fetch_document
from healthycropping_api.rag.sources import load_sources
from healthycropping_api.rag.taxonomy import disease_classes

API_ROOT = Path(__file__).resolve().parents[1]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--sources", type=Path, default=API_ROOT / "rag_sources.toml")
    parser.add_argument("--cache-dir", type=Path, default=API_ROOT / ".cache" / "rag")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    parser.add_argument("--overlap-chars", type=int, default=DEFAULT_OVERLAP_CHARS)
    parser.add_argument(
        "--offline", action="store_true", help="fail instead of downloading missing documents"
    )
    return parser.parse_args(argv)


def coverage_gaps(chunks: list[Chunk], crops: set[str]) -> list[str]:
    covered = {(chunk.crop, name) for chunk in chunks for name in chunk.disease_classes}
    return [
        f"{crop}/{name}"
        for crop in sorted(crops)
        for name in disease_classes(crop)
        if (crop, name) not in covered
    ]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    sources = load_sources(args.sources)
    docs_dir = args.cache_dir / "docs"

    chunks: list[Chunk] = []
    for source in sources:
        cached = docs_dir / source.filename
        if args.offline and not cached.exists():
            print(f"[missing] {source.id}: {cached} (run without --offline)", file=sys.stderr)
            return 1
        path, digest = fetch_document(source, docs_dir)
        if source.sha256 is None:
            print(f'[note] {source.id}: add sha256 = "{digest}" to {args.sources.name}')
        source_chunks = build_chunks(
            source, read_pdf_pages(path), args.max_chars, args.overlap_chars
        )
        print(f"[ok] {source.id}: {len(source_chunks)} chunks")
        chunks.extend(source_chunks)

    output = args.cache_dir / "chunks.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk.to_dict(), ensure_ascii=False) + "\n")
    print(f"Wrote {len(chunks)} chunks to {output}")

    counts = Counter((chunk.crop, name) for chunk in chunks for name in chunk.disease_classes)
    for (crop, name), count in sorted(counts.items()):
        print(f"  {crop}/{name}: {count}")
    gaps = coverage_gaps(chunks, {source.crop for source in sources})
    if gaps:
        print(f"Disease classes without chunks: {', '.join(gaps)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
