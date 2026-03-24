# backend/app/routers/upload.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any
import os
import uuid
from datetime import datetime

from app.database import get_db
from app.models import FileMetadata
from app.services.file_service import FileService
from app.services.pdf_service import extract_pdf_info, get_pdf_page_count
from app.routers.auth import get_current_user

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # 验证文件类型
        allowed_types = [
            "application/pdf",
            "image/jpeg", 
            "image/png",
            "image/gif",
            "image/bmp",
            "image/tiff",
            "text/plain",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ]
        
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="File type not allowed")
        
        # 生成唯一文件名
        unique_filename = f"{uuid.uuid4()}_{file.filename}"
        file_path = os.path.join("uploads", unique_filename)
        
        # 确保上传目录存在
        os.makedirs("uploads", exist_ok=True)
        
        # 保存文件
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        
        # 提取文件信息
        file_size = os.path.getsize(file_path)
        
        # 如果是PDF文件，提取额外信息
        pages = None
        if file.content_type == "application/pdf":
            try:
                pages = get_pdf_page_count(file_path)
            except Exception as e:
                print(f"Error extracting PDF info: {str(e)}")
                pages = None
        
        # 创建文件服务实例并保存元数据
        file_service = FileService(db)
        file_metadata = FileMetadata(
            original_name=file.filename,
            stored_name=unique_filename,
            file_type=file.content_type,
            file_size=file_size,
            upload_date=datetime.utcnow(),
            uploaded_by=user['id'],
            pages=pages  # 添加页数信息
        )
        
        db.add(file_metadata)
        db.commit()
        db.refresh(file_metadata)
        
        return {
            "filename": file.filename,
            "stored_name": unique_filename,
            "file_type": file.content_type,
            "file_size": file_size,
            "pages": pages,
            "id": file_metadata.id
        }
        
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
        "upload_date": file_metadata.upload_date
    }