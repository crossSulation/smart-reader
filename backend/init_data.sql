-- ============================================================
-- Smart Reader Database Schema & Seed Data
-- Target: SQLite (via SQLAlchemy + Alembic)
-- Last updated: 2026-07-23
-- ============================================================

-- =====================
-- 用户表
-- =====================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    explanation_level TEXT DEFAULT 'intermediate',
    study_goal TEXT,
    weak_topics TEXT,
    frequently_reviewed_tags TEXT,
    fsrs_params TEXT,
    credits REAL DEFAULT 0,
    monthly_credits_reset_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 文件元数据表
-- =====================
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    pages INTEGER,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE NO ACTION,
    file_url TEXT
);

-- =====================
-- 书本表
-- =====================
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    owner_id INTEGER REFERENCES users(id) ON DELETE NO ACTION,
    file_id INTEGER REFERENCES files(id),
    file_type TEXT,
    cover_path TEXT,
    current_page REAL DEFAULT 0,
    total_pages INTEGER,
    progress_percentage REAL DEFAULT 0,
    last_read_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    indexed INTEGER DEFAULT 0,
    knowledge_count INTEGER DEFAULT 0
);

-- =====================
-- 文档分块表
-- =====================
CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    section_path TEXT,
    token_count INTEGER DEFAULT 0,
    embedding TEXT,
    embedding_model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    indexed_at TIMESTAMP
);

-- =====================
-- AI 交互记录表
-- =====================
CREATE TABLE IF NOT EXISTS ai_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    session_id TEXT,
    interaction_type TEXT DEFAULT 'qa',
    query TEXT NOT NULL,
    response TEXT,
    provider TEXT,
    chunks_used INTEGER DEFAULT 0,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- AI 引用表
-- =====================
CREATE TABLE IF NOT EXISTS ai_citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interaction_id INTEGER REFERENCES ai_interactions(id) ON DELETE CASCADE,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    chunk_id INTEGER REFERENCES document_chunks(id) ON DELETE CASCADE,
    page INTEGER,
    quote TEXT,
    score REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 学习笔记表
-- =====================
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE NO ACTION,
    book_id INTEGER REFERENCES books(id) ON DELETE NO ACTION,
    page INTEGER,
    source_text TEXT,
    content TEXT NOT NULL,
    tags TEXT,
    knowledge_point_ids TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 闪卡表
-- =====================
CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE NO ACTION,
    book_id INTEGER REFERENCES books(id) ON DELETE NO ACTION,
    source_chunk_id INTEGER REFERENCES document_chunks(id) ON DELETE NO ACTION,
    front TEXT NOT NULL,
    back TEXT,
    source_text TEXT,
    tags TEXT,
    knowledge_point_ids TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 复习记录表 (间隔重复)
-- =====================
CREATE TABLE IF NOT EXISTS review_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flashcard_id INTEGER REFERENCES flashcards(id) ON DELETE NO ACTION,
    due_at TIMESTAMP NOT NULL,
    interval_days REAL DEFAULT 1,
    ease_factor REAL DEFAULT 2.5,
    reps INTEGER DEFAULT 0,
    last_rating TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 知识点表
-- =====================
CREATE TABLE IF NOT EXISTS knowledge_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE NO ACTION,
    label TEXT NOT NULL,
    aliases TEXT,
    description TEXT,
    source_chunk_ids TEXT,
    entity_type TEXT DEFAULT 'concept',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 知识点关联表
-- =====================
CREATE TABLE IF NOT EXISTS knowledge_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_kp_id INTEGER REFERENCES knowledge_points(id) ON DELETE NO ACTION,
    target_kp_id INTEGER REFERENCES knowledge_points(id) ON DELETE NO ACTION,
    relation_type TEXT DEFAULT 'related_to',
    weight REAL DEFAULT 0.5,
    evidence_chunk_ids TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- Agent 会话记忆表
-- =====================
CREATE TABLE IF NOT EXISTS agent_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    summary TEXT,
    key_topics TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- Token 用量日志表
-- =====================
CREATE TABLE IF NOT EXISTS token_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    interaction_id INTEGER REFERENCES ai_interactions(id),
    capability TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    credit_cost REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 积分交易表
-- =====================
CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 积分套餐表
-- =====================
CREATE TABLE IF NOT EXISTS credit_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    credits INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 离线任务队列表 (架构升级 Phase 2)
-- =====================
CREATE TABLE IF NOT EXISTS offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    task_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    result_json TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- AI 回答反馈表 (W9-03C)
-- =====================
CREATE TABLE IF NOT EXISTS ai_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interaction_id INTEGER REFERENCES ai_interactions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    rating TEXT NOT NULL,
    category TEXT,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- 阅读会话统计表 (W9-04D)
-- =====================
CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER REFERENCES books(id),
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    duration_seconds INTEGER DEFAULT 0,
    pages_read INTEGER DEFAULT 0,
    notes_created INTEGER DEFAULT 0,
    flashcards_reviewed INTEGER DEFAULT 0
);

-- =====================
-- 索引
-- =====================
CREATE INDEX IF NOT EXISTS idx_books_owner_id ON books(owner_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_book_id ON document_chunks(book_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_id ON ai_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_book_id ON ai_interactions(book_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_book ON notes(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_book ON flashcards(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_review_items_due ON review_items(due_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_points_user ON knowledge_points(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_source ON knowledge_links(source_kp_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target ON knowledge_links(target_kp_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user ON token_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_session ON agent_memories(session_id);

-- =====================
-- 种子数据: 积分套餐
-- =====================
INSERT OR IGNORE INTO credit_packs (id, name, credits, price_cents, is_active, sort_order) VALUES
    (1, 'Starter',       100000, 199,  1, 1),
    (2, 'Standard',      500000, 899,  1, 2),
    (3, 'Premium',      2000000, 2999, 1, 3);
