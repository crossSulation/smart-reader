"""
Ingestion endpoints:
  POST /api/books/{book_id}/index   – extract full text and store as chunks
  GET  /api/books/{book_id}/chunks  – list stored chunks (paginated)
  GET  /api/books/{book_id}/search  – semantic similarity search within a book
  POST /api/books/{book_id}/qa      – RAG Q&A using indexed chunks
  GET  /api/books/{book_id}/summary – LLM summary over indexed chunks
    POST /api/books/{book_id}/web-reference – fetch web references for unfamiliar terms
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AIInteraction, DocumentChunk
from app.schemas import (
    DocumentChunk as DocumentChunkSchema,
    IndexStatus,
    QARequest,
    QAResponse,
    SearchResult,
    SummaryResponse,
    WebReferenceRequest,
    WebReferenceResponse,
)
from app.routers.auth import get_current_user
from app.services.file_service import FileService
from app.config import get_settings
from app.services.llm_service import build_qa_prompt, build_summary_prompt, complete
from app.services.web_reference_service import fetch_web_references

router = APIRouter(prefix="/books", tags=["ingestion"])
_MAX_CONTEXT_CHARS = 6000


def _get_book_or_404(book_id: int, user_id: int, db: Session):
    book = FileService(db).get_book(book_id, user_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _truncate_context(chunks: list[str], max_chars: int = _MAX_CONTEXT_CHARS) -> list[str]:
    result: list[str] = []
    total = 0
    for chunk in chunks:
        if total + len(chunk) > max_chars:
            break
        result.append(chunk)
        total += len(chunk)
    return result or chunks[:1]


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
    db.add(
        AIInteraction(
            user_id=user_id,
            book_id=book_id,
            interaction_type=interaction_type,
            query=query,
            response=response,
            provider=provider,
            chunks_used=chunks_used,
        )
    )
    db.commit()


@router.post("/{book_id}/index", response_model=IndexStatus)
def index_book(
    book_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger full-text ingestion for a book.
    Downloads the file, extracts text, splits into chunks and stores them.
    Can be called multiple times — re-indexing is idempotent.
    """
    file_service = FileService(db)
    book = file_service.get_book(book_id, user["id"])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Resolve the file URL and type via the existing enrichment helper
    file_info = file_service.get_file_by_original_name(book.title, user["id"])
    if not file_info or not file_info.file_url:
        raise HTTPException(
            status_code=422,
            detail="No uploaded file associated with this book. Upload the file first.",
        )

    try:
        from app.services.ingestion_service import ingest_book
        chunks_stored = ingest_book(
            book_id=book_id,
            file_url=file_info.file_url,
            file_type=file_info.file_type,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return IndexStatus(
        book_id=book_id,
        chunks_stored=chunks_stored,
        status="completed",
    )


@router.get("/{book_id}/chunks", response_model=List[DocumentChunkSchema])
def list_book_chunks(
    book_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return stored text chunks for a book (paginated).
    Useful for debugging ingestion and as a building block for search.
    """
    file_service = FileService(db)
    book = file_service.get_book(book_id, user["id"])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.book_id == book_id)
        .order_by(DocumentChunk.chunk_index)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return chunks


@router.get("/{book_id}/search", response_model=List[SearchResult])
def search_book(
    book_id: int,
    q: str = Query(..., min_length=1, description="Search query"),
    top_k: int = Query(5, ge=1, le=20),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Semantic similarity search within a book's indexed chunks.
    Returns top-k most relevant chunks with similarity scores.
    Requires the book to have been indexed first via POST /index.
    """
    from app.services.embedding_service import embed_single, search_chunks

    file_service = FileService(db)
    book = file_service.get_book(book_id, user["id"])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Fetch all embedded chunks for this book
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

    settings = get_settings()
    try:
        query_vector = embed_single(q, settings.EMBEDDING_MODEL)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Embedding service error: {exc}") from exc

    candidates = [(c.id, c.embedding) for c in rows]
    top = search_chunks(query_vector, candidates, top_k=top_k)
    top_ids = {chunk_id: score for chunk_id, score in top}

    # Fetch full chunk objects for the top results
    result_chunks = {c.id: c for c in rows if c.id in top_ids}

    results = [
        SearchResult(
            chunk_id=cid,
            chunk_index=result_chunks[cid].chunk_index,
            text=result_chunks[cid].text,
            page_start=result_chunks[cid].page_start,
            page_end=result_chunks[cid].page_end,
            score=round(score, 4),
        )
        for cid, score in top
        if cid in result_chunks
    ]
    return results


@router.post("/{book_id}/qa", response_model=QAResponse)
def ask_book(
    book_id: int,
    body: QARequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    RAG-style Q&A using semantic retrieval from indexed chunks.
    """
    from app.services.embedding_service import embed_single, search_chunks

    settings = get_settings()
    _get_book_or_404(book_id, user["id"], db)

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

    try:
        query_vector = embed_single(body.question, settings.EMBEDDING_MODEL)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Embedding service error: {exc}") from exc

    top_k = min(body.top_k, 10)
    candidates = [(c.id, c.embedding) for c in rows]
    top = search_chunks(query_vector, candidates, top_k=top_k)
    row_map = {c.id: c for c in rows}

    sources = [
        SearchResult(
            chunk_id=chunk_id,
            chunk_index=row_map[chunk_id].chunk_index,
            text=row_map[chunk_id].text,
            page_start=row_map[chunk_id].page_start,
            page_end=row_map[chunk_id].page_end,
            score=round(score, 4),
        )
        for chunk_id, score in top
        if chunk_id in row_map
    ]

    context_texts = _truncate_context([s.text for s in sources])
    system_prompt, user_prompt = build_qa_prompt(body.question, context_texts)
    try:
        answer = complete(user_prompt, system_prompt, settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    _log_interaction(
        db=db,
        user_id=user["id"],
        book_id=book_id,
        interaction_type="qa",
        query=body.question,
        response=answer,
        provider=settings.LLM_PROVIDER,
        chunks_used=len(sources),
    )

    return QAResponse(
        question=body.question,
        answer=answer,
        sources=sources,
        provider=settings.LLM_PROVIDER,
    )


@router.get("/{book_id}/summary", response_model=SummaryResponse)
def get_book_summary(
    book_id: int,
    max_chunks: int = Query(20, ge=1, le=100, description="Number of chunks to summarise"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate an LLM summary from the first N indexed chunks.
    """
    settings = get_settings()
    book = _get_book_or_404(book_id, user["id"], db)

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

    context_texts = _truncate_context([row.text for row in rows])
    system_prompt, user_prompt = build_summary_prompt(context_texts, book.title)
    try:
        summary = complete(user_prompt, system_prompt, settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    _log_interaction(
        db=db,
        user_id=user["id"],
        book_id=book_id,
        interaction_type="summary",
        response=summary,
        provider=settings.LLM_PROVIDER,
        chunks_used=len(context_texts),
    )

    return SummaryResponse(
        book_id=book_id,
        title=book.title,
        summary=summary,
        provider=settings.LLM_PROVIDER,
        chunks_used=len(context_texts),
    )


@router.post("/{book_id}/web-reference", response_model=WebReferenceResponse)
def get_web_reference(
    book_id: int,
    body: WebReferenceRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch concise reference knowledge from the web for unfamiliar concepts.
    Book ownership is validated to keep access scoped to the reader session.
    """
    _get_book_or_404(book_id, user["id"], db)

    references = fetch_web_references(body.term, body.limit)
    return WebReferenceResponse(term=body.term, references=references)
