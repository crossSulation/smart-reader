"""
AI endpoints:
  POST /api/books/{book_id}/qa       – RAG question answering
  GET  /api/books/{book_id}/summary  – LLM-generated book summary
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import AIInteraction, DocumentChunk
from app.routers.auth import get_current_user
from app.schemas import QARequest, QAResponse, SearchResult, SummaryResponse
from app.services.embedding_service import embed_single, search_chunks
from app.services.file_service import FileService
from app.services.llm_service import (
    build_qa_prompt,
    build_summary_prompt,
    complete,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["ai"])

# Max characters of context to send to LLM (avoids token-limit errors)
_MAX_CONTEXT_CHARS = 6000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_book_or_404(book_id: int, user_id: int, db: Session):
    book = FileService(db).get_book(book_id, user_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _require_chunks(book_id: int, db: Session) -> List[DocumentChunk]:
    rows = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.book_id == book_id,
            DocumentChunk.embedding.isnot(None),
        )
        .all()
    )
    if not rows:
        raise HTTPException(
            status_code=422,
            detail="Book has no embeddings. Run POST /api/books/{id}/index first.",
        )
    return rows


def _log_interaction(
    db: Session,
    user_id: int,
    book_id: int,
    interaction_type: str,
    response: str,
    provider: str,
    query: str | None = None,
    chunks_used: int = 0,
):
    record = AIInteraction(
        user_id=user_id,
        book_id=book_id,
        interaction_type=interaction_type,
        query=query,
        response=response,
        provider=provider,
        chunks_used=chunks_used,
    )
    db.add(record)
    db.commit()


def _truncate_context(chunks: list[str], max_chars: int = _MAX_CONTEXT_CHARS) -> list[str]:
    """Return as many chunks as fit within max_chars total."""
    result, total = [], 0
    for c in chunks:
        if total + len(c) > max_chars:
            break
        result.append(c)
        total += len(c)
    return result or chunks[:1]


# ---------------------------------------------------------------------------
# Q&A endpoint
# ---------------------------------------------------------------------------

@router.post("/{book_id}/qa", response_model=QAResponse)
def ask_book(
    book_id: int,
    body: QARequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieval-Augmented Generation (RAG) Q&A over a book's indexed content.
    1. Embeds the question.
    2. Retrieves top-k most relevant chunks.
    3. Passes chunks + question to the configured LLM.
    4. Returns the answer and source passages.
    """
    settings = get_settings()
    book = _get_book_or_404(book_id, user["id"], db)
    chunks = _require_chunks(book_id, db)

    # Embed question
    try:
        query_vec = embed_single(body.question, settings.EMBEDDING_MODEL)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Embedding error: {exc}") from exc

    # Retrieve
    top_k = min(body.top_k, 10)
    candidates = [(c.id, c.embedding) for c in chunks]
    top_hits = search_chunks(query_vec, candidates, top_k=top_k)
    chunk_map = {c.id: c for c in chunks}

    sources: List[SearchResult] = [
        SearchResult(
            chunk_id=cid,
            chunk_index=chunk_map[cid].chunk_index,
            text=chunk_map[cid].text,
            page_start=chunk_map[cid].page_start,
            page_end=chunk_map[cid].page_end,
            score=round(score, 4),
        )
        for cid, score in top_hits
        if cid in chunk_map
    ]

    # Build prompt and call LLM
    context_texts = _truncate_context([s.text for s in sources])
    system, user_prompt = build_qa_prompt(body.question, context_texts)
    try:
        answer = complete(user_prompt, system, settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    _log_interaction(
        db, user["id"], book_id, "qa", answer,
        settings.LLM_PROVIDER, query=body.question, chunks_used=len(sources),
    )
    return QAResponse(
        question=body.question,
        answer=answer,
        sources=sources,
        provider=settings.LLM_PROVIDER,
    )


# ---------------------------------------------------------------------------
# Summary endpoint
# ---------------------------------------------------------------------------

@router.get("/{book_id}/summary", response_model=SummaryResponse)
def get_book_summary(
    book_id: int,
    max_chunks: int = Query(20, ge=1, le=100, description="Number of chunks to summarise"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate an LLM summary using the first N chunks of the book.
    Results are NOT cached — call with care on large books.
    """
    settings = get_settings()
    book = _get_book_or_404(book_id, user["id"], db)

    # Fetch first max_chunks in order (no embedding required for summary)
    rows = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.book_id == book_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(max_chunks)
        .all()
    )
    if not rows:
        raise HTTPException(
            status_code=422,
            detail="Book has no indexed chunks. Run POST /api/books/{id}/index first.",
        )

    context_texts = _truncate_context([r.text for r in rows])
    system, user_prompt = build_summary_prompt(context_texts, book.title)
    try:
        summary = complete(user_prompt, system, settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    _log_interaction(
        db, user["id"], book_id, "summary", summary,
        settings.LLM_PROVIDER, chunks_used=len(context_texts),
    )
    return SummaryResponse(
        book_id=book_id,
        title=book.title,
        summary=summary,
        provider=settings.LLM_PROVIDER,
        chunks_used=len(context_texts),
    )
