# backend/app/routers/upload.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid, os, shutil
from app.database import get_db
from app.models import Book, User
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api", tags=["upload"])
security = HTTPBearer()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    # TODO: 解析 JWT 获取 user_id
    return {"id": "user-uuid-here"}

@router.post("/upload")
async def upload_book(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. 校验文件类型
    allowed_types = ["application/pdf", "application/epub+zip"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "只支持 PDF 和 EPUB 格式")
    
    # 2. 生成唯一文件名
    file_ext = file.filename.split(".")[-1]
    file_id = str(uuid.uuid4())
    file_path = f"{UPLOAD_DIR}/{file_id}.{file_ext}"
    
    # 3. 保存文件
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # 4. 提取元数据（标题可从文件名或 PDF 元数据提取）
    title = file.filename.rsplit(".", 1)[0]
    file_size = os.path.getsize(file_path)
    file_type = "pdf" if file_ext == "pdf" else "epub"
    
    # 5. 存入数据库
    book = Book(
        user_id=user["id"],
        title=title,
        file_path=file_path,
        file_type=file_type,
        file_size=file_size
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    
    return {
        "id": str(book.id),
        "title": book.title,
        "file_type": book.file_type,
        "file_size": book.file_size
    }