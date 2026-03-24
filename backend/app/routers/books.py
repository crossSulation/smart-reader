from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.schemas import Book, BookCreate
from app.services.file_service import FileService
from app.routers.auth import get_current_user

router = APIRouter(prefix="/books", tags=["books"])


class UpdateProgressRequest(BaseModel):
    current_page: int
    total_pages: int = None


class AddNotesRequest(BaseModel):
    notes: str


@router.get("/", response_model=List[Book])
async def list_books(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 实现书籍列表功能
    file_service = FileService(db)
    books = file_service.get_user_books(user['id'])
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
    return book


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


@router.delete("/{book_id}")
async def delete_book(book_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # 实现删除书籍功能
    file_service = FileService(db)
    success = file_service.delete_book(book_id, user['id'])
    if not success:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"message": "Book deleted successfully"}