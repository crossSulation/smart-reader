from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    explanation_level = Column(String, nullable=False, default="intermediate")
    study_goal = Column(String, nullable=True)
    weak_topics = Column(Text, nullable=True)  # comma-separated weak topics
    frequently_reviewed_tags = Column(Text, nullable=True)  # comma-separated tags
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系
    files = relationship("FileMetadata", back_populates="owner")
    books = relationship("Book", back_populates="owner")
    notes = relationship("Note", back_populates="owner", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="owner", cascade="all, delete-orphan")
    knowledge_points = relationship("KnowledgePoint", back_populates="owner", cascade="all, delete-orphan")


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
    learning_notes = relationship("Note", back_populates="book", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="book", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)   # ordering within the document
    text = Column(Text, nullable=False)
    page_start = Column(Integer, nullable=True)     # first page this chunk covers
    page_end = Column(Integer, nullable=True)       # last page this chunk covers
    section_path = Column(String, nullable=True)    # structural path (e.g. Chapter > Section)
    token_count = Column(Integer, nullable=True)    # approximate word/token count
    embedding = Column(Text, nullable=True)          # JSON-serialised float list
    embedding_model = Column(String, nullable=True)  # model name used
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    indexed_at = Column(DateTime(timezone=True), nullable=True)  # timestamp when chunk was indexed

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
    citations = relationship("AICitation", back_populates="interaction", cascade="all, delete-orphan")


class AICitation(Base):
    __tablename__ = "ai_citations"

    id = Column(Integer, primary_key=True, index=True)
    interaction_id = Column(Integer, ForeignKey("ai_interactions.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_id = Column(Integer, ForeignKey("document_chunks.id", ondelete="CASCADE"), nullable=False, index=True)
    page = Column(Integer, nullable=True)
    quote = Column(Text, nullable=False)
    score = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    interaction = relationship("AIInteraction", back_populates="citations")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    page = Column(Integer, nullable=True)
    source_text = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    tags = Column(String, nullable=True)  # comma-separated tags for first iteration
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="notes")
    book = relationship("Book", back_populates="learning_notes")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False, index=True)
    source_chunk_id = Column(Integer, ForeignKey("document_chunks.id"), nullable=True, index=True)
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    source_text = Column(Text, nullable=True)
    tags = Column(String, nullable=True)  # comma-separated tags for first iteration
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="flashcards")
    book = relationship("Book", back_populates="flashcards")
    review_items = relationship("ReviewItem", back_populates="flashcard", cascade="all, delete-orphan")


class ReviewItem(Base):
    __tablename__ = "review_items"

    id = Column(Integer, primary_key=True, index=True)
    flashcard_id = Column(Integer, ForeignKey("flashcards.id"), nullable=False, index=True)
    due_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    interval_days = Column(Integer, nullable=False, default=1)
    ease_factor = Column(Float, nullable=False, default=2.5)
    reps = Column(Integer, nullable=False, default=0)
    last_rating = Column(String, nullable=True)  # again|hard|good|easy
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    flashcard = relationship("Flashcard", back_populates="review_items")


class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String, nullable=False)
    aliases = Column(Text, nullable=True)  # JSON list of strings
    description = Column(Text, nullable=True)
    source_chunk_ids = Column(Text, nullable=True)  # JSON list of chunk IDs
    entity_type = Column(String, nullable=False, default="concept")  # concept|term|person|event
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="knowledge_points")
    outgoing_links = relationship("KnowledgeLink", foreign_keys="KnowledgeLink.source_kp_id", back_populates="source", cascade="all, delete-orphan")
    incoming_links = relationship("KnowledgeLink", foreign_keys="KnowledgeLink.target_kp_id", back_populates="target", cascade="all, delete-orphan")


class KnowledgeLink(Base):
    __tablename__ = "knowledge_links"

    id = Column(Integer, primary_key=True, index=True)
    source_kp_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=False, index=True)
    target_kp_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=False, index=True)
    relation_type = Column(String, nullable=False, default="related_to")  # related_to|prerequisite_of|derived_from|contradicts|extends
    weight = Column(Float, nullable=False, default=1.0)
    evidence_chunk_ids = Column(Text, nullable=True)  # JSON list of chunk IDs
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    source = relationship("KnowledgePoint", foreign_keys=[source_kp_id], back_populates="outgoing_links")
    target = relationship("KnowledgePoint", foreign_keys=[target_kp_id], back_populates="incoming_links")