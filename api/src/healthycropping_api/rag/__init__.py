"""Retrieval-augmented generation over official agronomic manuals.

`sources` loads `rag_sources.toml`, `fetch` downloads the documents into a
git-ignored cache, `extract` reads PDF text, and `chunking` turns the configured
sections into citable chunks with `(source, section, crop, disease)` metadata.
"""
