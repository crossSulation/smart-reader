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
from app.models import AIInteraction, AICitation, DocumentChunk
from app.routers.auth import get_current_user
from app.schemas import QARequest, QAResponse, SearchResult, Citation, SummaryResponse
from app.services.embedding_service import embed_single, search_chunks
from app.services.file_service import FileService
from app.services.llm_service import (
    build_qa_prompt,
    build_summary_prompt,
    complete,
)
from app.services.retrieval_service import retrieve_hybrid, clear_retriever
from app.services.reranker_service import rerank_candidates

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
    citation_payload: list[dict] | None = None,
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
    db.flush()

    if citation_payload:
        db.add_all([
            AICitation(
                interaction_id=record.id,
                book_id=item["book_id"],
                chunk_id=item["chunk_id"],
                page=item.get("page"),
                quote=item["quote"],
                score=item["score"],
            )
            for item in citation_payload
        ])

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


def _normalize_rank_scores(hits: list[tuple[int, float]]) -> list[tuple[int, float]]:
    """Normalize per-query ranking scores into [0, 1] for confidence/citation display."""
    if not hits:
        return []

    scores = [score for _, score in hits]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score

    if score_range <= 0:
        return [(cid, 0.5) for cid, _ in hits]

    return [(cid, (score - min_score) / score_range) for cid, score in hits]


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
    evidence_threshold = max(0.0, min(1.0, settings.QA_EVIDENCE_THRESHOLD))
    book = _get_book_or_404(book_id, user["id"], db)
    chunks = _require_chunks(book_id, db)

    # Embed question
    try:
        query_vec = embed_single(body.question, settings.EMBEDDING_MODEL)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Embedding error: {exc}") from exc

    # Retrieve using hybrid (BM25 + vector) search
    top_k = min(body.top_k, 10)
    
    # Prepare chunk data for retriever
    chunk_data = [
        (c.id, c.text, c.embedding)
        for c in chunks
    ]
    
    # Use hybrid retrieval: combines keyword matching and semantic similarity
    top_hits = retrieve_hybrid(
        book_id=book_id,
        query=body.question,
        query_vector=query_vec,
        top_k=top_k * 2,  # Get more candidates for reranking
        chunks=chunk_data,
    )
    
    # Rerank candidates for improved quality
    chunk_map = {c.id: c for c in chunks}
    candidates_for_rerank = [
        (cid, chunk_map[cid].text, score)
        for cid, score in top_hits
        if cid in chunk_map
    ]
    
    try:
        reranked = rerank_candidates(
            query=body.question,
            candidates=candidates_for_rerank,
            top_k=top_k,
        )
        top_hits_final = reranked
    except Exception as e:
        logger.warning(f"Reranking failed, using hybrid results: {e}")
        top_hits_final = [(cid, score) for cid, _, score in candidates_for_rerank[:top_k]]

    # Cross-encoder scores can be unbounded; normalize to [0, 1] for confidence logic.
    top_hits_final = _normalize_rank_scores(top_hits_final)
    
    # Map final results to SearchResult objects
    sources: List[SearchResult] = [
        SearchResult(
            chunk_id=cid,
            chunk_index=chunk_map[cid].chunk_index,
            text=chunk_map[cid].text,
            page_start=chunk_map[cid].page_start,
            page_end=chunk_map[cid].page_end,
            section_path=chunk_map[cid].section_path,
            score=round(score, 4),
        )
        for cid, score in top_hits_final
        if cid in chunk_map
    ]

    # Build prompt and call LLM
    context_texts = _truncate_context([s.text for s in sources])
    
    # Calculate confidence based on top source scores
    top_scores = [s.score for s in sources[:3]] if sources else [0.0]
    confidence = sum(top_scores) / len(top_scores) if top_scores else 0.0
    
    # Determine if evidence is insufficient (conservative threshold)
    insufficient_evidence = confidence < evidence_threshold or len(sources) == 0
    
    # If evidence is weak, return safe message instead of potentially hallucinated answer
    if insufficient_evidence:
        answer = (
            "I don't have enough relevant information in the current book to answer this question. "
            "Try rephrasing your question or selecting a different section from the book."
        )
    else:
        system, user_prompt = build_qa_prompt(body.question, context_texts)
        try:
            answer = complete(user_prompt, system, settings)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    
    # Build citation list from sources
    citations = [
        Citation(
            book_id=book.id,
            chunk_id=s.chunk_id,
            page=s.page_start,
            section_path=s.section_path,
            quote=s.text[:200],  # First 200 chars as quote
            score=s.score,
        )
        for s in sources[:5]  # Top 5 citations
    ]

    _log_interaction(
        db, user["id"], book_id, "qa", answer,
        settings.LLM_PROVIDER,
        query=body.question,
        chunks_used=len(sources),
        citation_payload=[
            {
                "book_id": c.book_id,
                "chunk_id": c.chunk_id,
                "page": c.page,
                "quote": c.quote,
                "score": c.score,
            }
            for c in citations
        ],
    )
    return QAResponse(
        question=body.question,
        answer=answer,
        citations=citations,
        confidence=round(confidence, 3),
        insufficient_evidence=insufficient_evidence,
        sources=sources,  # Keep for backwards compatibility
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
