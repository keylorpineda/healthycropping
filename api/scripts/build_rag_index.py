"""Build the local RAG index from the chunks written by `fetch_agronomic_docs.py`.

Usage (from `api/`):

    uv run python scripts/fetch_agronomic_docs.py
    uv run python scripts/build_rag_index.py

Reads `api/.cache/rag/chunks.jsonl` and writes `api/.cache/rag/index.json`
(git-ignored). The output is deterministic: the same chunks give a byte-identical
index. With `--check`, it also runs one retrieval per crop and disease class and
prints the top citation, exiting with status 1 if any class returns nothing.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

from healthycropping_api.rag.index import RagIndex, build_index, write_index
from healthycropping_api.rag.queries import build_query
from healthycropping_api.rag.taxonomy import CROP_CLASSES, disease_classes

API_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = API_ROOT / ".cache" / "rag"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--chunks", type=Path, default=CACHE_DIR / "chunks.jsonl")
    parser.add_argument("--output", type=Path, default=CACHE_DIR / "index.json")
    parser.add_argument("--check", action="store_true", help="smoke-test retrieval per class")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.chunks.exists():
        print(
            f"{args.chunks} not found; run scripts/fetch_agronomic_docs.py first", file=sys.stderr
        )
        return 1
    with args.chunks.open(encoding="utf-8") as handle:
        chunks = [json.loads(line) for line in handle if line.strip()]

    index = build_index(chunks)
    write_index(index, args.output)
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"Indexed {index['chunk_count']} chunks, {len(index['idf'])} terms -> {args.output}")
    print(f"sha256 {digest}")

    if not args.check:
        return 0
    retriever = RagIndex(index)
    missing: list[str] = []
    for crop in sorted(CROP_CLASSES):
        for name in disease_classes(crop):
            results = retriever.retrieve(crop, name, build_query(crop, name, "actNow"), k=1)
            if not results:
                missing.append(f"{crop}/{name}")
                continue
            top = results[0]
            print(f"  {crop}/{name}: {top.chunk.id} ({top.score:.3f})")
    if missing:
        print(f"No chunks for: {', '.join(missing)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
