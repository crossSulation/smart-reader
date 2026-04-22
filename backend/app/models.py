from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系
    files = relationship("FileMetadata", back_populates="owner")
    books = relationship("Book", back_populates="owner")


class FileMetadata(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)  # OSS中的对象键
    file_type = Column(String, nullable=False)
    file_size = Column(Integer)  # 文件大小（字节）
    pages = Column(Integer, nullable=True)  # 页数（如果是文档）
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    file_url = Column(String, nullable=True)  # 文件访问URL

    # 关系
    owner = relationship("User", back_populates="files")


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系
    owner = relationship("User", back_populates="books")
    # 添加进度跟踪字段
    current_page = Column(Integer, default=0)  # 当前阅读页数
    total_pages = Column(Integer)  # 总页数
    progress_percentage = Column(Integer, default=0)  # 阅读进度百分比
    last_read_time = Column(DateTime(timezone=True), server_default=func.now())  # 最后阅读时间
    notes = Column(Text)  # 笔记
    chunks = relationship("DocumentChunk", back_populates="book", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)   # ordering within the document
    text = Column(Text, nullable=False)
    page_start = Column(Integer, nullable=True)     # first page this chunk covers
    page_end = Column(Integer, nullable=True)       # last page this chunk covers
    token_count = Column(Integer, nullable=True)    # approximate word/token count
    embedding = Column(Text, nullable=True)          # JSON-serialised float list
    embedding_model = Column(String, nullable=True)  # model name used
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    book = relationship("Book", back_populates="chunks")


class AIInteraction(Base):
    __tablename__ = "ai_interactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    interaction_type = Column(String, nullable=False)   # "qa" | "summary"
    query = Column(Text, nullable=True)                 # user question (QA only)
    response = Column(Text, nullable=False)
    provider = Column(String, nullable=True)            # llm provider used
    chunks_used = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())