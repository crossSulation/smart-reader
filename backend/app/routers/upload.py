# backend/app/routers/upload.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any
import os
import uuid
from datetime import datetime
import tempfile
import logging

from app.database import get_db, SessionLocal
from app.models import FileMetadata, Book, DocumentChunk
from app.services.file_service import FileService
from app.services.pdf_service import extract_pdf_info, get_pdf_page_count
from app.routers.auth import get_current_user
from app.services.oss_service import OSSManager

router = APIRouter(prefix="/upload", tags=["upload"])
logger = logging.getLogger(__name__)


def _trigger_background_index(book_id: int, owner_id: int, file_url: str, file_type: str) -> None:
    """Index supported book files in the background after upload."""
    if file_type not in {"pdf", "epub", "markdown"}:
        return

    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id, Book.owner_id == owner_id).first()
        if not book:
            return

        already_indexed = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id, DocumentChunk.indexed_at.isnot(None))
            .count()
        )
        if already_indexed > 0:
            return

        from app.services.ingestion_service import ingest_book

        chunks_stored = ingest_book(
            book_id=book_id,
            file_url=file_url,
            file_type=file_type,
            db=db,
        )
        logger.info(
            "Background indexing completed | book_id=%s owner_id=%s chunks=%s",
            book_id,
            owner_id,
            chunks_stored,
        )
    except Exception as exc:
        logger.warning(
            "Background indexing failed | book_id=%s owner_id=%s reason=%s",
            book_id,
            owner_id,
            exc,
        )
    finally:
        db.close()


def _normalize_upload_file_type(file_name: str, content_type: str | None) -> str:
    ext = os.path.splitext(file_name)[1].lower()
    if ext in {".md", ".markdown"}:
        return "markdown"
    if ext == ".epub":
        return "epub"
    if ext == ".pdf":
        return "pdf"
    return content_type or "application/octet-stream"


def _is_allowed_file(file_name: str, content_type: str | None) -> bool:
    allowed_types = {
        "application/pdf",
        "application/epub+zip",
        "text/markdown",
        "text/x-markdown",
        "application/octet-stream",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/bmp",
        "image/tiff",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    allowed_extensions = {".pdf", ".epub", ".md", ".markdown", ".txt", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".doc", ".docx"}

    ext = os.path.splitext(file_name)[1].lower()
    if content_type in allowed_types and ext in allowed_extensions:
        return True

    # Some clients upload EPUB with generic content type.
    if ext in {".epub", ".md", ".markdown"}:
        return True

    return False

@router.post("/")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # 验证文件类型
        if not _is_allowed_file(file.filename, file.content_type):
            raise HTTPException(status_code=400, detail="File type not allowed")
        
        # 生成唯一文件名
        unique_filename = f"{user['id']}/{uuid.uuid4()}_{file.filename}"
        normalized_file_type = _normalize_upload_file_type(file.filename, file.content_type)
        
        # 创建临时文件
        temp_file_path = None
        try:
            # 创建临时文件来保存上传的数据
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
                temp_file.write(await file.read())
                temp_file_path = temp_file.name
            
            # 如果是PDF文件，提取额外信息
            pages = None
            if normalized_file_type == "pdf":
                try:
                    pages = get_pdf_page_count(temp_file_path)
                except Exception as e:
                    print(f"Error extracting PDF info: {str(e)}")
                    pages = None
            
            # 获取文件大小
            file_size = os.path.getsize(temp_file_path)
            
            # 初始化OSS管理器并上传文件
            oss_manager = OSSManager()
            file_url = oss_manager.upload_file(temp_file_path, unique_filename)
            
            # 创建文件服务实例并保存元数据
            file_service = FileService(db)
            file_metadata = FileMetadata(
                original_name=file.filename,
                stored_name=unique_filename,  # 存储OSS中的对象名称
                file_type=normalized_file_type,
                file_size=file_size,
                upload_date=datetime.utcnow(),
                uploaded_by=user['id'],
                pages=pages,  # 添加页数信息
                file_url=file_url  # 存储文件的访问URL
            )
            
            db.add(file_metadata)
            db.commit()
            db.refresh(file_metadata)

            # Uploads should appear in the library immediately.
            existing_book = db.query(Book).filter(
                Book.owner_id == user['id'],
                Book.title == file.filename
            ).first()
            book_id = None
            if not existing_book:
                book = Book(
                    title=file.filename,
                    owner_id=user['id'],
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    current_page=0,
                    total_pages=pages,
                    progress_percentage=0,
                    last_read_time=datetime.utcnow(),
                )
                db.add(book)
                db.commit()
                db.refresh(book)
                book_id = book.id
            else:
                book_id = existing_book.id
            
            if book_id and normalized_file_type in {"pdf", "epub", "markdown"}:
                background_tasks.add_task(
                    _trigger_background_index,
                    book_id,
                    user["id"],
                    file_url,
                    normalized_file_type,
                )

            return {
                "filename": file.filename,
                "stored_name": unique_filename,
                "file_type": normalized_file_type,
                "file_size": file_size,
                "pages": pages,
                "id": file_metadata.id,
                "book_id": book_id,
                "file_url": file_url,  # 返回文件URL
                "background_indexing_started": bool(book_id and normalized_file_type in {"pdf", "epub", "markdown"}),
            }
            
        finally:
            # 清理临时文件
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/status/{file_id}")
async def get_upload_status(file_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    file_service = FileService(db)
    file_metadata = db.query(FileMetadata).filter(
        FileMetadata.id == file_id,
        FileMetadata.uploaded_by == user['id']
    ).first()
    
    if not file_metadata:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        "id": file_metadata.id,
        "original_name": file_metadata.original_name,
        "status": "completed",  # 在这个简单示例中，上传完成后状态始终为完成
        "pages": file_metadata.pages,
        "file_type": file_metadata.file_type,
        "file_size": file_metadata.file_size,
        "upload_date": file_metadata.upload_date,
        "file_url": file_metadata.file_url  # 包含文件URL
    }