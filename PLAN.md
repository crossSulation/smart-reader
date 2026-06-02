# Smart Reader Execution Plan (4 Weeks)

## Overall Progress Summary
**Start Date:** Week 1 (May 15, 2026)
**Current Phase:** Post-Week 4 Hardening - Reader Learning UX Improvements

| Milestone | Status | Progress |
|-----------|--------|----------|
| **Week 1: Retrieval Reliability** | 🟢 Complete | 8/8 tasks done - Hybrid retrieval, reranking, citations, guardrails implemented |
| **Week 2: Ingestion & Markdown** | 🟢 Complete | 5/5 tasks done + TOC API, ingestion metrics, auto-indexing, indexed-status flag |
| **Week 3: Learning Workflow** | 🟢 Complete | 6/6 tasks done (notes/flashcards/review flow + tags + validation) |
| **Week 4: Personalization** | 🟢 Complete | 5/5 tasks done (profile + adaptive QA + eval/release checks) |

### Additional Features Completed (Not in Original Plan)
- [x] Local file upload with background sync to backend (Reader.tsx)
- [x] File type detection and routing (markdown/pdf/epub)
- [x] FileUpload component markdown file support
- [x] Reader layout optimization (single-branch rendering)
- [x] Section metadata (`section_path`) stored and returned in search/QA citations
- [x] Markdown TOC endpoint (`GET /api/books/{book_id}/toc`) and MarkdownViewer integration
- [x] Markdown renderer supports LaTeX math and SMILES chemical structure diagrams (both AI panel and document viewer)
- [x] Markdown document viewer now renders Mermaid diagrams from fenced `mermaid` code blocks
- [x] Ingestion quality metrics endpoint (`GET /api/books/{book_id}/ingestion-metrics`)
- [x] Auto-index after upload in Reader (background indexing status shown in UI)
- [x] Indexed-state API (`GET /api/books/{book_id}/indexed-status`) and Search UI hides redundant Index action
- [x] AI summary templating options in panel (Cornell, Bullet Points, SQ3R)
- [x] Summary response moved to JSON schema contract (`summary_json`) for frontend-driven rendering
- [x] Strict summary schema validation: backend now rejects invalid/mismatched LLM JSON (HTTP 502) instead of auto-normalizing
- [x] Reader notes panel for current book (`Recent Notes`) with live refresh after note creation
- [x] Reader note actions: click-to-jump (when page exists), inline edit, inline tag edit preview, and delete
- [x] Learning notes management APIs extended: list (`GET /api/learning/notes`), update (`PATCH /api/learning/notes/{note_id}`), delete (`DELETE /api/learning/notes/{note_id}`)

### Current Status Snapshot (June 2, 2026)
- [x] Backend ingestion pipeline supports PDF/EPUB/Markdown with structure-aware chunking
- [x] Chunk metadata includes page anchors and section path for grounding
- [x] Search and QA citation UI shows section context
- [x] Reader supports Markdown as first-class format with heading navigation
- [x] Indexing UX now has explicit state: not indexed, indexing, indexed
- [x] Week 3 data model and API foundation (notes/flashcards/review)
- [x] Week 4 personalization profile API + settings UI (explanation level, goals, weak topics, review tags)
- [x] Week 4 weekly summary API + profile dashboard card
- [x] Week 4 evaluation tooling (`week4_eval.py`) and release orchestration (`release_check.py`)
- [x] AI summary path is schema-first end-to-end (LLM JSON -> backend validation -> frontend template renderer)
- [x] Frontend summary renderer now consumes structured schema blocks per template (Cornell/Bullet Points/SQ3R)
- [x] Markdown renderer supports LaTeX math (`$inline$` / `$$block$$`) via `remark-math` + `rehype-katex` in both AI panel (`BookQA.tsx`) and document viewer (`MarkdownViewer.tsx`)
- [x] Markdown renderer supports SMILES chemical structure diagrams via `smiles-drawer` in both `BookQA.tsx` and `MarkdownViewer.tsx` (fenced code block tagged `smiles` or `smi`)
- [x] MarkdownViewer renders Mermaid diagrams for fenced `mermaid` blocks with inline fallback on render failure
- [x] Reader AI panel now shows recent notes for the active book with loading/error/empty states
- [x] Reader supports note lifecycle operations in-place: create, read/list, edit content, edit tags, delete
- [x] Reader note cards support page jump navigation for PDF-linked notes

### API Contract: Summary JSON Schema
- Endpoint: `GET /api/books/{book_id}/summary?template=cornell|bullet_points|sq3r`
- Response envelope fields:
  - `book_id: number`
  - `title: string`
  - `template: "cornell" | "bullet_points" | "sq3r"`
  - `summary_json: object` (shape depends on `template`)
  - `raw_output: string` (raw LLM output for debugging/audit)
  - `provider: string`
  - `chunks_used: number`
- Validation behavior:
  - Backend enforces strict schema matching by template.
  - Invalid JSON or mismatched schema returns HTTP `502`.

Template-specific `summary_json` shapes:

1. Cornell (`template=cornell`)
```json
{
  "template": "cornell",
  "cue_questions": ["string"],
  "notes": ["string"],
  "summary": ["string"]
}
```

2. Bullet Points (`template=bullet_points`)
```json
{
  "template": "bullet_points",
  "sections": [
    {
      "heading": "string",
      "bullets": ["string"]
    }
  ]
}
```

3. SQ3R (`template=sq3r`)
```json
{
  "template": "sq3r",
  "survey": ["string"],
  "question": ["string"],
  "read": ["string"],
  "recite": ["string"],
  "review": ["string"]
}
```

### Frontend Rendering Mapping (AI Panel)

`Frontend component:` `frontend/src/components/BookQA.tsx`

| Template | Schema Field | UI Block Rendered |
|----------|--------------|-------------------|
| `cornell` | `cue_questions[]` | **Cue / Questions** bullet list |
| `cornell` | `notes[]` | **Notes** bullet list |
| `cornell` | `summary[]` | **Summary** bullet list |
| `bullet_points` | `sections[].heading` | Section heading text |
| `bullet_points` | `sections[].bullets[]` | Bullet list under each section |
| `sq3r` | `survey[]` | **Survey** bullet list |
| `sq3r` | `question[]` | **Question** bullet list |
| `sq3r` | `read[]` | **Read** bullet list |
| `sq3r` | `recite[]` | **Recite** bullet list |
| `sq3r` | `review[]` | **Review** bullet list |

Notes:
- The frontend should treat schema fields as display-ready strings.
- Ordering in arrays is preserved during rendering.
- Missing required fields should be treated as API contract violation (backend returns `502`).

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

**Status: Complete** - Implemented and validated in regression runs (historical checklist retained below)

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

**Status: Complete** - Markdown reading + ingestion metadata + indexing observability shipped

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

**Status: Complete**

### Objectives
- Turn reading actions into durable learning artifacts

### Backend Tasks
- [x] Add models and APIs for:
  - notes
  - flashcards
  - review_items (for spaced repetition)
- [x] Add endpoint to convert highlight to note/flashcard
- [x] Add daily review endpoint returning due cards

### Frontend Tasks
- [x] In Reader:
  - "Save as note"
  - "Create flashcard"
- [x] Add simple Review page:
  - due cards
  - self-rating (again/hard/good/easy)
- [x] Persist tags for notes/highlights (topic/question/todo)

### Acceptance Criteria
- [x] User can create flashcard from selected text in <= 3 clicks
- [x] Daily review list appears with due items
- [x] Review updates scheduling state correctly

### Week 3 Validation Notes
1. Frontend build and type-check passed after learning UX integration.
2. Backend smoke validation passed for this flow:
  - create note with tags
  - create flashcard with tags
  - list due review items
  - rate review item and verify scheduling fields update

---

## Week 4: Personalization + Evaluation + Hardening

**Status: Complete**

### Objectives
- Make assistant adaptive and measurable
- Prepare for stable iteration

### Backend Tasks
- [x] User profile signals:
  - weak topics
  - frequently reviewed tags
  - preferred explanation depth
- [x] Adaptive response mode:
  - beginner/intermediate/expert explanation options
- [x] Add evaluation scripts:
  - retrieval recall@k sample set
  - citation correctness checks
  - answer faithfulness rubric scoring

### Frontend Tasks
- [x] Settings for explanation level and study goals
- [x] Weekly learning summary UI:
  - pages read
  - notes created
  - review accuracy
  - top weak topics

### Acceptance Criteria
- [x] Explanation level changes response style
- [x] Weekly summary visible and data-backed
- [x] Baseline evaluation report generated for each release

### Week 4 Validation Notes (Current)
1. Backend migration applied for user personalization fields.
2. New APIs available:
  - `GET/PUT /api/personalization/profile`
  - `GET /api/analytics/weekly-summary`
3. Profile page now includes personalization settings and weekly summary widgets.
4. QA prompt now adapts explanation style using saved user preference (`beginner`/`intermediate`/`expert`) in both main and legacy QA endpoints.
5. Evaluation scripts added:
  - `backend/scripts/week4_eval.py`
  - `backend/scripts/release_check.py`
6. Release-check smoke tested in local and strict modes.
7. API-backed strict release check passed with real book/token:
  - `python scripts/release_check.py --api-url http://127.0.0.1:8003 --book-id 2 --token <from .week1_token.txt> --strict`
8. Baseline report artifact generated:
  - `backend/tests/data/week4_eval_report.json`

---

## API Contracts (Implemented Snapshot)
- [x] `POST /api/books/{book_id}/qa`
  - req: `{ question, top_k }`
  - res: `{ answer, citations[], confidence, insufficient_evidence, provider }`
- [x] `GET /api/books/{book_id}/summary?template=cornell|bullet_points|sq3r`
  - res: `{ template, summary_json, raw_output, provider, chunks_used }`
- [x] `POST /api/learning/notes`
- [x] `GET /api/learning/notes?book_id=&limit=`
- [x] `PATCH /api/learning/notes/{note_id}`
- [x] `DELETE /api/learning/notes/{note_id}`
- [x] `POST /api/learning/flashcards`
- [x] `GET /api/learning/review/due`
- [x] `POST /api/learning/review/{item_id}/rate`
- [x] `GET /api/personalization/profile`
- [x] `PUT /api/personalization/profile`
- [x] `GET /api/analytics/weekly-summary`

---

## Data Model Snapshot (Implemented)
- [x] `notes(id, user_id, book_id, page, source_text, content, tags, created_at, updated_at)`
- [x] `flashcards(id, user_id, book_id, source_chunk_id, front, back, source_text, tags, created_at, updated_at)`
- [x] `review_items(id, flashcard_id, due_at, interval_days, ease_factor, reps, last_rating, created_at, updated_at)`
- [x] `document_chunks(..., page_start, page_end, section_path, token_count, embedding, indexed_at)`
- [x] `users(..., explanation_level, study_goal, weak_topics, frequently_reviewed_tags)`

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
1. Start next roadmap cycle planning (post-Week 4 backlog prioritization).
2. Add weak-topic review drill-down UX from weekly summary/profile analytics.
3. Add CI job to run `scripts/release_check.py --strict` on staging credentials.
4. Evaluate Mermaid code-splitting to reduce the frontend production bundle size.
