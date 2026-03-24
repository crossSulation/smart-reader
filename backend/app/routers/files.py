from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.schemas import FileMetadataResponse
from app.services.file_service import FileService
from app.routers.auth import get_current_user

router = APIRouter(prefix="/files", tags=["files"])

@router.get("/", response_model=List[FileMetadataResponse])
async def list_files(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    file_service = FileService(db)
    files = file_service.get_user_files(user['id'])
    return files

@router.get("/{file_id}", response_model=FileMetadataResponse)
async def get_file(file_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    file_service = FileService(db)
    file = file_service.get_file(file_id, user['id'])
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file

@router.delete("/{file_id}")
async def delete_file(file_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    file_service = FileService(db)
    success = file_service.delete_file(file_id, user['id'])
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File deleted successfully"}