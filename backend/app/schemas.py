from pydantic import BaseModel
from typing import Optional, List, Literal, Union
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
    updated_at: Optional[datetime] = None
    current_page: Optional[int] = 0
    total_pages: Optional[int] = None
    progress_percentage: Optional[int] = 0
    last_read_time: Optional[datetime] = None
    notes: Optional[str] = None
    file_type: Optional[str] = None
    file_url: Optional[str] = None
    indexed: bool = False
    knowledge_count: int = 0

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
    section_path: Optional[str] = None
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
    section_path: Optional[str] = None
    score: float


class Citation(BaseModel):
    """A grounded source citation for a QA response."""
    book_id: int
    chunk_id: int
    page: Optional[int] = None
    section_path: Optional[str] = None
    quote: str
    score: float


class QARequest(BaseModel):
    question: str
    top_k: int = 5


class QAResponse(BaseModel):
    """Enhanced Q&A response with grounding and confidence."""
    question: str
    answer: str
    citations: List[Citation] = []
    confidence: float = 0.0  # 0.0-1.0 score of answer reliability
    insufficient_evidence: bool = False  # True if confidence below threshold
    sources: List[SearchResult] = []  # (deprecated, kept for backwards compatibility)
    provider: str


class ProviderResult(BaseModel):
    """Unified AI provider result wrapper for all capabilities."""
    content: str
    confidence: float = 1.0
    provider: str = "unknown"
    model: str = ""
    metadata: dict = {}
    fallback_used: bool = False


class SummaryBulletSection(BaseModel):
    heading: str
    bullets: List[str]


class SummaryCornellSchema(BaseModel):
    template: Literal["cornell"]
    cue_questions: List[str]
    notes: List[str]
    summary: List[str]


class SummaryBulletPointsSchema(BaseModel):
    template: Literal["bullet_points"]
    sections: List[SummaryBulletSection]


class SummarySQ3RSchema(BaseModel):
    template: Literal["sq3r"]
    survey: List[str]
    question: List[str]
    read: List[str]
    recite: List[str]
    review: List[str]


SummarySchema = Union[SummaryCornellSchema, SummaryBulletPointsSchema, SummarySQ3RSchema]


class SummaryResponse(BaseModel):
    book_id: int
    title: str
    template: Literal["cornell", "bullet_points", "sq3r"] = "bullet_points"
    summary_json: SummarySchema
    raw_output: str
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


AgentToolName = Literal["read", "write", "search", "web_search", "quiz", "flashcards", "summary", "list_notes"]


class AgentRequest(BaseModel):
    message: str
    tool: Optional[AgentToolName] = None
    session_id: Optional[str] = None
    allowed_tools: Optional[List[AgentToolName]] = None
    document_type: Optional[Literal["pdf", "epub", "markdown"]] = None
    top_k: int = 5
    term: Optional[str] = None
    note_content: Optional[str] = None
    page: Optional[int] = None
    current_page: Optional[int] = None
    tags: List[str] = []
    quiz_count: int = 3


class AgentToolResult(BaseModel):
    tool: AgentToolName
    status: Literal["success", "error"] = "success"
    data: dict = {}
    error: Optional[str] = None


class AgentResponse(BaseModel):
    book_id: int
    tool: AgentToolName
    message: str
    session_id: Optional[str] = None
    result: AgentToolResult
    provider: str


class TocItem(BaseModel):
    id: str
    title: str
    level: int
    anchor: str
    order_index: int


class IngestionMetricsResponse(BaseModel):
    book_id: int
    chunk_count: int
    avg_chunk_chars: float
    avg_token_count: float
    sections_count: int
    failed_units: int
    status: str


class IndexStatus(BaseModel):
    book_id: int
    chunks_stored: int
    status: str
    indexed: bool = True  # True if indexing completed successfully


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class NoteCreate(BaseModel):
    book_id: int
    content: str
    source_text: Optional[str] = None
    page: Optional[int] = None
    tags: List[str] = []
    knowledge_point_ids: List[int] = []


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    source_text: Optional[str] = None
    page: Optional[int] = None
    tags: Optional[List[str]] = None
    knowledge_point_ids: Optional[List[int]] = None


class NoteResponse(BaseModel):
    id: int
    user_id: int
    book_id: int
    content: str
    source_text: Optional[str] = None
    page: Optional[int] = None
    tags: List[str] = []
    knowledge_point_ids: List[int] = []
    created_at: datetime

    class Config:
        from_attributes = True


class FlashcardCreate(BaseModel):
    book_id: int
    front: str
    back: str
    source_text: Optional[str] = None
    source_chunk_id: Optional[int] = None
    tags: List[str] = []
    knowledge_point_ids: List[int] = []


class FlashcardResponse(BaseModel):
    id: int
    user_id: int
    book_id: int
    front: str
    back: str
    source_text: Optional[str] = None
    source_chunk_id: Optional[int] = None
    tags: List[str] = []
    knowledge_point_ids: List[int] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewItemResponse(BaseModel):
    id: int
    flashcard_id: int
    due_at: datetime
    interval_days: int
    ease_factor: float
    reps: int
    last_rating: Optional[str] = None
    flashcard_front: str
    flashcard_back: str
    book_id: int


class ReviewRateRequest(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]


class PersonalizationProfileResponse(BaseModel):
    user_id: int
    explanation_level: Literal["beginner", "intermediate", "expert"]
    study_goal: Optional[str] = None
    weak_topics: List[str] = []
    frequently_reviewed_tags: List[str] = []


class PersonalizationProfileUpdate(BaseModel):
    explanation_level: Optional[Literal["beginner", "intermediate", "expert"]] = None
    study_goal: Optional[str] = None
    weak_topics: Optional[List[str]] = None
    frequently_reviewed_tags: Optional[List[str]] = None


class WeeklyTrendPoint(BaseModel):
    date: str  # YYYY-MM-DD
    notes_created: int
    flashcards_created: int
    reviews_completed: int
    activity_total: int


class WeeklySummaryResponse(BaseModel):
    user_id: int
    period_days: int
    pages_read: int
    notes_created: int
    flashcards_created: int
    reviews_completed: int
    review_accuracy: float
    top_weak_topics: List[str] = []
    weak_topic_pages: List[dict] = []
    daily_trend: List[WeeklyTrendPoint] = []


# ---- Knowledge Graph Schemas ----

class KnowledgePointCreate(BaseModel):
    label: str
    aliases: List[str] = []
    description: Optional[str] = None
    source_chunk_ids: List[int] = []
    entity_type: Literal["concept", "term", "person", "event"] = "concept"


class KnowledgePointUpdate(BaseModel):
    label: Optional[str] = None
    aliases: Optional[List[str]] = None
    description: Optional[str] = None
    source_chunk_ids: Optional[List[int]] = None
    entity_type: Optional[Literal["concept", "term", "person", "event"]] = None


class KnowledgePointResponse(BaseModel):
    id: int
    user_id: int
    label: str
    aliases: List[str] = []
    description: Optional[str] = None
    source_chunk_ids: List[int] = []
    entity_type: str
    link_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class KnowledgePointDetail(KnowledgePointResponse):
    linked_points: List["KnowledgePointResponse"] = []
    sample_chunks: List[dict] = []


class KnowledgeLinkCreate(BaseModel):
    source_kp_id: int
    target_kp_id: int
    relation_type: Literal["related_to", "prerequisite_of", "derived_from", "contradicts", "extends"] = "related_to"
    weight: float = 1.0
    evidence_chunk_ids: List[int] = []


class KnowledgeLinkResponse(BaseModel):
    id: int
    source_kp_id: int
    target_kp_id: int
    relation_type: str
    weight: float
    evidence_chunk_ids: List[int] = []
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GraphNode(BaseModel):
    id: int
    label: str
    entity_type: str
    link_count: int


class GraphEdge(BaseModel):
    id: int
    source: int
    target: int
    relation_type: str
    weight: float


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class KnowledgeStatsResponse(BaseModel):
    total_nodes: int
    total_edges: int
    density: float
    entity_type_distribution: dict