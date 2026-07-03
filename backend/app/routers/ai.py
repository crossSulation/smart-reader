"""
AI endpoints:
  POST /api/books/{book_id}/qa       – RAG question answering
  GET  /api/books/{book_id}/summary  – LLM-generated book summary
"""
import json
import logging
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import AIInteraction, AICitation, DocumentChunk, User, Note
from app.routers.auth import get_current_user
from app.schemas import (
    QARequest,
    QAResponse,
    SearchResult,
    Citation,
    SummaryResponse,
    SummaryCornellSchema,
    SummaryBulletPointsSchema,
    SummarySQ3RSchema,
    AgentRequest,
    AgentResponse,
    AgentToolResult,
    AgentToolName,
)
from app.services.embedding_service import embed_single, search_chunks
from app.services.file_service import FileService
from app.services.llm_service import (
    build_qa_prompt,
    build_summary_prompt,
    complete,
    complete_and_log,
)
from app.services.retrieval_service import retrieve_hybrid, clear_retriever
from app.services.reranker_service import rerank_candidates
from app.services.web_reference_service import fetch_web_references
from app.services.langchain_agent_service import run_langchain_book_agent, stream_langchain_book_agent
from app.services.credit_gate import check_credit_gate, get_credit_response_headers

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


def _join_tags(tags: list[str]) -> str | None:
    cleaned = [tag.strip() for tag in tags if tag.strip()]
    return ",".join(cleaned) if cleaned else None


def _resolve_agent_tool(message: str) -> AgentToolName:
    text = (message or "").lower()
    if any(token in text for token in ["quiz", "question me", "test me"]):
        return "quiz"
    if any(token in text for token in ["web", "reference", "wikipedia", "lookup"]):
        return "web_search"
    if any(token in text for token in ["show notes", "list notes", "my notes", "view notes", "open notes"]):
        return "list_notes"
    if any(token in text for token in ["save", "note", "write down", "remember"]):
        return "write"
    if any(token in text for token in ["read", "excerpt", "passage", "show me"]):
        return "read"
    return "search"


def _run_search_tool(book_id: int, query: str, top_k: int, db: Session) -> list[SearchResult]:
    settings = get_settings()
    rows = _require_chunks(book_id, db)
    query_vec = embed_single(query, settings.EMBEDDING_MODEL)

    chunk_data = [(c.id, c.text, c.embedding) for c in rows]
    top_hits = retrieve_hybrid(
        book_id=book_id,
        query=query,
        query_vector=query_vec,
        top_k=max(1, min(top_k, 20)) * 2,
        chunks=chunk_data,
    )

    chunk_map = {c.id: c for c in rows}
    candidates_for_rerank = [
        (cid, chunk_map[cid].text, score)
        for cid, score in top_hits
        if cid in chunk_map
    ]

    try:
        reranked = rerank_candidates(
            query=query,
            candidates=candidates_for_rerank,
            top_k=max(1, min(top_k, 20)),
        )
        top_hits_final = reranked
    except Exception:
        top_hits_final = [(cid, score) for cid, _, score in candidates_for_rerank[:top_k]]

    normalized_hits = _normalize_rank_scores(top_hits_final)
    return [
        SearchResult(
            chunk_id=cid,
            chunk_index=chunk_map[cid].chunk_index,
            text=chunk_map[cid].text,
            page_start=chunk_map[cid].page_start,
            page_end=chunk_map[cid].page_end,
            section_path=chunk_map[cid].section_path,
            score=round(score, 4),
        )
        for cid, score in normalized_hits
        if cid in chunk_map
    ]


def _extract_json_payload(raw_output: str) -> dict:
    text = (raw_output or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]

    return json.loads(text)


def _validate_summary_json(template: str, payload: dict) -> dict:
    if template == "cornell":
        return SummaryCornellSchema.model_validate(payload).model_dump()
    if template == "sq3r":
        return SummarySQ3RSchema.model_validate(payload).model_dump()
    return SummaryBulletPointsSchema.model_validate(payload).model_dump()


# ---------------------------------------------------------------------------
# Q&A endpoint
# ---------------------------------------------------------------------------

@router.post("/{book_id}/qa", response_model=QAResponse)
def ask_book(
    book_id: int,
    body: QARequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    credit_status: dict = Depends(check_credit_gate),
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
    db_user = db.query(User).filter(User.id == user["id"]).first()
    explanation_level = (db_user.explanation_level if db_user else "intermediate")
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
        system, user_prompt = build_qa_prompt(
            body.question,
            context_texts,
            explanation_level=explanation_level,
        )
        try:
            answer = complete_and_log(user_prompt, system, settings, db, user["id"], "qa")
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
    template: str = Query("bullet_points", description="Summary template: cornell | bullet_points | sq3r"),
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

    normalized_template = (template or "bullet_points").lower().strip()
    allowed_templates = {"cornell", "bullet_points", "sq3r"}
    if normalized_template not in allowed_templates:
        raise HTTPException(
            status_code=422,
            detail="Invalid template. Use one of: cornell, bullet_points, sq3r",
        )

    context_texts = _truncate_context([r.text for r in rows])
    system, user_prompt = build_summary_prompt(
        context_texts,
        book.title,
        template=normalized_template,
    )
    try:
        summary_raw = complete_and_log(user_prompt, system, settings, db, user["id"], "summary")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        summary_payload = _extract_json_payload(summary_raw)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="LLM returned invalid JSON for summary schema.",
        ) from exc

    if not isinstance(summary_payload, dict):
        raise HTTPException(
            status_code=502,
            detail="LLM returned JSON that is not an object for summary schema.",
        )

    try:
        summary_json = _validate_summary_json(normalized_template, summary_payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM returned invalid summary schema: {exc.errors()}",
        ) from exc

    _log_interaction(
        db, user["id"], book_id, "summary", summary_raw,
        settings.LLM_PROVIDER, chunks_used=len(context_texts),
    )
    return SummaryResponse(
        book_id=book_id,
        title=book.title,
        template=normalized_template,
        summary_json=summary_json,
        raw_output=summary_raw,
        provider=settings.LLM_PROVIDER,
        chunks_used=len(context_texts),
    )


@router.post("/{book_id}/agent", response_model=AgentResponse)
def run_book_agent(
    book_id: int,
    payload: AgentRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """LangChain tool-calling agent endpoint for read/write/search/web_search/quiz."""
    settings = get_settings()
    _get_book_or_404(book_id, user["id"], db)

    tool: AgentToolName = payload.tool or _resolve_agent_tool(payload.message)

    try:
        agent_result = run_langchain_book_agent(
            book_id=book_id,
            user_id=user["id"],
            payload=payload,
            db=db,
        )

        result = AgentToolResult(
            tool=tool,
            data={
                "output": agent_result.get("output", ""),
                "trace": agent_result.get("trace", []),
                "allowed_tools": agent_result.get("allowed_tools", []),
            },
        )

        return AgentResponse(
            book_id=book_id,
            tool=tool,
            message="LangChain agent completed.",
            session_id=agent_result.get("session_id", payload.session_id),
            result=result,
            provider=settings.LLM_PROVIDER,
        )

    except HTTPException:
        raise
    except Exception as exc:
        return AgentResponse(
            book_id=book_id,
            tool=tool,
            message="Agent tool execution failed.",
            session_id=payload.session_id,
            result=AgentToolResult(tool=tool, status="error", error=str(exc), data={}),
            provider=settings.LLM_PROVIDER,
        )


@router.post("/{book_id}/agent/stream")
async def run_book_agent_stream(
    book_id: int,
    payload: AgentRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SSE stream for real-time LangChain tool execution events and final output."""
    settings = get_settings()
    _get_book_or_404(book_id, user["id"], db)

    tool: AgentToolName = payload.tool or _resolve_agent_tool(payload.message)

    async def event_generator():
        try:
            async for event in stream_langchain_book_agent(
                book_id=book_id,
                user_id=user["id"],
                payload=payload,
                db=db,
            ):
                if event.get("type") == "final":
                    event["tool"] = tool
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:
            error_event = {
                "type": "error",
                "tool": tool,
                "provider": settings.LLM_PROVIDER,
                "message": str(exc),
            }
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
