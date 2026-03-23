from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

class UserBase(BaseModel):
    email: str
    username: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

class UserResponse(UserBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class BookBase(BaseModel):
    title: str
    author: Optional[str] = None
    file_type: str
    file_path: str
    file_size: int
    total_pages: Optional[int] = None
    current_page: int = 0
    cover_path: Optional[str] = None

class BookCreate(BookBase):
    pass

class BookResponse(BookBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True