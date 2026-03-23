# backend/app/routers/books.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Book

router = APIRouter(prefix="/api/books", tags=["books"])

@router.get("/")
async def list_books(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    books = db.query(Book).filter(Book.user_id == user["id"]).all()
    return [{
        "id": str(b.id),
        "title": b.title,
        "author": b.author,
        "file_type": b.file_type,
        "cover_path": b.cover_path,
        "current_page": b.current_page,
        "created_at": b.created_at
    } for b in books]

@router.get("/{book_id}")
async def get_book(book_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user["id"]).first()
    if not book:
        raise HTTPException(404, "书本不存在")
    return {
        "id": str(book.id),
        "title": book.title,
        "file_path": f"/api/files/{book.id}",  # 受保护的文件访问
        "file_type": book.file_type,
        "total_pages": book.total_pages,
        "current_page": book.current_page
    }

@router.put("/{book_id}/progress")
async def update_progress(
    book_id: str,
    page: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user["id"]).first()
    if not book:
        raise HTTPException(404, "书本不存在")
    book.current_page = page
    db.commit()
    return {"current_page": page}