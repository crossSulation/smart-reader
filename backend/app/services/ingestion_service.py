"""
Ingestion service: download a book's file from OSS, extract full text, split into
chunks, and store them in the document_chunks table.

Chunking strategy
-----------------
- PDF      : one chunk per page (already a natural unit; merge short pages)
- EPUB     : one chunk per chapter spine item
- Markdown : one chunk per heading section
- All      : chunks longer than CHUNK_MAX_CHARS are split at sentence boundaries;
             chunks shorter than CHUNK_MIN_CHARS are merged with the next chunk.

The service is synchronous so it can be called inline or from a background worker
without any async framework changes.
"""

import logging
import os
import re
import tempfile
from typing import List, Tuple

import pdfplumber
import requests
from app.config import get_settings

logger = logging.getLogger(__name__)

CHUNK_MAX_CHARS = 2000   # characters (~500 tokens)
CHUNK_MIN_CHARS = 100    # don't store near-empty chunks


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ingest_book(book_id: int, file_url: str, file_type: str, db) -> int:
    """
    Download *file_url*, extract text, chunk it, embed each chunk, persist to DB.
    Returns the number of chunks stored.
    Raises ValueError on unrecoverable extraction errors.
    """
    from app.models import DocumentChunk
    from app.services.embedding_service import embed_texts, to_json

    settings = get_settings()
    model_name = settings.EMBEDDING_MODEL

    # Clean up any existing chunks first (re-index is idempotent)
    db.query(DocumentChunk).filter(DocumentChunk.book_id == book_id).delete()
    db.commit()

    with _download_to_temp(file_url) as tmp_path:
        normalised = (file_type or "").lower()
        if "pdf" in normalised or tmp_path.endswith(".pdf"):
            raw_chunks = _extract_pdf_chunks(tmp_path)
        elif "epub" in normalised or tmp_path.endswith(".epub"):
            raw_chunks = _extract_epub_chunks(tmp_path)
        elif "markdown" in normalised or tmp_path.endswith(".md") or tmp_path.endswith(".markdown"):
            raw_chunks = _extract_markdown_chunks(tmp_path)
        else:
            raise ValueError(f"Unsupported file type for ingestion: {file_type!r}")

    # Filter empty
    valid = [(text, ps, pe) for text, ps, pe in raw_chunks if text.strip()]
    if not valid:
        return 0

    # Embed all chunk texts in one batch call
    texts = [text for text, _, _ in valid]
    try:
        vectors = embed_texts(texts, model_name)
    except Exception as exc:
        logger.warning("Embedding failed (%s); chunks stored without embeddings.", exc)
        vectors = [None] * len(texts)

    # Persist
    db_chunks = []
    for idx, ((text, page_start, page_end), vector) in enumerate(zip(valid, vectors)):
        chunk = DocumentChunk(
            book_id=book_id,
            chunk_index=idx,
            text=text,
            page_start=page_start,
            page_end=page_end,
            token_count=_rough_token_count(text),
            embedding=to_json(vector) if vector is not None else None,
            embedding_model=model_name if vector is not None else None,
        )
        db_chunks.append(chunk)

    db.bulk_save_objects(db_chunks)
    db.commit()
    logger.info("Ingested book_id=%s: %d chunks stored (embeddings: %s)",
                book_id, len(db_chunks), vectors[0] is not None)
    return len(db_chunks)


# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------

class _download_to_temp:
    """Context manager: download URL to a temp file, yield its path, clean up."""

    def __init__(self, url: str):
        self.url = url
        self._path: str | None = None

    def __enter__(self) -> str:
        # Guess extension from URL
        url_path = self.url.split("?")[0]
        ext = os.path.splitext(url_path)[1] or ".bin"
        fd, self._path = tempfile.mkstemp(suffix=ext)
        os.close(fd)
        try:
            resp = requests.get(self.url, timeout=60, stream=True)
            resp.raise_for_status()
            with open(self._path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    f.write(chunk)
        except Exception as exc:
            self.__exit__(None, None, None)
            raise ValueError(f"Failed to download file for ingestion: {exc}") from exc
        return self._path

    def __exit__(self, *_):
        if self._path and os.path.exists(self._path):
            os.unlink(self._path)


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------

def _extract_pdf_chunks(path: str) -> List[Tuple[str, int, int]]:
    """Return list of (text, page_start, page_end) tuples, one per logical chunk."""
    chunks: List[Tuple[str, int, int]] = []
    buffer = ""
    buffer_start = 1

    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            buffer += (" " if buffer else "") + page_text.strip()

            flush_now = (
                len(buffer) >= CHUNK_MIN_CHARS and (
                    len(buffer) >= CHUNK_MAX_CHARS or i == total
                )
            )
            if flush_now:
                for sub_text, sub_start, sub_end in _split_long_chunk(buffer, buffer_start, i):
                    chunks.append((sub_text, sub_start, sub_end))
                buffer = ""
                buffer_start = i + 1

    # Flush remaining
    if buffer.strip():
        chunks.append((buffer, buffer_start, buffer_start))

    return chunks


# ---------------------------------------------------------------------------
# EPUB extraction
# ---------------------------------------------------------------------------

def _extract_epub_chunks(path: str) -> List[Tuple[str, int, int]]:
    """Return list of (text, chapter_index, chapter_index) tuples."""
    try:
        import ebooklib
        from ebooklib import epub
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise ValueError(
            "ebooklib and beautifulsoup4 are required for EPUB ingestion. "
            "Install them with: pip install ebooklib beautifulsoup4"
        ) from exc

    book = epub.read_epub(path)
    chunks: List[Tuple[str, int, int]] = []
    chapter_idx = 0

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        raw_text = soup.get_text(separator=" ", strip=True)
        if not raw_text.strip():
            continue
        for sub_text, _, _ in _split_long_chunk(raw_text, chapter_idx, chapter_idx):
            chunks.append((sub_text, chapter_idx, chapter_idx))
        chapter_idx += 1

    return chunks


# ---------------------------------------------------------------------------
# Markdown extraction
# ---------------------------------------------------------------------------

def _extract_markdown_chunks(path: str) -> List[Tuple[str, int, int]]:
    """Return list of (text, section_index, section_index) tuples."""
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    lines = content.splitlines()
    chunks: List[Tuple[str, int, int]] = []
    current_lines: List[str] = []
    section_idx = 0

    def flush_current() -> None:
        nonlocal current_lines, section_idx
        text = "\n".join(current_lines).strip()
        if text:
            for sub_text, _, _ in _split_long_chunk(text, section_idx, section_idx):
                chunks.append((sub_text, section_idx, section_idx))
            section_idx += 1
        current_lines = []

    for line in lines:
        if re.match(r"^#{1,6}\s+", line.strip()) and current_lines:
            flush_current()
        current_lines.append(line)

    flush_current()

    if not chunks and content.strip():
        for sub_text, _, _ in _split_long_chunk(content.strip(), 0, 0):
            chunks.append((sub_text, 0, 0))

    return chunks


# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------

def _split_long_chunk(
    text: str,
    page_start: int,
    page_end: int,
) -> List[Tuple[str, int, int]]:
    """Split *text* into sub-chunks of at most CHUNK_MAX_CHARS at sentence boundaries."""
    if len(text) <= CHUNK_MAX_CHARS:
        return [(text, page_start, page_end)]

    # Split on sentence endings
    sentences = re.split(r"(?<=[.!?])\s+", text)
    result: List[Tuple[str, int, int]] = []
    current = ""

    for sentence in sentences:
        if len(current) + len(sentence) + 1 > CHUNK_MAX_CHARS and current:
            result.append((current.strip(), page_start, page_end))
            current = sentence
        else:
            current = (current + " " + sentence).strip() if current else sentence

    if current.strip():
        result.append((current.strip(), page_start, page_end))

    return result if result else [(text[:CHUNK_MAX_CHARS], page_start, page_end)]


def _rough_token_count(text: str) -> int:
    """Approximate token count as word count (good enough for chunk sizing)."""
    return len(text.split())
