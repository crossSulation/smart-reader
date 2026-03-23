# backend/app/routers/files.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os

router = APIRouter(prefix="/api/files", tags=["files"])

@router.get("/{book_id}")
async def get_file(book_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user["id"]).first()
    if not book or not os.path.exists(book.file_path):
        raise HTTPException(404, "文件不存在")
    return FileResponse(book.file_path, media_type="application/pdf")