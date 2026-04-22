from pydantic import BaseModel
from typing import Optional, List
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
    file_type: Optional[str] = None
    file_url: Optional[str] = None

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


class DocumentChunk(BaseModel):
    id: int
    book_id: int
    chunk_index: int
    text: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    token_count: Optional[int] = None
    embedding_model: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SearchResult(BaseModel):
    chunk_id: int
    chunk_index: int
    text: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    score: float


class QARequest(BaseModel):
    question: str
    top_k: int = 5


class QAResponse(BaseModel):
    question: str
    answer: str
    sources: List[SearchResult]
    provider: str


class SummaryResponse(BaseModel):
    book_id: int
    title: str
    summary: str
    provider: str
    chunks_used: int


class WebReferenceItem(BaseModel):
    title: str
    snippet: str
    url: str
    source: str


class WebReferenceRequest(BaseModel):
    term: str
    limit: int = 3


class WebReferenceResponse(BaseModel):
    term: str
    references: List[WebReferenceItem]


class IndexStatus(BaseModel):
    book_id: int
    chunks_stored: int
    status: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None