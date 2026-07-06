import json
from typing import Any, AsyncIterator

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AIInteraction, DocumentChunk, Note
from app.schemas import AgentRequest, SearchResult
from app.services.embedding_service import embed_single
from app.services.llm_service import complete_and_log
from app.services.retrieval_service import retrieve_hybrid
from app.services.reranker_service import rerank_candidates
from app.services.web_reference_service import fetch_web_references

AGENT_ALL_TOOLS = ("read", "write", "search", "web_search", "quiz", "flashcards", "list_notes")


def _normalize_rank_scores(hits: list[tuple[int, float]]) -> list[tuple[int, float]]:
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


def _resolve_allowed_tools(payload: AgentRequest) -> list[str]:
    raw = payload.allowed_tools or list(AGENT_ALL_TOOLS)
    deduped: list[str] = []
    for item in raw:
        if item in AGENT_ALL_TOOLS and item not in deduped:
            deduped.append(item)

    if not deduped:
        deduped = ["read", "search"]

    if payload.tool and payload.tool not in deduped:
        raise ValueError(f"requested tool '{payload.tool}' is not allowed for this call")

    return deduped


def _parse_agent_query(raw_query: str | None) -> tuple[str | None, str]:
    text = (raw_query or "").strip()
    if not text:
        return None, ""

    try:
        payload = json.loads(text)
    except Exception:
        return None, text

    if isinstance(payload, dict):
        session_id = payload.get("session_id")
        message = str(payload.get("message") or "").strip()
        return session_id, message

    return None, text


MAX_HISTORY_TOKENS = 6000  # leave room for current turn's tool calls and response


def _estimate_tokens(text: str) -> int:
    """Rough token count: ~4 chars per token for English text."""
    return max(1, len(text or "") // 4)


def _trim_history(messages: list[Any], max_tokens: int) -> list[Any]:
    """Keep the most recent messages within the token budget."""
    total = 0
    kept = []
    for msg in reversed(messages):
        estimated = _estimate_tokens(getattr(msg, "content", "") or "")
        if total + estimated > max_tokens and kept:
            break
        total += estimated
        kept.append(msg)
    kept.reverse()
    return kept


def _load_chat_history(book_id: int, user_id: int, session_id: str, db: Session) -> list[Any]:
    try:
        from langchain_core.messages import AIMessage, HumanMessage
    except Exception:
        return []

    rows = (
        db.query(AIInteraction)
        .filter(
            AIInteraction.user_id == user_id,
            AIInteraction.book_id == book_id,
            AIInteraction.interaction_type == "agent",
        )
        .order_by(AIInteraction.id.desc())
        .limit(30)
        .all()
    )

    messages: list[Any] = []
    for row in reversed(rows):
        row_session_id, row_message = _parse_agent_query(row.query)
        if row_session_id != session_id:
            continue
        if row_message:
            messages.append(HumanMessage(content=row_message))
        if row.response:
            messages.append(AIMessage(content=row.response))

    return _trim_history(messages, MAX_HISTORY_TOKENS)


def _store_agent_turn(
    book_id: int,
    user_id: int,
    session_id: str,
    message: str,
    output: str,
    provider: str,
    db: Session,
) -> None:
    record = AIInteraction(
        user_id=user_id,
        book_id=book_id,
        interaction_type="agent",
        query=json.dumps({"session_id": session_id, "message": message}, ensure_ascii=False),
        response=output,
        provider=provider,
        chunks_used=0,
    )
    db.add(record)
    db.commit()


def _build_agent_executor(
    book_id: int,
    user_id: int,
    payload: AgentRequest,
    db: Session,
) -> tuple[Any, list[Any], str, list[str]]:
    from langchain.agents import AgentExecutor, create_tool_calling_agent
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
    from langchain_core.tools import tool
    from langchain_openai import ChatOpenAI
    from langchain_community.chat_models import ChatOllama

    settings = get_settings()
    provider_label = f"{settings.LLM_PROVIDER}:{settings.LLM_MODEL}"
    allowed_tools = _resolve_allowed_tools(payload)
    session_id = (payload.session_id or "").strip() or f"book-{book_id}-user-{user_id}"

    if settings.LLM_PROVIDER.lower() == "openai":
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            api_key=settings.LLM_API_KEY or None,
            base_url=settings.LLM_BASE_URL or None,
            timeout=60,
        )
    elif settings.LLM_PROVIDER.lower() == "ollama":
        llm = ChatOllama(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL,
            temperature=settings.LLM_TEMPERATURE,
        )
    else:
        raise RuntimeError("LangChain agent currently supports LLM_PROVIDER=openai or ollama.")

    _cache: dict[str, str] = {}  # request-level cache to avoid duplicate tool calls

    @tool("read")
    def read_tool(query: str = "") -> str:
        """Read book content at a specific location. Input: a page number ('42' or 'page 42'), a section name ('Chapter 3'), or leave empty to read the beginning of the book. Use this when you need to read a known section — do NOT use for semantic search; use the search tool for keyword/concept queries instead."""
        cache_key = f"read:{query or ''}"
        if cache_key in _cache:
            return _cache[cache_key]
        excerpts = _run_read_tool(book_id, query, payload.top_k, payload.current_page, db)
        result = json.dumps({"excerpts": excerpts, "count": len(excerpts)}, ensure_ascii=False)
        _cache[cache_key] = result
        return result

    @tool("search")
    def search_tool(query: str) -> str:
        """Semantic search within the book. Input: query text."""
        cache_key = f"search:{query}"
        if cache_key in _cache:
            return _cache[cache_key]
        hits = _run_search_tool(book_id, query, payload.top_k, db)
        result = json.dumps(
            {"results": [item.model_dump() for item in hits], "count": len(hits)},
            ensure_ascii=False,
        )
        _cache[cache_key] = result
        return result

    @tool("write")
    def write_tool(content: str) -> str:
        """Write a note for this book. Input: note content text."""
        clean = (content or payload.note_content or "").strip()
        if not clean:
            return json.dumps({"error": "note content is empty"}, ensure_ascii=False)

        note = Note(
            user_id=user_id,
            book_id=book_id,
            content=clean,
            source_text=payload.message.strip() or clean,
            page=payload.page,
            tags=_join_tags(payload.tags),
        )
        db.add(note)
        db.commit()
        db.refresh(note)

        return json.dumps(
            {
                "note": {
                    "id": note.id,
                    "book_id": note.book_id,
                    "content": note.content,
                    "source_text": note.source_text,
                    "page": note.page,
                    "tags": payload.tags,
                    "created_at": note.created_at.isoformat(),
                }
            },
            ensure_ascii=False,
        )

    @tool("web_search")
    def web_search_tool(term: str) -> str:
        """Search concise external references on the web. Input: term or topic."""
        clean_term = (term or payload.term or "").strip()
        cache_key = f"web_search:{clean_term}"
        if cache_key in _cache:
            return _cache[cache_key]
        refs = fetch_web_references(clean_term, limit=max(1, min(payload.top_k, 10)))
        result = json.dumps(
            {
                "term": clean_term,
                "references": [item.model_dump() for item in refs],
                "count": len(refs),
            },
            ensure_ascii=False,
        )
        _cache[cache_key] = result
        return result

    @tool("quiz")
    def quiz_tool(topic: str = "") -> str:
        """Generate quiz questions from book content. Input: topic or prompt."""
        quiz_payload = _run_quiz_tool(book_id, user_id, topic or payload.message, payload.quiz_count, db)
        return json.dumps(quiz_payload, ensure_ascii=False)

    @tool("flashcards")
    def flashcards_tool(topic: str = "") -> str:
        """Generate spaced-repetition flashcards from book content. Input: topic or concept to focus on, or leave empty for general flashcards."""
        fc_payload = _run_flashcards_tool(book_id, user_id, topic or payload.message, payload.quiz_count, db)
        return json.dumps(fc_payload, ensure_ascii=False)

    @tool("list_notes")
    def list_notes_tool(_: str = "") -> str:
        """List recent notes for this book. Input can be empty."""
        rows = (
            db.query(Note)
            .filter(Note.user_id == user_id, Note.book_id == book_id)
            .order_by(Note.id.desc())
            .limit(max(1, min(payload.top_k, 20)))
            .all()
        )
        notes_payload = [
            {
                "id": row.id,
                "content": row.content,
                "page": row.page,
                "tags": [item.strip() for item in (row.tags or "").split(",") if item.strip()],
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
        return json.dumps({"notes": notes_payload, "count": len(notes_payload)}, ensure_ascii=False)

    tool_map = {
        "read": read_tool,
        "search": search_tool,
        "write": write_tool,
        "web_search": web_search_tool,
        "quiz": quiz_tool,
        "flashcards": flashcards_tool,
        "list_notes": list_notes_tool,
    }

    if payload.tool:
        tools = [tool_map[payload.tool]]
    else:
        tools = [tool_map[name] for name in allowed_tools]

    markdown_instruction = ""
    if payload.document_type == "markdown":
        markdown_instruction = (
            " For markdown documents, call read or search before finalizing an answer so the response is grounded in the current document content."
        )

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a precise reading assistant powered by the user's book content.\n\n"
            "Rules:\n"
            "1. Always cite source page numbers when quoting or referencing book content.\n"
            "2. Use the read tool first to understand the user's current page context, then search to find related concepts across the book.\n"
            "3. If the book does NOT contain enough evidence to answer, say so clearly. Never fabricate.\n"
            "4. Structure your response: (1) direct answer, (2) supporting evidence with page citations, (3) follow-up suggestions if relevant.\n"
            "5. Keep answers concise unless the user asks for more detail.\n"
            "6. For external references (definitions, concepts not in the book), use web_search.\n"
            "7. Save notes/memories with write. Show existing notes with list_notes. Generate quizzes with quiz. Create flashcards with flashcards."
            f"{markdown_instruction}",
        ),
        MessagesPlaceholder(variable_name="chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=False,
        handle_parsing_errors=True,
        return_intermediate_steps=True,
        max_iterations=6,
    )

    history = _load_chat_history(book_id, user_id, session_id, db)
    return executor, history, provider_label, allowed_tools


def _run_search_tool(book_id: int, query: str, top_k: int, db: Session) -> list[SearchResult]:
    settings = get_settings()
    rows = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.book_id == book_id, DocumentChunk.embedding.isnot(None))
        .all()
    )

    if not rows:
        return []

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


def _run_read_tool(
    book_id: int,
    query: str,
    top_k: int,
    current_page: int | None,
    db: Session,
) -> list[dict[str, Any]]:
    """Read book content around the user's current page.
    - If current_page is provided, read chunks around that page (±2 pages) first
    - If query specifies a page number or section name, read from that location
    - Falls back to reading the first N chunks if neither is available."""
    import re
    cleaned = (query or "").strip()
    page_match = None
    section_like: str | None = None

    if cleaned:
        m = re.search(r'\bpage\s*(\d+)\b', cleaned, re.IGNORECASE)
        if not m:
            m = re.search(r'\b(\d+)\s*(?:page|p\b)', cleaned, re.IGNORECASE)
        if not m:
            m = re.search(r'^(\d+)$', cleaned)
        if m:
            page_match = int(m.group(1))
        else:
            section_like = cleaned

    rows = []

    if page_match is not None:
        rows = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id, DocumentChunk.page_start == page_match)
            .order_by(DocumentChunk.chunk_index)
            .limit(max(1, min(top_k, 20)))
            .all()
        )
        if not rows:
            rows = (
                db.query(DocumentChunk)
                .filter(DocumentChunk.book_id == book_id)
                .filter(DocumentChunk.page_start >= page_match - 2, DocumentChunk.page_end <= page_match + 2)
                .order_by(DocumentChunk.chunk_index)
                .limit(max(1, min(top_k, 20)))
                .all()
            )
    elif section_like:
        rows = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id, DocumentChunk.section_path.ilike(f"%{section_like}%"))
            .order_by(DocumentChunk.chunk_index)
            .limit(max(1, min(top_k, 20)))
            .all()
        )
    elif current_page is not None:
        rows = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id)
            .filter(
                DocumentChunk.page_start >= current_page - 2,
                DocumentChunk.page_start <= current_page + 2,
            )
            .order_by(DocumentChunk.chunk_index)
            .limit(max(1, min(top_k, 20)))
            .all()
        )

    if not rows:
        rows = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id)
            .order_by(DocumentChunk.chunk_index)
            .limit(max(1, min(top_k, 20)))
            .all()
        )

    return [
        {
            "chunk_id": row.id,
            "page_start": row.page_start,
            "section_path": row.section_path,
            "text": row.text,
            "score": 1.0,
        }
        for row in rows
    ]


def _run_quiz_tool(book_id: int, user_id: int, prompt: str, quiz_count: int, db: Session) -> dict[str, Any]:
    settings = get_settings()
    hits = _run_search_tool(book_id, prompt, max(quiz_count, 3), db)
    context = [item.text for item in hits[:10]]

    if not context:
        return {
            "questions": [
                {
                    "question": "No indexed content found. Please index the book first.",
                    "answer": "Index the book then retry quiz generation.",
                }
            ]
        }

    quiz_system = (
        "You are a quiz generator for reading comprehension. "
        "Return ONLY valid JSON: {\"questions\":[{\"question\":\"...\",\"answer\":\"...\"}]}."
    )
    quiz_user = (
        f"Generate {max(1, min(quiz_count, 10))} short quiz questions from the excerpts. "
        "Each question must have one concise answer.\n\n"
        + "\n\n---\n\n".join(context)
    )
    raw = complete_and_log(quiz_user, quiz_system, settings, db, user_id, "agent")

    try:
        text = raw.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
        return json.loads(text)
    except Exception:
        return {
            "questions": [
                {
                    "question": "What is one key idea from the selected excerpts?",
                    "answer": context[0][:180],
                }
            ]
        }


def _run_flashcards_tool(book_id: int, user_id: int, prompt: str, count: int, db: Session) -> dict[str, Any]:
    settings = get_settings()
    hits = _run_search_tool(book_id, prompt, max(count, 3), db)
    context = [item.text for item in hits[:10]]

    if not context:
        return {
            "flashcards": [
                {"front": "No indexed content found", "back": "Index the book first then retry."}
            ]
        }

    fc_system = (
        "You are a flashcard generator for spaced-repetition learning. "
        "Extract key concepts, definitions, and facts from the provided book excerpts. "
        "Each flashcard must have a clear front (question/term/concept) and back (answer/definition/explanation). "
        "Return ONLY valid JSON: {\"flashcards\":[{\"front\":\"...\",\"back\":\"...\"}]}."
    )
    fc_user = (
        f"Generate {max(1, min(count, 10))} flashcards from the excerpts below. "
        "Front = term, concept, or question. Back = definition, explanation, or answer.\n\n"
        + "\n\n---\n\n".join(context)
    )
    raw = complete_and_log(fc_user, fc_system, settings, db, user_id, "agent")

    try:
        text = raw.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
        data = json.loads(text)
    except Exception:
        data = {
            "flashcards": [
                {"front": "Key concept from excerpts", "back": context[0][:180] if context else "Read the book first."}
            ]
        }

    # Persist flashcards to DB
    from app.models import Flashcard, ReviewItem
    saved_count = 0
    cards = data.get("flashcards", [])
    for card in cards:
        front = (card.get("front") or "").strip()
        back = (card.get("back") or "").strip()
        if not front or not back:
            continue
        fc = Flashcard(
            user_id=user_id,
            book_id=book_id,
            front=front,
            back=back,
            source_text="\n".join(ctx[:200] for ctx in context[:2]),
            tags="ai-generated",
        )
        db.add(fc)
        db.flush()
        # Create ReviewItem for FSRS scheduling
        db.add(ReviewItem(flashcard_id=fc.id))
        saved_count += 1

    if saved_count > 0:
        db.commit()

    return {"flashcards": cards, "count": len(cards), "saved": saved_count}


def run_langchain_book_agent(book_id: int, user_id: int, payload: AgentRequest, db: Session) -> dict[str, Any]:
    """Run a LangChain tool-calling agent over book tools."""
    try:
        executor, history, provider_label, allowed_tools = _build_agent_executor(
            book_id=book_id,
            user_id=user_id,
            payload=payload,
            db=db,
        )
    except Exception as exc:
        raise RuntimeError("LangChain dependencies are missing. Install backend requirements first.") from exc

    session_id = (payload.session_id or "").strip() or f"book-{book_id}-user-{user_id}"
    result = executor.invoke({"input": payload.message, "chat_history": history})

    trace: list[dict[str, Any]] = []
    for action, observation in result.get("intermediate_steps", []):
        trace.append(
            {
                "tool": getattr(action, "tool", "unknown"),
                "tool_input": getattr(action, "tool_input", ""),
                "observation": observation,
            }
        )

    output = result.get("output", "")
    _store_agent_turn(
        book_id=book_id,
        user_id=user_id,
        session_id=session_id,
        message=payload.message,
        output=output,
        provider=provider_label,
        db=db,
    )

    return {
        "output": output,
        "trace": trace,
        "session_id": session_id,
        "allowed_tools": allowed_tools,
        "provider": provider_label,
    }


async def stream_langchain_book_agent(
    book_id: int,
    user_id: int,
    payload: AgentRequest,
    db: Session,
) -> AsyncIterator[dict[str, Any]]:
    """Stream LangChain agent tool steps and final output."""
    try:
        executor, history, provider_label, allowed_tools = _build_agent_executor(
            book_id=book_id,
            user_id=user_id,
            payload=payload,
            db=db,
        )
    except Exception as exc:
        raise RuntimeError("LangChain dependencies are missing. Install backend requirements first.") from exc

    session_id = (payload.session_id or "").strip() or f"book-{book_id}-user-{user_id}"
    trace: list[dict[str, Any]] = []
    token_buffer: list[str] = []
    final_output = ""

    async for event in executor.astream_events(
        {"input": payload.message, "chat_history": history},
        version="v1",
    ):
        event_name = event.get("event", "")
        event_data = event.get("data") or {}
        tool_name = event.get("name") or ""

        if event_name == "on_tool_start":
            tool_input = event_data.get("input")
            yield {
                "type": "tool_start",
                "tool": tool_name,
                "tool_input": tool_input,
                "session_id": session_id,
            }

        elif event_name == "on_tool_end":
            observation = event_data.get("output")
            trace_item = {
                "tool": tool_name,
                "tool_input": "",
                "observation": observation,
            }
            trace.append(trace_item)
            yield {
                "type": "tool_end",
                "tool": tool_name,
                "observation": observation,
                "session_id": session_id,
            }

        elif event_name == "on_chat_model_stream":
            chunk = event_data.get("chunk")
            content = getattr(chunk, "content", "")
            if isinstance(content, str) and content:
                token_buffer.append(content)
                yield {
                    "type": "token",
                    "text": content,
                    "session_id": session_id,
                }

        elif event_name == "on_chain_end":
            output_obj = event_data.get("output")
            if isinstance(output_obj, dict) and isinstance(output_obj.get("output"), str):
                final_output = output_obj["output"]

    if not final_output:
        final_output = "".join(token_buffer).strip()

    _store_agent_turn(
        book_id=book_id,
        user_id=user_id,
        session_id=session_id,
        message=payload.message,
        output=final_output,
        provider=provider_label,
        db=db,
    )

    # Estimate token usage from accumulated output
    try:
        estimated_prompt = len(payload.message) // 4
        estimated_completion = len(final_output) // 4
        from app.services.token_counter import log_token_usage
        log_token_usage(
            db=db,
            user_id=user_id,
            capability="agent",
            provider=provider_label,
            model="",
            prompt_tokens=max(1, estimated_prompt),
            completion_tokens=max(1, estimated_completion),
        )
    except ValueError:
        pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to log streaming agent tokens: %s", e)

    yield {
        "type": "final",
        "output": final_output,
        "trace": trace,
        "session_id": session_id,
        "allowed_tools": allowed_tools,
        "provider": provider_label,
    }
