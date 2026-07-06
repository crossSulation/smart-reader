from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, model_validator
import logging

from app.database import get_db
from app.models import DocumentChunk, KnowledgePoint
from app.schemas import Book, BookCreate
from app.services.file_service import FileService
from app.config import get_settings
from app.routers.auth import get_current_user

router = APIRouter(prefix="/books", tags=["books"])
logger = logging.getLogger(__name__)


class UpdateProgressRequest(BaseModel):
    current_page: int | None = None
    page: int | None = None
    total_pages: int | None = None

    @model_validator(mode="after")
    def normalize_page_field(self):
        if self.current_page is None and self.page is None:
            raise ValueError("Either current_page or page must be provided")
        if self.current_page is None:
            self.current_page = self.page
        return self


class AddNotesRequest(BaseModel):
    notes: str


class BookSearchResult(BaseModel):
    book_id: int
    title: str
    author: Optional[str] = None
    file_type: Optional[str] = None
    score: float
    snippet: str
    chunk_page: Optional[int] = None


def _normalize_file_type(file_type: str | None) -> str | None:
    if not file_type:
        return None
    lowered = file_type.lower()
    if "markdown" in lowered or lowered in {"text/markdown", "text/x-markdown"}:
        return "markdown"
    if "epub" in lowered:
        return "epub"
    if "pdf" in lowered:
        return "pdf"
    return lowered


def _attach_file_fields(file_service: FileService, user_id: int, book: Book):
    file_info = file_service.get_file_by_original_name(book.title, user_id)
    if file_info:
        setattr(book, "file_url", file_info.file_url)
        setattr(book, "file_type", _normalize_file_type(file_info.file_type))
    return book


@router.get("/", response_model=List[Book])
async def list_books(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 实现书籍列表功能
    file_service = FileService(db)
    books = file_service.get_user_books(user['id'])
    logger.info("list_books called | user_id=%s | count=%s", user["id"], len(books))

    for book in books:
        _attach_file_fields(file_service, user['id'], book)

    # Attach indexed status and knowledge count per book
    if books:
        book_ids = [b.id for b in books]
        indexed_book_ids = set(
            row[0] for row in db.query(DocumentChunk.book_id)
            .filter(DocumentChunk.book_id.in_(book_ids), DocumentChunk.indexed_at.isnot(None))
            .distinct()
            .all()
        )

        # Build chunk_id -> book_id map for all chunks of these books
        chunk_rows = (
            db.query(DocumentChunk.id, DocumentChunk.book_id)
            .filter(DocumentChunk.book_id.in_(book_ids))
            .all()
        )
        chunk_to_book = {row[0]: row[1] for row in chunk_rows}

        # Count knowledge points per book by matching source_chunk_ids
        import json
        kp_count: dict[int, int] = {}
        kp_rows = (
            db.query(KnowledgePoint.source_chunk_ids)
            .filter(KnowledgePoint.user_id == user["id"])
            .all()
        )
        for (src,) in kp_rows:
            try:
                ids = json.loads(src or "[]")
            except (json.JSONDecodeError, TypeError):
                continue
            matched_books = set()
            for cid in ids:
                bid = chunk_to_book.get(cid)
                if bid and bid not in matched_books:
                    kp_count[bid] = kp_count.get(bid, 0) + 1
                    matched_books.add(bid)

        for book in books:
            setattr(book, "indexed", book.id in indexed_book_ids)
            setattr(book, "knowledge_count", kp_count.get(book.id, 0))

    return books


@router.post("/", response_model=Book)
async def create_book(book: BookCreate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 实现创建书籍功能
    file_service = FileService(db)
    new_book = file_service.create_book(user['id'], book)
    return new_book


@router.get("/{book_id}", response_model=Book)
async def get_book(book_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 实现获取特定书籍功能
    file_service = FileService(db)
    book = file_service.get_book(book_id, user['id'])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return _attach_file_fields(file_service, user['id'], book)


@router.put("/{book_id}/progress")
async def update_book_progress(book_id: int, progress_data: UpdateProgressRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """更新书籍阅读进度"""
    file_service = FileService(db)
    book = file_service.update_book_progress(
        book_id=book_id,
        user_id=user['id'],
        current_page=progress_data.current_page,
        total_pages=progress_data.total_pages
    )
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.get("/{book_id}/progress", response_model=Book)
async def get_book_progress(book_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取书籍阅读进度"""
    file_service = FileService(db)
    book = file_service.get_book(book_id, user['id'])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.put("/{book_id}/notes")
async def add_book_notes(book_id: int, notes_data: AddNotesRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """为书籍添加笔记"""
    file_service = FileService(db)
    book = file_service.add_book_notes(book_id, user['id'], notes_data.notes)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.get("/stats")
async def get_reading_stats(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取用户的阅读统计数据"""
    file_service = FileService(db)
    stats = file_service.get_user_reading_stats(user['id'])
    return stats


@router.get("/search", response_model=List[BookSearchResult])
def search_books(
    q: str = Query(..., min_length=1),
    top_k: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Semantic search across all user books. Returns matched books with snippets."""
    from app.services.embedding_service import embed_single, search_chunks

    file_service = FileService(db)
    books = file_service.get_user_books(user["id"])

    if not books:
        return []

    book_ids = [b.id for b in books]
    settings_obj = get_settings()

    rows = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.book_id.in_(book_ids),
            DocumentChunk.embedding.isnot(None),
        )
        .all()
    )

    if not rows:
        q_lower = q.lower()
        results = []
        for b in books:
            title_match = q_lower in (b.title or "").lower()
            author_match = q_lower in (b.author or "").lower()
            if title_match or author_match:
                results.append(BookSearchResult(
                    book_id=b.id,
                    title=b.title,
                    author=b.author,
                    file_type=b.file_type,
                    score=1.0 if title_match else 0.5,
                    snippet=b.title or "",
                ))
        results.sort(key=lambda x: x.score, reverse=True)
        return results[:top_k]

    try:
        query_vector = embed_single(q, settings_obj.EMBEDDING_MODEL)
    except Exception:
        return []

    candidates = [(c.id, c.embedding) for c in rows]
    top = search_chunks(query_vector, candidates, top_k=max(top_k * 3, 20))
    top_ids = {chunk_id: score for chunk_id, score in top}

    chunk_map = {c.id: c for c in rows}
    book_hits = {}
    for cid, score in top:
        if cid not in chunk_map:
            continue
        chunk = chunk_map[cid]
        bid = chunk.book_id
        if bid not in book_hits or score > book_hits[bid][0]:
            snippet = (chunk.text or "")[:200]
            book_hits[bid] = (score, snippet, chunk.page_start)

    results = []
    for b in books:
        if b.id in book_hits:
            score, snippet, page = book_hits[b.id]
            results.append(BookSearchResult(
                book_id=b.id,
                title=b.title,
                author=b.author,
                file_type=b.file_type,
                score=round(score, 4),
                snippet=snippet,
                chunk_page=page,
            ))

    results.sort(key=lambda x: x.score, reverse=True)
    return results[:top_k]


@router.delete("/{book_id}")
async def delete_book(book_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 实现删除书籍功能
    file_service = FileService(db)
    success = file_service.delete_book(book_id, user['id'])
    if not success:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"message": "Book deleted successfully"}


@router.get("/{book_id}/status")
def get_book_status(book_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return indexing and knowledge extraction status for a book."""
    book = FileService(db).get_book(book_id, user["id"])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    indexed_count = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.book_id == book_id, DocumentChunk.indexed_at.isnot(None))
        .count()
    )
    chunks_count = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.book_id == book_id)
        .count()
    )
    kp_count = (
        db.query(KnowledgePoint)
        .filter(KnowledgePoint.user_id == user["id"])
        .filter(KnowledgePoint.source_chunk_ids.like(f'%{book_id}%'))
        .count()
    )

    return {
        "book_id": book_id,
        "indexed": indexed_count > 0,
        "chunks_count": chunks_count,
        "knowledge_points_count": kp_count,
    }


@router.post("/{book_id}/extract-knowledge")
def extract_book_knowledge(book_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Manually trigger knowledge point extraction for a book."""
    book = FileService(db).get_book(book_id, user["id"])
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    chunks = (
        db.query(DocumentChunk.id)
        .filter(DocumentChunk.book_id == book_id)
        .count()
    )
    if chunks == 0:
        raise HTTPException(status_code=400, detail="Book has not been indexed yet")

    from app.services.knowledge_extraction_service import extract_knowledge_points_for_book
    from app.services.knowledge_graph_service import infer_relationships

    count = extract_knowledge_points_for_book(book_id, user["id"], db)
    db.commit()

    links = 0
    if count > 0:
        links = infer_relationships(user["id"], db)

    logger.info("Manual knowledge extraction | book_id=%s user=%s kp=%d links=%d", book_id, user["id"], count, links)
    return {"book_id": book_id, "knowledge_points_extracted": count, "relationships_created": links}