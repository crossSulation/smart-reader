# Smart Reader DB Relationship Map

Last updated: 2026-07-23
Database: `backend/smart_reader.db` (SQLite)
ORM: SQLAlchemy + Alembic migrations

## Tables
- `users`
- `books`
- `files`
- `document_chunks`
- `ai_interactions`
- `ai_citations`
- `notes`
- `flashcards`
- `review_items`
- `knowledge_points`
- `knowledge_links`
- `agent_memories`
- `token_usage_logs`
- `credit_transactions`
- `credit_packs`
- `alembic_version` (migration metadata)

## Entity Relationship Diagram (High-Level)

```mermaid
erDiagram
    USERS {
        INTEGER id PK
        VARCHAR username
        VARCHAR email
        VARCHAR hashed_password
        VARCHAR explanation_level
        VARCHAR study_goal
        TEXT weak_topics
        TEXT frequently_reviewed_tags
        TEXT fsrs_params
        DECIMAL credits
        DATETIME monthly_credits_reset_at
        DATETIME created_at
        DATETIME updated_at
    }
    BOOKS {
        INTEGER id PK
        INTEGER owner_id FK
        INTEGER file_id FK
        VARCHAR title
        VARCHAR file_type
        VARCHAR cover_path
        INTEGER current_page
        INTEGER total_pages
        INTEGER progress_percentage
        DATETIME last_read_time
        TEXT notes
        INTEGER indexed
        INTEGER knowledge_count
        DATETIME created_at
        DATETIME updated_at
    }
    FILES {
        INTEGER id PK
        VARCHAR original_name
        VARCHAR stored_name
        VARCHAR file_type
        INTEGER file_size
        INTEGER pages
        DATETIME upload_date
        INTEGER uploaded_by FK
        VARCHAR file_url
    }
    DOCUMENT_CHUNKS {
        INTEGER id PK
        INTEGER book_id FK
        INTEGER chunk_index
        TEXT text
        INTEGER page_start
        INTEGER page_end
        VARCHAR section_path
        INTEGER token_count
        TEXT embedding
        VARCHAR embedding_model
        DATETIME created_at
        DATETIME indexed_at
    }
    AI_INTERACTIONS {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
        VARCHAR session_id
        VARCHAR interaction_type
        TEXT query
        TEXT response
        VARCHAR provider
        INTEGER chunks_used
        VARCHAR feedback
        DATETIME created_at
    }
    AI_CITATIONS {
        INTEGER id PK
        INTEGER interaction_id FK
        INTEGER book_id FK
        INTEGER chunk_id FK
        INTEGER page
        TEXT quote
        FLOAT score
        DATETIME created_at
    }
    NOTES {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
        INTEGER page
        TEXT source_text
        TEXT content
        VARCHAR tags
        TEXT knowledge_point_ids
        DATETIME created_at
        DATETIME updated_at
    }
    FLASHCARDS {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
        INTEGER source_chunk_id FK
        TEXT front
        TEXT back
        TEXT source_text
        VARCHAR tags
        TEXT knowledge_point_ids
        DATETIME created_at
        DATETIME updated_at
    }
    REVIEW_ITEMS {
        INTEGER id PK
        INTEGER flashcard_id FK
        DATETIME due_at
        INTEGER interval_days
        FLOAT ease_factor
        INTEGER reps
        VARCHAR last_rating
        DATETIME created_at
        DATETIME updated_at
    }
    KNOWLEDGE_POINTS {
        INTEGER id PK
        INTEGER user_id FK
        VARCHAR label
        TEXT aliases
        TEXT description
        TEXT source_chunk_ids
        VARCHAR entity_type
        DATETIME created_at
        DATETIME updated_at
    }
    KNOWLEDGE_LINKS {
        INTEGER id PK
        INTEGER source_kp_id FK
        INTEGER target_kp_id FK
        VARCHAR relation_type
        FLOAT weight
        TEXT evidence_chunk_ids
        DATETIME created_at
    }
    AGENT_MEMORIES {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
        VARCHAR session_id
        TEXT summary
        TEXT key_topics
        DATETIME created_at
    }
    TOKEN_USAGE_LOGS {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER interaction_id FK
        VARCHAR capability
        VARCHAR provider
        VARCHAR model
        INTEGER prompt_tokens
        INTEGER completion_tokens
        INTEGER total_tokens
        DECIMAL credit_cost
        DATETIME created_at
    }
    CREDIT_TRANSACTIONS {
        INTEGER id PK
        INTEGER user_id FK
        VARCHAR type
        DECIMAL amount
        DECIMAL balance_after
        VARCHAR reference_type
        INTEGER reference_id
        TEXT note
        DATETIME created_at
    }
    CREDIT_PACKS {
        INTEGER id PK
        VARCHAR name
        INTEGER credits
        INTEGER price_cents
        INTEGER is_active
        INTEGER sort_order
        DATETIME created_at
    }

    USERS ||--o{ BOOKS : owner_id
    USERS ||--o{ FILES : uploaded_by
    USERS ||--o{ AI_INTERACTIONS : user_id
    USERS ||--o{ NOTES : user_id
    USERS ||--o{ FLASHCARDS : user_id
    USERS ||--o{ KNOWLEDGE_POINTS : user_id
    USERS ||--o{ AGENT_MEMORIES : user_id
    USERS ||--o{ TOKEN_USAGE_LOGS : user_id
    USERS ||--o{ CREDIT_TRANSACTIONS : user_id

    BOOKS ||--o{ DOCUMENT_CHUNKS : book_id
    BOOKS ||--o{ AI_INTERACTIONS : book_id
    BOOKS ||--o{ AI_CITATIONS : book_id
    BOOKS ||--o{ NOTES : book_id
    BOOKS ||--o{ FLASHCARDS : book_id
    BOOKS ||--o{ AGENT_MEMORIES : book_id

    DOCUMENT_CHUNKS ||--o{ AI_CITATIONS : chunk_id
    DOCUMENT_CHUNKS ||--o{ FLASHCARDS : source_chunk_id

    AI_INTERACTIONS ||--o{ AI_CITATIONS : interaction_id
    AI_INTERACTIONS ||--o{ TOKEN_USAGE_LOGS : interaction_id

    FLASHCARDS ||--o{ REVIEW_ITEMS : flashcard_id

    KNOWLEDGE_POINTS ||--o{ KNOWLEDGE_LINKS : source_kp_id
    KNOWLEDGE_POINTS ||--o{ KNOWLEDGE_LINKS : target_kp_id
```

## Foreign Key Detail (from live DB)

### `ai_citations`
- `chunk_id -> document_chunks.id` (on_delete=CASCADE)
- `book_id -> books.id` (on_delete=CASCADE)
- `interaction_id -> ai_interactions.id` (on_delete=CASCADE)

### `ai_interactions`
- `user_id -> users.id` (on_delete=CASCADE)
- `book_id -> books.id` (on_delete=CASCADE)

### `agent_memories`
- `user_id -> users.id` (on_delete=CASCADE)
- `book_id -> books.id` (on_delete=CASCADE)

### `books`
- `owner_id -> users.id` (on_delete=NO ACTION)
- `file_id -> files.id` (optional, nullable)

### `credit_transactions`
- `user_id -> users.id` (on_delete=NO ACTION)

### `document_chunks`
- `book_id -> books.id` (on_delete=CASCADE)

### `files`
- `uploaded_by -> users.id` (on_delete=NO ACTION)

### `flashcards`
- `user_id -> users.id` (on_delete=NO ACTION)
- `source_chunk_id -> document_chunks.id` (on_delete=NO ACTION)
- `book_id -> books.id` (on_delete=NO ACTION)

### `knowledge_links`
- `source_kp_id -> knowledge_points.id` (on_delete=NO ACTION)
- `target_kp_id -> knowledge_points.id` (on_delete=NO ACTION)

### `knowledge_points`
- `user_id -> users.id` (on_delete=NO ACTION)

### `notes`
- `user_id -> users.id` (on_delete=NO ACTION)
- `book_id -> books.id` (on_delete=NO ACTION)

### `review_items`
- `flashcard_id -> flashcards.id` (on_delete=NO ACTION)

### `token_usage_logs`
- `user_id -> users.id` (on_delete=CASCADE)
- `interaction_id -> ai_interactions.id` (on_delete=SET NULL, nullable)

## Notes
- `WeeklyTrendPoint` is an API response schema in `backend/app/schemas.py`, not a physical DB table.
- `alembic_version` is used only for migration version tracking.
- `knowledge_points.aliases` and `knowledge_points.source_chunk_ids` are stored as JSON strings (Text columns) for SQLite compatibility.
- `knowledge_links.evidence_chunk_ids` is stored as a JSON string (Text column).
- `knowledge_links.relation_type` accepts: `related_to`, `prerequisite_of`, `derived_from`, `contradicts`, `extends`.
- `knowledge_points.entity_type` accepts: `concept`, `term`, `person`, `event`.
- `notes.tags` and `flashcards.tags` are stored as comma-separated strings.
- `notes.knowledge_point_ids` and `flashcards.knowledge_point_ids` are stored as JSON string arrays.
- `document_chunks.embedding` is stored as a JSON string (float array).
- `ai_interactions.feedback` accepts: `up`, `down`, or null.
- `review_items.last_rating` accepts: `again`, `hard`, `good`, `easy`, or null.
- `credit_transactions.type` accepts: `consumption`, `refill`, `purchase`, `admin_grant`.
- Knowledge extraction is triggered automatically after document ingestion (best-effort, non-blocking).
- Token counting uses provider `usage` field when available; falls back to `tiktoken` estimation.
- Credit system: 1 credit = 1 token (configurable), local/Ollama calls consume 0 credits.
