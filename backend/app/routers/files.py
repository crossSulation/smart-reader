from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from typing import Optional
import os

from app.database import get_db
from app.models import FileMetadata
from app.routers.auth import get_current_user
from app.services.oss_service import OSSManager

router = APIRouter(prefix="/files", tags=["files"])

@router.get("/download/{file_name}")
async def download_file(
    file_name: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """下载文件 - 重定向到OSS URL"""
    # 查找文件记录
    file_record = db.query(FileMetadata).filter(
        FileMetadata.stored_name == file_name,
        FileMetadata.uploaded_by == user['id']
    ).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # 直接重定向到OSS URL
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=file_record.file_url)

@router.get("/{file_id}")
async def get_file_info(
    file_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取文件信息"""
    file_record = db.query(FileMetadata).filter(
        FileMetadata.id == file_id,
        FileMetadata.uploaded_by == user['id']
    ).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        "id": file_record.id,
        "original_name": file_record.original_name,
        "stored_name": file_record.stored_name,
        "file_type": file_record.file_type,
        "file_size": file_record.file_size,
        "pages": file_record.pages,
        "upload_date": file_record.upload_date,
        "file_url": file_record.file_url
    }