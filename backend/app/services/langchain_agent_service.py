import json
from typing import Any, AsyncIterator

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AIInteraction, DocumentChunk, Note
from app.schemas import AgentRequest, SearchResult
from app.services.embedding_service import embed_single
from app.services.llm_service import complete
from app.services.retrieval_service import retrieve_hybrid
from app.services.reranker_service import rerank_candidates
from app.services.web_reference_service import fetch_web_references

AGENT_ALL_TOOLS = ("read", "write", "search", "web_search", "quiz", "list_notes")


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

    return messages


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

    @tool("read")
    def read_tool(query: str = "") -> str:
        """Read relevant book excerpts. Input: query text to focus reading."""
        excerpts = _run_read_tool(book_id, query, payload.top_k, db)
        return json.dumps({"excerpts": excerpts, "count": len(excerpts)}, ensure_ascii=False)

    @tool("search")
    def search_tool(query: str) -> str:
        """Semantic search within the book. Input: query text."""
        hits = _run_search_tool(book_id, query, payload.top_k, db)
        return json.dumps(
            {"results": [item.model_dump() for item in hits], "count": len(hits)},
            ensure_ascii=False,
        )

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
        refs = fetch_web_references(clean_term, limit=max(1, min(payload.top_k, 10)))
        return json.dumps(
            {
                "term": clean_term,
                "references": [item.model_dump() for item in refs],
                "count": len(refs),
            },
            ensure_ascii=False,
        )

    @tool("quiz")
    def quiz_tool(topic: str = "") -> str:
        """Generate quiz questions from book content. Input: topic or prompt."""
        quiz_payload = _run_quiz_tool(book_id, topic or payload.message, payload.quiz_count, db)
        return json.dumps(quiz_payload, ensure_ascii=False)

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
            "You are Smart Reader's LangChain agent. Use tools when needed. "
            "Respect allowed tools only. "
            "For factual answers grounded in the book, prefer read/search first. "
            "When the user asks to save memory/notes, use write. "
            "When the user asks to show/list existing notes, use list_notes. "
            "When user asks external references, use web_search. "
            "When user asks practice questions, use quiz."
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


def _run_read_tool(book_id: int, query: str, top_k: int, db: Session) -> list[dict[str, Any]]:
    if query.strip():
        hits = _run_search_tool(book_id, query, top_k, db)
        return [
            {
                "chunk_id": item.chunk_id,
                "page_start": item.page_start,
                "section_path": item.section_path,
                "text": item.text,
                "score": item.score,
            }
            for item in hits
        ]

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
            "score": 0.0,
        }
        for row in rows
    ]


def _run_quiz_tool(book_id: int, prompt: str, quiz_count: int, db: Session) -> dict[str, Any]:
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
    raw = complete(quiz_user, quiz_system, settings)

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

    yield {
        "type": "final",
        "output": final_output,
        "trace": trace,
        "session_id": session_id,
        "allowed_tools": allowed_tools,
        "provider": provider_label,
    }
