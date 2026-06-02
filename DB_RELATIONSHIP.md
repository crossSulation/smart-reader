# Smart Reader DB Relationship Map

Last updated: 2026-06-02
Database: `backend/smart_reader.db` (SQLite)

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
- `alembic_version` (migration metadata)

## Entity Relationship Diagram (High-Level)

```mermaid
erDiagram
    USERS {
        INTEGER id PK
    }
    BOOKS {
        INTEGER id PK
        INTEGER owner_id FK
    }
    FILES {
        INTEGER id PK
        INTEGER uploaded_by FK
    }
    DOCUMENT_CHUNKS {
        INTEGER id PK
        INTEGER book_id FK
    }
    AI_INTERACTIONS {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
    }
    AI_CITATIONS {
        INTEGER id PK
        INTEGER interaction_id FK
        INTEGER book_id FK
        INTEGER chunk_id FK
    }
    NOTES {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
    }
    FLASHCARDS {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER book_id FK
        INTEGER source_chunk_id FK
    }
    REVIEW_ITEMS {
        INTEGER id PK
        INTEGER flashcard_id FK
    }

    USERS ||--o{ BOOKS : owner_id
    USERS ||--o{ FILES : uploaded_by
    USERS ||--o{ AI_INTERACTIONS : user_id
    USERS ||--o{ NOTES : user_id
    USERS ||--o{ FLASHCARDS : user_id

    BOOKS ||--o{ DOCUMENT_CHUNKS : book_id
    BOOKS ||--o{ AI_INTERACTIONS : book_id
    BOOKS ||--o{ AI_CITATIONS : book_id
    BOOKS ||--o{ NOTES : book_id
    BOOKS ||--o{ FLASHCARDS : book_id

    DOCUMENT_CHUNKS ||--o{ AI_CITATIONS : chunk_id
    DOCUMENT_CHUNKS ||--o{ FLASHCARDS : source_chunk_id_optional

    AI_INTERACTIONS ||--o{ AI_CITATIONS : interaction_id

    FLASHCARDS ||--o{ REVIEW_ITEMS : flashcard_id
```

## Foreign Key Detail (from live DB)

### `ai_citations`
- `chunk_id -> document_chunks.id` (on_delete=CASCADE)
- `book_id -> books.id` (on_delete=CASCADE)
- `interaction_id -> ai_interactions.id` (on_delete=CASCADE)

### `ai_interactions`
- `user_id -> users.id` (on_delete=CASCADE)
- `book_id -> books.id` (on_delete=CASCADE)

### `books`
- `owner_id -> users.id` (on_delete=NO ACTION)

### `document_chunks`
- `book_id -> books.id` (on_delete=CASCADE)

### `files`
- `uploaded_by -> users.id` (on_delete=NO ACTION)

### `flashcards`
- `user_id -> users.id` (on_delete=NO ACTION)
- `source_chunk_id -> document_chunks.id` (on_delete=NO ACTION)
- `book_id -> books.id` (on_delete=NO ACTION)

### `notes`
- `user_id -> users.id` (on_delete=NO ACTION)
- `book_id -> books.id` (on_delete=NO ACTION)

### `review_items`
- `flashcard_id -> flashcards.id` (on_delete=NO ACTION)

## Notes
- `WeeklyTrendPoint` is an API response schema in `backend/app/schemas.py`, not a physical DB table.
- `alembic_version` is used only for migration version tracking.
