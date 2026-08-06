# Smart Reader

A multi-format reader with AI-powered knowledge features. Supports PDF, EPUB, Markdown, and local files. Features include AI knowledge graph, spaced repetition review, credit billing, and a comprehensive admin panel.

## Key Features

### Reading
- **Multi-format**: PDF, EPUB, Markdown, local file upload
- **Canvas-based PDF viewer** (mobile): image + canvas rendering with annotation tools (highlight, underline)
- **react-pdf viewer** (desktop): native text selection, dark mode support
- **EPUB viewer**: TOC sidebar, cached via IndexedDB for offline reading
- **Markdown viewer**: LaTeX math (`$inline$` / `$$block$$`), Mermaid diagrams, SMILES chemical structures, heading TOC navigation
- **Local file support**: drag-and-drop or file picker, auto-format detection
- **Reading themes**: default / wechat (eye-care) / kindle (e-ink) for PDF
- **Progress sync**: per-page progress saved to backend, resume from last position

### AI & Knowledge
- **Unified AI chat**: single agent chatbox per book — ask questions, search, create notes, generate quizzes, web search via tool-calling
- **Streaming agent**: SSE real-time token output with tool-step timeline
- **Multi-session**: save/switch conversations per book, persisted in localStorage
- **AI Summary templates**: Cornell Notes, Bullet Points, SQ3R with JSON schema validation
- **Knowledge graph**: LLM-powered entity/relation extraction, REST API, auto-trigger after ingestion
- **Knowledge points**: semantic search, link inference, stats dashboard
- **Hybrid search**: keyword (BM25) + vector (embedding) + cross-encoder reranking pipeline with server-side 4-stage retrieval
- **Cascaded search**: local (IndexedDB + Transformers.js) → server automatic fallback

### Learning Workflow
- **Notes**: create/edit/delete per book, tags, page anchors, Markdown export
- **Flashcards**: front/back generation, Anki-compatible CSV export
- **Spaced repetition (FSRS)**: review scheduling, ease factor, interval tracking
- **Review dashboard**: due items, topic filter, weekly stats

### Personalization
- **User profile**: explanation level (beginner/intermediate/advanced), study goals, weak topics
- **Adaptive QA**: answers tailored to user's explanation level
- **Weekly summary**: activity dashboard with per-day breakdown

### Billing & Credits
- **Token tracking**: per-capability token usage logging (prompt + completion)
- **Credit engine**: free monthly refill, consumption billing, balance management
- **Credit packs**: Starter / Standard / Premium purchasable packs
- **Transaction history**: typed transactions (consumption/refill/purchase/admin_grant)
- **Usage analytics**: daily/weekly/monthly breakdowns

### Admin Panel (`/admin`)
- **Dashboard**: total users, books, chunks, embeddings, credits, tokens
- **User management**: list, search, promote/revoke admin, grant credits
- **Book management**: list, search, delete any book
- **Credit management**: transaction log filterable by user, manual credit grants
- **Embedding management**: chunk listing, delete unindexed chunks

### AI Provider Architecture (Phase 0-7)
- **Provider abstraction**: `CloudProvider` / `MockProvider` / `LocalProvider` / `HybridLLMProvider`
- **Middleware pipeline**: Capability Scanner → Scheduler → Confidence Gate → Offline Queue → Privacy Guard → AI Router
- **Local-first routing**: local model → cloud fallback, offline queue for disconnected mode
- **Privacy modes**: `X-Privacy-Mode` header, document safety validation
- **LLM settings**: persisted in database, configurable via Settings page (DB → header → .env priority)

### Desktop (Tauri)
- **Tauri 2.0** shell with custom titlebar (minimize/maximize/close)
- **Drag-to-resize** AI panel (280px–60vw), persistence across sessions
- **Search** integrated in titlebar

### UX
- **Dark mode** toggle with system preference detection
- **Keyboard shortcuts** for all reader actions
- **Toast notifications** for transient feedback
- **Grid/list view** toggle in library with persistent preference
- **Language switcher** (zh/en) with i18n via react-i18next
- **Responsive layout**: mobile-optimized with swipe navigation

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + MUI + Tailwind CSS |
| Backend | Python 3.11+ / FastAPI + SQLAlchemy + SQLite |
| AI / NLP | LangChain Agent, sentence-transformers, Transformers.js (local) |
| Desktop | Tauri 2.0 (Rust shell) |
| Auth | JWT (HS256) + bcrypt password hashing |
| DB migrations | Alembic (SQLite-compatible batch mode) |
| Package management | uv (backend), yarn (frontend) |
| Testing | pytest (backend 38 tests), tsc --noEmit (frontend) |

## Quick Start

### 1. Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python run_dev.py
```

The database auto-initializes on first startup:
- Tables are created from SQLAlchemy models
- `init_data.sql` is executed (credit packs, indexes, default admin)
- Default admin user is created if not present (`admin / admin123`)

Environment config in `backend/.env.dev`:
```env
ENVIRONMENT=development
DATABASE_URL=sqlite:///./smart_reader.db
SECRET_KEY=your-secret-key-change-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@smartreader.local
LLM_PROVIDER=mock
```

### 2. Frontend

```bash
cd frontend
yarn install
yarn dev
```

### 3. Desktop (Tauri)

```bash
cd frontend
npm run tauri:dev
```

### Default Accounts

| Role | Username | Password | Notes |
|------|----------|----------|-------|
| Admin | `admin` | `admin123` | Auto-created on startup, 99,999,999 credits |
| Test | `testuser` | `test123456` | Manual creation via seed script |

Access: `http://localhost:5173` (frontend) → `http://localhost:8000` (backend proxy)

## Project Layout

```
backend/
  app/
    main.py              FastAPI entry point + startup events
    models.py            SQLAlchemy ORM (User, Book, Note, Flashcard, ...)
    config.py            Pydantic settings (.env / environment-aware)
    database.py          SQLAlchemy engine + session factory
    routers/             API endpoints
      auth.py            Registration, login, JWT, admin dependency
      books.py           Book CRUD, search pipeline, sharing
      ai.py              QA, summary, agent, streaming
      upload.py          File upload + ingestion trigger
      ingestion.py       Text extraction, chunking, embedding
      learning.py        Notes, flashcards, review scheduling
      personalization.py Profile, weekly summary
      knowledge.py       Knowledge points, graph, semantic search
      billing.py         Token usage, credits, credit packs
      settings.py        App settings (LLM config) in DB
      admin.py           Admin dashboard, user/book/credit/embedding management
      files.py           File metadata + download
    providers/           AI Provider abstraction layer
      base.py            AIProvider abstract base
      cloud.py           OpenAI-compatible provider
      mock.py            No-cost testing provider
      local.py           Ollama local provider
      hybrid.py          Local-first with cloud fallback
      registry.py        Provider initialization
    middleware/           AI middleware pipeline
      capability_scanner.py   Backend + frontend capability detection
      scheduler.py           7 task-type scheduling
      confidence_gate.py     Response quality gating
      offline_queue.py       Offline task buffering
      privacy_guard.py       PII detection + document safety
      ai_router.py           Provider routing decisions
      llm_settings.py        DB → header → .env settings resolver
    services/             Business logic
      llm_service.py      LLM orchestration
      credit_service.py   Credit accounting
      ai_citation_service.py  Citation generation
  alembic/               Database migrations
  tests/                 pytest test suite (38 tests)
  init_data.sql          Database seed data + schema reference
  pyproject.toml         Python dependencies (uv)

frontend/
  src/
    pages/                Route-level components
      Library.tsx          Book grid/list with search, share, upload
      Reader.tsx           Reading interface with AI panel
      Admin.tsx            Admin dashboard (5 tabs)
      Settings.tsx         Theme, language, keyboard shortcuts, LLM config
      Profile.tsx          User profile + weekly summary
      Review.tsx           Spaced repetition review
      KnowledgeGraph.tsx   Knowledge graph visualization
      Billing.tsx          Credit management + purchase
      Login.tsx / Register.tsx  Auth pages
    components/            Reusable components
      NativePDFViewer.tsx  Canvas-based PDF viewer (mobile)
      PDFViewer.tsx        react-pdf viewer (desktop)
      EPUBViewer.tsx       EPUB viewer with TOC
      MarkdownViewer.tsx   Markdown renderer (math, mermaid, SMILES)
      AIPanel.tsx          Unified agent chat
      BookCard.tsx         Book grid card
      BookListRow.tsx      Book list row
      Layout.tsx           App shell (AppBar, nav, admin button)
      ProtectedRouter.tsx  Auth guard
      Toast/               Toast notification system
    services/              Client-side services
      pageCache.ts         IndexedDB page cache + preloader
      fileCache.ts         EPUB file IndexedDB cache
      chunkCache.ts        Embedding chunk cache
      localSearch.ts       Keyword + vector hybrid local search
      capabilities.ts      Frontend capability reporting
    hooks/                 Custom hooks
      useAuth.ts           Auth state + localStorage sync
      useTTS.ts            Text-to-speech
      useKeyboardShortcuts.ts  Reader keyboard shortcuts
      useToast.ts          Toast notifications
      usePrivacyMode.ts    Privacy mode toggle
    i18n/                  Internationalization (zh/en)
    routers/               React Router config
    constants/             Shortcuts, theme configs
```

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account (auto-grant free credits) |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/currentuser` | Current user info (incl. `is_admin`) |

### Books
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/books` | List/search user books |
| POST | `/api/books` | Create book |
| GET | `/api/books/{id}/pages/{page}` | Get rendered page (image + text_lines) |
| GET | `/api/books/{id}/toc` | Table of contents |
| POST | `/api/books/{id}/share` | Share book (copy-on-write) |
| POST | `/api/books/{id}/unshare` | Remove shared copy |

### AI
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/books/{id}/qa` | Ask question about book |
| GET | `/api/books/{id}/summary` | Generate summary (templates: cornell, bullet_points, sq3r) |
| POST | `/api/books/{id}/agent` | Run LangChain agent with tool-calling |
| POST | `/api/books/{id}/agent/stream` | Streaming agent (SSE) |

### Learning
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/learning/notes` | List/create notes |
| PATCH/DELETE | `/api/learning/notes/{id}` | Update/delete note |
| GET/POST | `/api/learning/flashcards` | List/create flashcards |
| GET/POST | `/api/learning/review/due` | Due review items |
| POST | `/api/learning/review/{id}/rate` | Rate review (FSRS update) |

### Knowledge
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/knowledge/points` | Knowledge point CRUD |
| GET | `/api/knowledge/graph` | Full graph data |
| GET | `/api/knowledge/stats` | Graph statistics |

### Billing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/billing/stats` | Balance + usage stats |
| GET | `/api/billing/usage` | Token usage by capability |
| GET | `/api/billing/packs` | Available credit packs |
| POST | `/api/billing/purchase` | Purchase pack |
| GET | `/api/billing/transactions` | Transaction history |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/llm` | Get LLM config (provider, model, key, etc.) |
| PUT | `/api/settings/llm` | Update LLM config |

### Admin (requires `is_admin`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard` | Overview stats |
| GET | `/api/admin/users` | List users (searchable, paginated) |
| PUT | `/api/admin/users/{id}` | Update user (toggle admin, rename) |
| GET | `/api/admin/books` | List all books (searchable) |
| DELETE | `/api/admin/books/{id}` | Delete any book |
| GET | `/api/admin/credits/transactions` | All credit transactions |
| POST | `/api/admin/credits/grant` | Grant credits to user |
| GET | `/api/admin/embeddings` | Chunk listing (searchable) |
| POST | `/api/admin/embeddings/delete-unindexed` | Delete chunks without embeddings |

## Testing

```bash
# Backend (38 tests)
cd backend && uv run pytest tests/ -v

# Frontend type check
cd frontend && yarn tsc --noEmit
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development` / `testing` / `production` |
| `DATABASE_URL` | `sqlite:///./smart_reader.db` | Database connection |
| `SECRET_KEY` | `your-secret-key-here` | JWT signing key |
| `LLM_PROVIDER` | `mock` | `mock` / `openai` / `ollama` |
| `LLM_MODEL` | `llama3` | Model name |
| `LLM_BASE_URL` | `http://localhost:11434` | LLM API endpoint |
| `LLM_API_KEY` | — | API key for cloud provider |
| `FREE_MONTHLY_CREDITS` | `1000000` | Monthly credit refill |
| `ADMIN_USERNAME` | `admin` | Default admin username |
| `ADMIN_PASSWORD` | `admin123` | Default admin password |
| `ADMIN_EMAIL` | `admin@smartreader.local` | Default admin email |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer model |

## Document Metadata

| File | Purpose |
|------|---------|
| `PLAN.md` | Feature roadmap + implementation status (Weeks 1-9) |
| `ARCHITECTURE.md` | Mermaid diagrams: system overview, 5-layer architecture, search pipeline, provider routing, sharing sequence, component tree, ER diagram |
| `DB_RELATIONSHIP.md` | Database entity relationship map |
| `TEST.md` | Test architecture + patterns |

## Contributing

1. Fork → branch → pull request
2. Describe changes and add tests where applicable
3. Backend: run `uv run pytest tests/` before submitting
4. Frontend: run `yarn tsc --noEmit` before submitting

## Contact

- Maintainer: crossSulation
- Repo: https://github.com/crossSulation/smart-reader
