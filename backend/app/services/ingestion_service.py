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
import shutil
import tempfile
from datetime import datetime
from typing import List, Optional, Tuple
from urllib.parse import urlparse

import pdfplumber
import requests
from app.config import get_settings

logger = logging.getLogger(__name__)

CHUNK_MAX_CHARS = 2000   # characters (~500 tokens)
CHUNK_MIN_CHARS = 100    # don't store near-empty chunks
CHUNK_OVERLAP_CHARS = 200

_INGESTION_RUNTIME_METRICS: dict[int, dict] = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ingest_book(book_id: int, file_url: str, file_type: str, db) -> int:
    """
    Download *file_url*, extract text, chunk it, embed each chunk, persist to DB.
    Returns the number of chunks stored.
    Raises ValueError on unrecoverable extraction errors.
    """
    from app.models import DocumentChunk, Book
    from app.services.embedding_service import embed_texts, to_json

    settings = get_settings()
    model_name = settings.EMBEDDING_MODEL

    # Clean up any existing chunks first (re-index is idempotent)
    db.query(DocumentChunk).filter(DocumentChunk.book_id == book_id).delete()
    db.commit()

    with _download_to_temp(file_url) as tmp_path:
        normalised = (file_type or "").lower()
        failed_units = 0
        if "pdf" in normalised or tmp_path.endswith(".pdf"):
            raw_chunks, failed_units = _extract_pdf_chunks(tmp_path)
        elif "epub" in normalised or tmp_path.endswith(".epub"):
            raw_chunks, failed_units = _extract_epub_chunks(tmp_path)
        elif "markdown" in normalised or tmp_path.endswith(".md") or tmp_path.endswith(".markdown"):
            raw_chunks, failed_units = _extract_markdown_chunks(tmp_path)
        else:
            raise ValueError(f"Unsupported file type for ingestion: {file_type!r}")

    # Filter empty
    valid = [(text, ps, pe, section_path) for text, ps, pe, section_path in raw_chunks if text.strip()]
    if not valid:
        return 0

    # Embed all chunk texts in one batch call
    texts = [text for text, _, _, _ in valid]
    try:
        vectors = embed_texts(texts, model_name)
    except Exception as exc:
        logger.warning("Embedding failed (%s); chunks stored without embeddings.", exc)
        vectors = [None] * len(texts)

    # Persist
    db_chunks = []
    now = datetime.utcnow()
    for idx, ((text, page_start, page_end, section_path), vector) in enumerate(zip(valid, vectors)):
        chunk = DocumentChunk(
            book_id=book_id,
            chunk_index=idx,
            text=text,
            page_start=page_start,
            page_end=page_end,
            section_path=section_path,
            token_count=_rough_token_count(text),
            embedding=to_json(vector) if vector is not None else None,
            embedding_model=model_name if vector is not None else None,
            indexed_at=now,  # Set indexed_at timestamp
        )
        db_chunks.append(chunk)

    db.bulk_save_objects(db_chunks)
    db.commit()
    avg_len = sum(len(c.text) for c in db_chunks) / len(db_chunks)
    logger.info("Ingested book_id=%s: %d chunks stored (embeddings: %s)",
                book_id, len(db_chunks), vectors[0] is not None)
    logger.info(
        "Ingestion metrics book_id=%s: avg_chunk_len=%.1f, failed_units=%s",
        book_id,
        avg_len,
        failed_units,
    )
    _INGESTION_RUNTIME_METRICS[book_id] = {
        "failed_units": failed_units,
        "updated_at": datetime.utcnow().isoformat(),
    }

    # Trigger knowledge point extraction as best-effort (non-blocking)
    try:
        from app.services.knowledge_extraction_service import extract_knowledge_points_for_book
        from app.services.knowledge_graph_service import infer_relationships
        book_owner = db.query(Book).filter(Book.id == book_id).first()
        if not book_owner:
            logger.warning("Knowledge extraction skipped for book_id=%s: book/owner not found", book_id)
        else:
            logger.info("Starting knowledge extraction for book_id=%s", book_id)
            count = extract_knowledge_points_for_book(book_id, book_owner.owner_id, db)
            db.commit()
            logger.info("Knowledge extraction for book_id=%s: %d points extracted", book_id, count)

            if count > 0:
                logger.info("Starting relationship inference for user_id=%s", book_owner.owner_id)
                links = infer_relationships(book_owner.owner_id, db)
                logger.info("Relationship inference for user_id=%s: %d links created", book_owner.owner_id, links)
    except Exception as exc:
        logger.warning("Knowledge pipeline failed for book_id=%s: %s", book_id, exc, exc_info=True)

    return len(db_chunks)


def get_ingestion_metrics(book_id: int, db) -> dict:
    """Return basic ingestion quality metrics for a specific book."""
    from app.models import DocumentChunk

    rows = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.book_id == book_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )
    if not rows:
        return {
            "book_id": book_id,
            "chunk_count": 0,
            "avg_chunk_chars": 0.0,
            "avg_token_count": 0.0,
            "sections_count": 0,
            "failed_units": _INGESTION_RUNTIME_METRICS.get(book_id, {}).get("failed_units", 0),
            "status": "not_indexed",
        }

    chunk_count = len(rows)
    avg_chunk_chars = sum(len(r.text or "") for r in rows) / chunk_count
    avg_token_count = sum(r.token_count or 0 for r in rows) / chunk_count
    sections_count = len({r.section_path for r in rows if r.section_path})
    failed_units = _INGESTION_RUNTIME_METRICS.get(book_id, {}).get("failed_units", 0)

    return {
        "book_id": book_id,
        "chunk_count": chunk_count,
        "avg_chunk_chars": round(avg_chunk_chars, 2),
        "avg_token_count": round(avg_token_count, 2),
        "sections_count": sections_count,
        "failed_units": failed_units,
        "status": "indexed",
    }


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

        # Local OSS shortcut: resolve /api/files/download/<object_key> to backend/uploads/<object_key>
        # to avoid auth-protected HTTP download during server-side ingestion.
        parsed = urlparse(self.url)
        download_prefix = "/api/files/download/"
        if parsed.path.startswith(download_prefix):
            object_key = parsed.path[len(download_prefix):]
            backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            local_source = os.path.join(backend_root, "uploads", object_key)
            if os.path.exists(local_source):
                shutil.copy2(local_source, self._path)
                return self._path

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

def _extract_pdf_chunks(path: str) -> Tuple[List[Tuple[str, int, int, Optional[str]]], int]:
    """Return list of (text, page_start, page_end, section_path) tuples, one per logical chunk."""
    chunks: List[Tuple[str, int, int, Optional[str]]] = []
    buffer = ""
    buffer_start = 1
    failed_pages = 0

    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            if not page_text.strip():
                failed_pages += 1
                continue
            buffer += (" " if buffer else "") + page_text.strip()

            flush_now = (
                len(buffer) >= CHUNK_MIN_CHARS and (
                    len(buffer) >= CHUNK_MAX_CHARS or i == total
                )
            )
            if flush_now:
                for sub_text, sub_start, sub_end in _split_long_chunk(buffer, buffer_start, i):
                    chunks.append((sub_text, sub_start, sub_end, f"Page {sub_start}"))
                buffer = ""
                buffer_start = i + 1

    # Flush remaining
    if buffer.strip():
        chunks.append((buffer, buffer_start, buffer_start, f"Page {buffer_start}"))

    return chunks, failed_pages


# ---------------------------------------------------------------------------
# EPUB extraction
# ---------------------------------------------------------------------------

def _extract_epub_chunks(path: str) -> Tuple[List[Tuple[str, int, int, Optional[str]]], int]:
    """Return list of (text, chapter_index, chapter_index, section_path) tuples."""
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
    chunks: List[Tuple[str, int, int, Optional[str]]] = []
    chapter_idx = 0
    failed_docs = 0

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        raw_text = soup.get_text(separator=" ", strip=True)
        if not raw_text.strip():
            failed_docs += 1
            continue
        heading_node = soup.find(re.compile(r"^h[1-6]$"))
        section_path = heading_node.get_text(" ", strip=True) if heading_node else f"Chapter {chapter_idx + 1}"
        for sub_text, _, _ in _split_with_boundaries(raw_text, chapter_idx, chapter_idx):
            chunks.append((sub_text, chapter_idx, chapter_idx, section_path))
        chapter_idx += 1

    return chunks, failed_docs


# ---------------------------------------------------------------------------
# Markdown extraction
# ---------------------------------------------------------------------------

def _extract_markdown_chunks(path: str) -> Tuple[List[Tuple[str, int, int, Optional[str]]], int]:
    """Return list of (text, section_index, section_index, section_path) tuples."""
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    lines = content.splitlines()
    chunks: List[Tuple[str, int, int, Optional[str]]] = []
    current_lines: List[str] = []
    heading_stack: List[str] = []
    current_section_path: Optional[str] = None
    section_idx = 0

    def flush_current() -> None:
        nonlocal current_lines, section_idx
        text = "\n".join(current_lines).strip()
        if text:
            for sub_text, _, _ in _split_with_boundaries(text, section_idx, section_idx):
                chunks.append((sub_text, section_idx, section_idx, current_section_path))
            section_idx += 1
        current_lines = []

    for line in lines:
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", line.strip())
        if heading_match:
            if current_lines:
                flush_current()

            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            heading_stack[:] = heading_stack[: level - 1]
            heading_stack.append(title)
            current_section_path = " > ".join(heading_stack)

        current_lines.append(line)

    flush_current()

    if not chunks and content.strip():
        for sub_text, _, _ in _split_with_boundaries(content.strip(), 0, 0):
            chunks.append((sub_text, 0, 0, None))

    return chunks, 0


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
            overlap = current[-CHUNK_OVERLAP_CHARS:].strip()
            current = f"{overlap} {sentence}".strip() if overlap else sentence
        else:
            current = (current + " " + sentence).strip() if current else sentence

    if current.strip():
        result.append((current.strip(), page_start, page_end))

    return result if result else [(text[:CHUNK_MAX_CHARS], page_start, page_end)]


def _split_with_boundaries(
    text: str,
    page_start: int,
    page_end: int,
) -> List[Tuple[str, int, int]]:
    """
    Split by paragraph boundaries first to avoid cutting across headings/tables/formulas.
    Falls back to sentence splitter only when an individual paragraph is too large.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return []

    result: List[Tuple[str, int, int]] = []
    current = ""

    for para in paragraphs:
        candidate = f"{current}\n\n{para}".strip() if current else para
        if len(candidate) <= CHUNK_MAX_CHARS:
            current = candidate
            continue

        if current:
            result.append((current, page_start, page_end))
            current = ""

        if len(para) <= CHUNK_MAX_CHARS:
            current = para
        else:
            result.extend(_split_long_chunk(para, page_start, page_end))

    if current:
        result.append((current, page_start, page_end))

    return result


def _rough_token_count(text: str) -> int:
    """Approximate token count as word count (good enough for chunk sizing)."""
    return len(text.split())
