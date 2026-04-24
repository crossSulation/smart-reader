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

@router.get("/download/{file_path:path}")
async def download_file(
    file_path: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """下载文件 - 本地直接返回文件，云存储重定向到OSS URL"""
    # 查找文件记录
    file_record = db.query(FileMetadata).filter(
        FileMetadata.stored_name == file_path,
        FileMetadata.uploaded_by == user['id']
    ).first()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # 本地存储：直接返回文件
    local_path = os.path.join("uploads", file_path)
    if os.path.exists(local_path):
        return FileResponse(local_path, filename=file_record.original_name)

    # 云存储：重定向到OSS URL
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