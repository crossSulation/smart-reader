-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 书本表
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(200),
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL, -- pdf/epub
    file_size BIGINT,
    cover_path VARCHAR(500), -- 封面图
    total_pages INTEGER,
    current_page INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 书签表
CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    page_number INTEGER,
    label VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 阅读进度表
CREATE TABLE reading_progress (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    current_page INTEGER,
    progress_percent FLOAT,
    last_read_at TIMESTAMP,
    PRIMARY KEY (user_id, book_id)
);

-- 索引
CREATE INDEX idx_books_user_id ON books(user_id);
CREATE INDEX idx_bookmarks_book_id ON bookmarks(book_id);