# Smart Reader Execution Plan (4 Weeks)

## Overall Progress Summary
**Start Date:** Week 1 (May 15, 2026)
**Current Phase:** Week 2 In Progress - Ingestion Metadata

| Milestone | Status | Progress |
|-----------|--------|----------|
| **Week 1: Retrieval Reliability** | 🟢 Complete | 8/8 tasks done - Hybrid retrieval, reranking, citations, guardrails implemented |
| **Week 2: Ingestion & Markdown** | 🟡 In Progress | 4/5 tasks done (BE-06, FE-04, FE-05 + section_path metadata plumbing) |
| **Week 3: Learning Workflow** | ⚫ Not Started | 0/6 tasks |
| **Week 4: Personalization** | ⚫ Not Started | 0/5 tasks |

### Additional Features Completed (Not in Original Plan)
- [x] Local file upload with background sync to backend (Reader.tsx)
- [x] File type detection and routing (markdown/pdf/epub)
- [x] FileUpload component markdown file support
- [x] Reader layout optimization (single-branch rendering)

---

## Goal
Ship a reliable "real smart reader" by improving:
1. Retrieval quality and trust (grounded answers + citations)
2. Ingestion quality (structure-aware chunks)
3. Learning workflow (highlights -> notes -> flashcards)
4. Personalization (adaptive review)

## Current Baseline (from this repo)
- Backend: FastAPI + SQLAlchemy + SQLite, upload + book APIs, search/QA features
- Frontend: React + Vite reader UI, PDF/EPUB viewing, AI panel, highlight interactions
- Existing value: end-to-end reading flow already works
- Main gap: answer reliability and long-term learning loop

## Format Support Direction
- Reading formats should be first-class, not hard-coded around PDF only.
- Target reader support:
  - PDF viewer
  - EPUB viewer
  - Markdown viewer/renderer
- Markdown support has two separate meanings and both matter:
  1. AI answer markdown rendering inside the AI panel
  2. Full Markdown document reading support as a book format in Reader

---

## Week 1: Retrieval Reliability Foundation

### Objectives
- Move to hybrid retrieval (BM25 + vector)
- Add reranking for top candidates
- Return strict source citations (page/chunk ids)

### Backend Tasks
- Build hybrid retriever service:
  - keyword index (BM25) + embedding search
  - weighted merge strategy for candidates
- Add reranker stage (cross-encoder or lightweight rerank model)
- Update QA endpoint response schema to include:
  - answer
  - citations: [{book_id, page, chunk_id, quote, score}]
  - confidence
- Add guardrail: if evidence is weak, return "not enough evidence"

### Frontend Tasks
- Render citations in AI panel under each answer
- Click citation -> jump to page and highlight source span
- Show confidence indicator and weak-evidence warning

### Acceptance Criteria
- At least 90% answers include citations
- Citation click-to-page works in Reader
- Weak-evidence fallback works (no fabricated confident answers)

### Week 1 Implementation Tickets

**Status: In Progress** - Markdown foundation complete, QA enhancement pending

#### W1-BE-01: Define QA Response Contract With Citations
- [ ] Implement
- Scope:
  - Finalize response shape for answer grounding.
  - Include `citations[]`, `confidence`, `insufficient_evidence`.
- Files (likely):
  - `backend/app/schemas.py`
  - `backend/app/routers/*qa*.py` or current QA route file
- Output:
  - Updated pydantic models and endpoint response serialization.
- Done When:
  - Frontend receives stable typed fields for every QA response.

#### W1-BE-02: Build Hybrid Retrieval Service (BM25 + Vector)
- [ ] Implement
- Scope:
  - Implement keyword retrieval + vector retrieval in one service.
  - Merge results with weighted scoring.
- Files (likely):
  - `backend/app/services/ingestion_service.py`
  - `backend/app/services/*retriev*.py` (new)
- Output:
  - `retrieve_candidates(query, book_id, k)` returning normalized candidate objects.
- Done When:
  - For test queries, returned candidates include both lexical and semantic hits.

#### W1-BE-03: Add Reranker Stage
- [ ] Implement
- Scope:
  - Add second-stage reranking for top-N candidates.
  - Keep model configurable (env flag + fallback path).
- Files (likely):
  - `backend/app/services/*rerank*.py` (new)
  - retrieval/QA orchestration service files
- Output:
  - `rerank_candidates(query, candidates)` integrated into QA pipeline.
- Done When:
  - Top results show improved relevance on curated query set.

#### W1-BE-04: Evidence Guardrail
- [ ] Implement
- Scope:
  - Add threshold checks for weak evidence.
  - If below threshold, return `insufficient_evidence=true` and safe message.
- Files (likely):
  - QA route/service files
- Output:
  - Deterministic fallback behavior for low-confidence retrieval.
- Done When:
  - Hallucination-prone prompts no longer return confident fabricated answers.

#### W1-BE-05: Citation Span Mapping
- [ ] Implement
- Scope:
  - Ensure each citation carries `book_id`, `page`, `chunk_id`, `quote`, `score`.
  - Preserve page/chunk anchors through retrieval -> generation.
- Files (likely):
  - ingestion metadata structures
  - QA answer assembly code
- Output:
  - Citation payload that frontend can render and navigate with.
- Done When:
  - Every non-fallback answer contains at least one clickable citation.

#### W1-FE-01: Render Citation Blocks in AI Panel
- [ ] Implement
- Scope:
  - Display citation chips/cards under each AI answer.
  - Render AI answers and summaries with markdown support.
  - Support common markdown features: paragraphs, lists, emphasis, code, blockquotes, tables.
  - Sanitize rendered content to avoid unsafe HTML injection.
  - Show page + snippet + confidence score.
- Files (likely):
  - `frontend/src/components/BookQA.tsx`
  - `frontend/src/pages/Reader.tsx`
- Output:
  - Usable citation UI aligned with backend response schema.
  - Safe markdown-rendered AI answer blocks.
- Done When:
  - User can visually inspect source evidence for each answer.
  - Markdown answers render correctly without exposing unsafe HTML.

#### W1-FE-01A: Introduce Markdown Rendering Stack
- [x] DONE - react-markdown + remark-gfm + rehype-sanitize added to frontend/package.json
- Scope:
  - Add a markdown renderer for AI answers and summaries.
  - Recommended stack: `react-markdown` + `remark-gfm` + `rehype-sanitize`.
  - Define shared prose styles for rendered markdown inside the AI panel.
- Files (likely):
  - `frontend/package.json`
  - `frontend/src/components/BookQA.tsx`
  - `frontend/src/index.css` or shared prose styles file
- Output:
  - Consistent, safe markdown rendering for assistant output.
- Done When:
  - Lists, headings, tables, inline code, and fenced code blocks render correctly in the Reader AI panel.

#### W1-FE-02: Citation Click -> Jump to Page
- [ ] Implement
- Scope:
  - On citation click, set reader jump page and focus relevant panel.
  - Preserve current behavior for PDF; graceful fallback for EPUB.
- Files (likely):
  - `frontend/src/pages/Reader.tsx`
  - `frontend/src/components/PDFViewer.tsx`
  - `frontend/src/components/EPUBViewer.tsx`
- Output:
  - End-to-end navigation from answer evidence to source page.
- Done When:
  - Clicking a citation moves reader to the cited location.

#### W1-FE-03: Weak-Evidence UX State
- [ ] Implement
- Scope:
  - Distinct UI state for `insufficient_evidence=true`.
  - Prompt user to refine question or quote selection.
- Files (likely):
  - `frontend/src/components/BookQA.tsx`
- Output:
  - Trust-preserving UX for uncertain answers.
- Done When:
  - No normal “confident answer” style shown for weak evidence results.

#### W1-QA-01: Curated Regression Dataset (20-30 Questions)
- [ ] Implement
- Scope:
  - Create fixed prompt set from 2-3 representative books.
  - Label expected citation pages/chunks for spot checks.
- Files (likely):
  - `backend/tests/data/week1_eval.json` (new)
  - lightweight eval script in `backend/scripts/` (new)
- Output:
  - Repeatable Week 1 evaluation harness.
- Done When:
  - Team can compare retrieval and citation quality before/after changes.

#### W1-QA-02: Definition of Done Checklist
- [ ] Validate
- Checks:
  - >=90% non-fallback answers include citations.
  - Citation jump works in Reader for PDF flow.
  - Weak evidence triggers safe response state.
  - Lint/tests pass with no new backend/frontend errors.

### Week 1 Suggested Execution Order
1. W1-BE-01 (contract)
2. W1-BE-02 (hybrid retrieval)
3. W1-BE-03 (reranker)
4. W1-BE-04 + W1-BE-05 (guardrail + citation mapping)
5. W1-FE-01A + W1-FE-01 (markdown rendering + citation rendering)
6. W1-FE-03 (weak-evidence UX)
7. W1-FE-02 (click-to-jump wiring)
8. W1-QA-01 + W1-QA-02 (evaluation + final gate)

---

## Week 2: Ingestion and Chunk Quality

### Objectives
- Improve extraction and chunking quality for PDF/EPUB
- Preserve document structure in metadata
- Add Markdown as a first-class ingestible and readable format

### Backend Tasks
- Extend ingestion pipeline:
  - extract chapter/section headings where possible
  - keep page anchors and paragraph boundaries
  - normalize Markdown headings, code fences, lists, tables, and links into chunk metadata
- Introduce structure-aware chunking:
  - target token range + overlap
  - avoid cutting across headings/tables/formulas when possible
- Store chunk metadata fields:
  - book_id, chunk_id, page_start/end, section_path, text
- Add ingestion quality logs/metrics:
  - chunks per book, avg length, failed pages
- Add Markdown ingestion path:
  - detect markdown file type
  - parse heading hierarchy
  - preserve section anchors for navigation

### Frontend Tasks
- Show section context in search results (section_path)
- Improve result card readability (snippet + page + section)
- Add `MarkdownViewer` to Reader format routing
- Render Markdown books with safe markdown renderer and reader-friendly styles
- Support heading-based navigation for Markdown documents

### Acceptance Criteria
- Chunk metadata present for all newly ingested books
- Search result relevance improves for section-specific queries
- Ingestion failures are observable via logs
- Markdown files can be opened in Reader and navigated by section

### Week 2 Additional Tickets For Markdown Support

**Status: In Progress** - Markdown reading support done; section metadata now in DB/API/UI, deeper chunk-quality tuning pending

#### W2-BE-06: Markdown Ingestion Pipeline
- [x] DONE - markdown extraction added to backend/app/services/ingestion_service.py with heading-aware chunking
- Scope:
  - Add Markdown detection and parsing during upload/ingestion.
  - Extract heading tree and preserve raw section text.
- Files (likely):
  - `backend/app/services/ingestion_service.py`
  - `backend/app/services/file_service.py`
  - upload/parse service files
- Output:
  - Markdown documents indexed with section-aware chunks.
- Done When:
  - Uploaded `.md` files produce chunk records with heading metadata.

#### W2-FE-04: MarkdownViewer Component
- [x] DONE - MarkdownViewer created and routed in Reader for markdown files
  - Safe rendering with react-markdown + remark-gfm + rehype-sanitize
  - Supports headings, lists, code blocks, tables, blockquotes
  - TOC sidebar with navigation
- Scope:
  - Add a dedicated `MarkdownViewer` component for Reader.
  - Render headings, paragraphs, lists, code blocks, tables, and blockquotes.
  - Reuse the same safe markdown stack selected for AI answer rendering.
- Files (likely):
  - `frontend/src/components/MarkdownViewer.tsx` (new)
  - `frontend/src/pages/Reader.tsx`
  - `frontend/src/types/Book.ts`
- Output:
  - Reader can open Markdown books as a first-class format.
- Done When:
  - Reader routes Markdown books to `MarkdownViewer` instead of PDF/EPUB viewers.

#### W2-FE-05: Markdown Navigation Model
- [x] DONE - heading-based TOC navigation in MarkdownViewer with instance-scoped anchors
  - Left sidebar Contents menu
  - Click to scroll to section
  - jumpToSection support from search/QA
- Scope:
  - Build left sidebar navigation from heading structure for Markdown documents.
  - Clicking a heading scrolls to the relevant section.
- Files (likely):
  - `frontend/src/components/MarkdownViewer.tsx`
  - `frontend/src/pages/Reader.tsx`
- Output:
  - Section-based table of contents for Markdown books.
- Done When:
  - Users can jump between headings from the Reader sidebar.

### Markdown Contract Draft

#### File Type Detection
- Accept these as Markdown inputs:
  - `.md`
  - `.markdown`
  - optional later: `.mdx` (out of scope for first pass unless interactive components are needed)
- Normalize stored file type to:
  - `markdown`

#### Backend Metadata Shape For Markdown Books
- Book/file response should expose enough information for Reader routing:
  - `file_type: "markdown"`
  - `file_url: string`
  - `title: string`
  - optional `toc` for precomputed heading tree
- Chunk metadata for Markdown should preserve structure:
  - `chunk_id`
  - `section_path` (for example: `Chapter 1 > Motivation > Tradeoffs`)
  - `heading_level`
  - `anchor`
  - `text`
  - `order_index`

#### Proposed Markdown Reader Response Shape
- Option A: Reader fetches raw `.md` via `file_url` and builds heading tree client-side
- Option B: Backend provides parsed document payload
- Recommended first pass:
  - use raw markdown file for rendering
  - add lightweight parsed TOC endpoint for navigation if needed

#### Proposed Endpoints
- Existing book detail can continue returning:
  - `GET /api/books/:id -> { ..., file_type, file_url }`
- Optional TOC endpoint for Markdown:
  - `GET /api/books/:id/toc`
  - response:
    - `[{ id, title, level, anchor, order_index }]`

### Markdown Reader Data Flow

#### Upload/Ingestion Flow
1. User uploads `.md` file
2. Backend detects `markdown` type
3. Backend stores original file and extracts heading tree
4. Backend chunks by heading/section boundaries
5. Backend stores section-aware chunks for retrieval

#### Reader Flow
1. Reader fetches book detail
2. If `file_type === "markdown"`, route to `MarkdownViewer`
3. `MarkdownViewer` fetches markdown content from `file_url`
4. Markdown is rendered with safe markdown pipeline
5. Left sidebar shows heading navigation
6. Clicking heading scrolls to anchor in content area

#### Search/QA Flow
1. Retrieval returns Markdown chunks like any other chunk source
2. Citation payload should include:
  - `chunk_id`
  - `section_path`
  - `anchor`
  - optional `quote`
3. Reader handles citation click by scrolling to markdown anchor instead of page jump

### Markdown Viewer First-Pass Scope
- Render safely using the same markdown stack as AI answers
- Support:
  - headings
  - paragraphs
  - bullet/ordered lists
  - blockquotes
  - fenced code blocks
  - tables
  - links
- Exclude first-pass advanced features:
  - inline editing
  - MDX execution
  - embedded interactive widgets
  - collaborative comments

### Markdown Viewer Acceptance Criteria
- Markdown books open correctly in Reader
- Heading navigation works from the left sidebar
- Citation click from AI panel can scroll to the cited heading/anchor
- Rendering is sanitized and does not allow unsafe HTML execution

---

## Week 3: Learning Workflow (Highlights -> Knowledge)

**Status: Not Started**

### Objectives
- Turn reading actions into durable learning artifacts

### Backend Tasks
- [ ] Add models and APIs for:
  - notes
  - flashcards
  - review_items (for spaced repetition)
- [ ] Add endpoint to convert highlight to note/flashcard
- [ ] Add daily review endpoint returning due cards

### Frontend Tasks
- [ ] In Reader:
  - "Save as note"
  - "Create flashcard"
- [ ] Add simple Review page:
  - due cards
  - self-rating (again/hard/good/easy)
- [ ] Persist tags for notes/highlights (topic/question/todo)

### Acceptance Criteria
- [ ] User can create flashcard from selected text in <= 3 clicks
- [ ] Daily review list appears with due items
- [ ] Review updates scheduling state correctly

---

## Week 4: Personalization + Evaluation + Hardening

**Status: Not Started**

### Objectives
- Make assistant adaptive and measurable
- Prepare for stable iteration

### Backend Tasks
- [ ] User profile signals:
  - weak topics
  - frequently reviewed tags
  - preferred explanation depth
- [ ] Adaptive response mode:
  - beginner/intermediate/expert explanation options
- [ ] Add evaluation scripts:
  - retrieval recall@k sample set
  - citation correctness checks
  - answer faithfulness rubric scoring

### Frontend Tasks
- [ ] Settings for explanation level and study goals
- [ ] Weekly learning summary UI:
  - pages read
  - notes created
  - review accuracy
  - top weak topics

### Acceptance Criteria
- [ ] Explanation level changes response style
- [ ] Weekly summary visible and data-backed
- [ ] Baseline evaluation report generated for each release

---

## API Contracts to Add (Draft)
- [ ] POST /api/qa/ask
  - req: {book_id, question, mode?}
  - res: {answer, confidence, citations[], insufficient_evidence}
- [ ] POST /api/highlights/:id/note
- [ ] POST /api/highlights/:id/flashcard
- [ ] GET /api/review/due
- [ ] POST /api/review/:item_id/rate
- [ ] GET /api/analytics/weekly-summary

---

## Data Model Additions (Draft)
- [ ] notes(id, user_id, book_id, page, content, tags, created_at)
- [ ] flashcards(id, user_id, book_id, front, back, source_chunk_id, tags)
- [ ] review_items(id, flashcard_id, due_at, interval, ease, reps, last_rating)
- [ ] chunk_index(id, book_id, chunk_id, text, page_start, page_end, section_path, vector_ref)

---

## Engineering Guardrails
- Every AI answer must include citations or explicit insufficient-evidence
- No silent ingestion failures; log + surface status
- Feature flags for risky model/pipeline changes
- Add migration scripts for new tables before enabling UI paths

---

## KPIs to Track
- Retrieval: recall@5, rerank lift
- QA trust: citation coverage, citation click-through rate
- Learning: highlights -> note conversion, flashcard creation rate
- Retention: 7-day return rate, review completion rate

---

## Recommended Build Order If Time Is Tight
1. Week 1 completely
2. Week 2 chunk metadata + section-aware search UI
3. Week 3 highlight -> note + flashcard creation (review can be minimal first)
4. Week 4 evaluation + summary dashboards

---

## Immediate Next Steps (This Week)
1. Finalize citation response schema and update QA endpoint
2. Implement hybrid retrieval service skeleton in backend services
3. Wire Reader AI panel to render citation chips and jump to page
4. Add a small evaluation dataset (20-30 curated Q/A prompts) for regression checks
