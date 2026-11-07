"""Read per-page text from a PDF (requires the `rag` extra: pypdf + fonttools)."""

from pathlib import Path


def read_pdf_pages(path: Path) -> list[str]:
    """Return the extracted text of every page, in order (index 0 is PDF page 1)."""
    # Imported lazily so the API server does not need the `rag` extra at runtime.
    from pypdf import PdfReader

    reader = PdfReader(path)
    return [page.extract_text() or "" for page in reader.pages]
