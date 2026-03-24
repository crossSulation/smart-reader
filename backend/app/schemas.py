from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    username: str
    email: str


class UserCreate(UserBase):
    password: str


class User(UserBase):
    id: int

    class Config:
        from_attributes = True


class BookBase(BaseModel):
    title: str


class BookCreate(BookBase):
    pass


class Book(BookBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime
    current_page: Optional[int] = 0
    total_pages: Optional[int] = None
    progress_percentage: Optional[int] = 0
    last_read_time: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class FileMetadataBase(BaseModel):
    original_name: str
    stored_name: str
    file_type: str
    file_size: Optional[int] = None
    pages: Optional[int] = None
    upload_date: Optional[datetime] = None
    uploaded_by: int


class FileMetadataCreate(FileMetadataBase):
    pass


class FileMetadataResponse(FileMetadataBase):
    id: int

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None