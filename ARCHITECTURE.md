# Smart Reader Architecture

> Last updated: 2026-08-01
> Status: Phase 0-6 complete, Phase 7 (testing) remaining

---

## System Overview

```mermaid
graph TB
    subgraph Frontend["Frontend (React + Vite + Tauri)"]
        UI["React UI (MUI + Tailwind)"]
        TWorker["Transformers.js Worker<br/>all-MiniLM-L6-v2"]
        IDB["IndexedDB<br/>chunk cache"]
        TauriSQLite["Tauri SQLite<br/>file cache"]
    end

    subgraph Backend["Backend (FastAPI + SQLAlchemy)"]
        Router["Routers (ai / books / knowledge / learning / upload)"]
        
        subgraph Middleware["AI Middleware"]
            CS["CapabilityScanner"]
            Scheduler["Scheduler"]
            CG["ConfidenceGate"]
            OQ["OfflineQueue"]
            PG["PrivacyGuard"]
        end

        subgraph Providers["AI Providers"]
            CloudP["CloudProvider<br/>(OpenAI / DeepSeek)"]
            MockP["MockProvider<br/>(dev/stub)"]
            LocalP["LocalProvider<br/>(Ollama)"]
            HybridP["HybridLLMProvider<br/>(local-first, cloud-fallback)"]
            Registry["ProviderRegistry"]
        end

        subgraph Services["Services"]
            Embed["Embedding Service<br/>(sentence-transformers)"]
            Rerank["Reranker Service<br/>(cross-encoder)"]
            KG["Knowledge Graph Builder<br/>(LLM + embedding)"]
            FSRS["FSRS Scheduler<br/>(pure math)"]
            FileS["File Service<br/>(upload/OSS)"]
        end

        DB["SQLite"]
    end

    UI --> Router
    Router --> Middleware
    Middleware --> Registry
    Registry --> CloudP
    Registry --> MockP
    Registry --> LocalP
    Registry --> HybridP
    CloudP --> Embed
    CloudP --> Rerank
    CloudP --> KG
    Router --> Services
    Services --> DB
    TWorker -.->|postMessage| UI
    IDB -.->|embedding cache| UI
    TauriSQLite -.->|file cache| UI
```

---

## Multi-Layer Architecture

```mermaid
graph TB
    subgraph L1["Layer 1 — User Interface (React + Tauri)"]
        direction LR
        ReaderP["Reader<br/>(PDF / EPUB / Markdown / local file)"]
        LibraryP["Library<br/>(search / groups / share / unshare)"]
        KGP["Knowledge Graph<br/>(canvas + list + detail)"]
        ReviewP["Review<br/>(FSRS flashcards + notes)"]
        SettingsP["Settings<br/>(language / theme / privacy)"]
    end

    subgraph L2["Layer 2 — AI Middleware (FastAPI)"]
        direction LR
        Scanner["CapabilityScanner<br/>Ollama probe, online status"]
        Sched["Scheduler<br/>task → RouteDecision"]
        Gate["ConfidenceGate<br/>confidence < 0.6 → cloud"]
        Queue["OfflineQueue<br/>pending + retry + flush"]
        Guard["Privacy Guard<br/>X-Privacy-Mode → 403 cloud"]
    end

    subgraph L3["Layer 3 — Provider Abstraction"]
        direction LR
        AIFace["interface AIProvider"]
        CloudP["CloudProvider<br/>(OpenAI / DeepSeek API)"]
        LocalP["LocalProvider<br/>(Ollama REST)"]
        MockP["MockProvider<br/>(dev stub + KP mock)"]
        HybridP["HybridLLMProvider<br/>(local-first → cloud fallback)"]
        Registry["ProviderRegistry<br/>(singleton, startup init)"]
    end

    subgraph L4["Layer 4 — AI Services"]
        direction LR
        EmbedSvc["Embedding<br/>sentence-transformers<br/>all-MiniLM-L6-v2 (384d)"]
        RerankSvc["Reranker<br/>cross-encoder<br/>ms-marco-MiniLM-L-6-v2"]
        RetrievalSvc["HybridRetriever<br/>BM25(0.3) + Vector(0.7)"]
        KGSvc["Knowledge Extraction<br/>LLM batch extract + relate"]
        FSRSSvc["FSRS Scheduler<br/>pure math, zero network"]
        FileSvc["File Service<br/>upload / OSS / cache"]
    end

    subgraph L5["Layer 5 — Storage"]
        direction LR
        SQLiteS["SQLite (server)<br/>books, chunks, users, shares"]
        IDB["IndexedDB (browser)<br/>chunk embedding cache"]
        TauriDB["Tauri SQLite (desktop)<br/>file blob cache"]
        OSS["Object Storage<br/>local / S3 / Aliyun OSS"]
    end

    L1 --> L2
    L2 --> L3
    L3 --> L4
    L4 --> L5
```

```mermaid
graph TB
    subgraph L1F["Frontend Local Runtime"]
        direction LR
        Tjs["Transformers.js Worker<br/>all-MiniLM-L6-v2 (384d)<br/>model download progress"]
        LocalEmb["localEmbedding.ts<br/>worker first → server fallback"]
        LocalSearchF["localSearch.ts<br/>keyword(0.3) + vector(0.7)"]
        ChunkCache["chunkCache.ts<br/>IndexedDB chunk store"]
        CapReport["capabilities.ts<br/>startup → POST /api/capabilities/report"]
    end

    subgraph L2B["Backend Search Pipeline"]
        direction LR
        GlobalSearch["GET /api/books/search"]
        KpSearch["GET /api/knowledge/points?search="]
        QAEndpoint["POST /api/books/{id}/qa<br/>hybrid + rerank + LLM"]
    end

    Tjs --> LocalEmb
    LocalEmb --> LocalSearchF
    ChunkCache --> LocalSearchF
    LocalSearchF -->|"score < 0.5 → fallback"| GlobalSearch
    QAEndpoint --> RetrievalSvc
    RetrievalSvc --> RerankSvc
    KpSearch --> EmbedSvc
```

```mermaid
graph TB
    subgraph ShareFlow["Book Sharing Flow"]
        direction LR
        ShareAPI["POST /{book_id}/share<br/>creates BookShare + Book copy"]
        UnshareAPI["DELETE /{book_id}/shares/{id}<br/>deletes copy + share row"]
        ListBooks["GET /api/books/<br/>returns owned + shared-by-me"]
        FileAccess["GET /files/download/{path}<br/>checks BookShare JOIN"]
    end

    subgraph PrivacyFlow["Privacy Mode Flow"]
        direction LR
        Toggle["Settings.tsx<br/>MUI Switch → localStorage"]
        Header["X-Privacy-Mode: true"]
        Middleware["privacy_middleware<br/>blocks /search, /embed → 403"]
        DocSafety["validate_document_safety()<br/>QA/summary: >10K chars → 400"]
        ProviderLabel["provider = 'local-{name}'"]
    end

    Toggle --> Header
    Header --> Middleware
    Middleware --> DocSafety
    DocSafety --> ProviderLabel
```

```mermaid
graph TB
    subgraph ReaderComp["Reader Page Components"]
        direction LR
        HeaderR["Header<br/>back / title / Open local"]
        PDF["NativePDFViewer / PDFViewer"]
        EPUB["EPUBViewer<br/>onProgressChange"]
        MD["MarkdownViewer<br/>section jump + sidebar"]
        AIPanelR["AIPanel<br/>chat / notes / KPs"]
        TTS["TTSControlBar<br/>Web Speech API"]
        SourceBadge["Provider Badge<br/>Mock · Local · Cloud"]
    end

    HeaderR --> PDF
    HeaderR --> EPUB
    HeaderR --> MD
    AIPanelR --> SourceBadge
```

```mermaid
graph TB
    subgraph KGFull["Knowledge Graph Page"]
        direction LR
        KGGraph["KnowledgeGraphCanvas<br/>force-directed canvas<br/>entity color + edge label"]
        KGList["KnowledgeList<br/>search input + filter<br/>concept / term / person / event"]
        KGDetail["KnowledgeDetail<br/>aliases / description<br/>source chunks / linked KPs"]
    end

    KGList -->|"select"| KGGraph
    KGList -->|"select"| KGDetail
    KGGraph -->|"click node"| KGDetail
    KGDetail -->|"navigate"| KGGraph
```

---

## Search Pipeline

```mermaid
flowchart TD
    Query["User Query"] --> LocalFirst{"Local available?"}
    
    LocalFirst -->|Yes| LocalHybrid["Frontend Local Search<br/>keyword(0.3) + vector(0.7)"]
    LocalFirst -->|No| ServerOnly["Server Search"]

    LocalHybrid --> LocalFilter["Filter score ≥ 0.5"]
    LocalFilter --> Show["Show results immediately"]
    
    LocalHybrid -->|"top1 < 0.5"| ServerSearch["Server Search<br/>(runs in parallel)"]

    ServerSearch --> TitleMatch["Stage 1: Title/author substring"]
    TitleMatch --> HybridRet["Stage 2: BM25(0.3) + Vector(0.7)<br/>HybridRetriever"]
    HybridRet --> Dedup["Stage 3: Book-level dedup"]
    Dedup --> Rerank["Stage 4: Cross-Encoder Rerank<br/>ms-marco-MiniLM-L-6-v2"]
    Rerank --> Normalize["Min-max normalize → 0..1"]
    Normalize --> ServerFilter["Filter score ≥ 0.5"]

    ServerFilter --> Compare{"server top1 > local top1?"}
    Compare -->|Yes| Replace["Replace with server results"]
    Compare -->|No| Keep["Keep local results"]
```

---

## AI Provider Routing

```mermaid
flowchart TD
    Request["AI Request<br/>(QA / summary / agent / quiz)"] --> Privacy{"X-Privacy-Mode?"}

    Privacy -->|true| LocalOnly["LOCAL ONLY"]
    LocalOnly -->|complex_agent| Reject["REJECT (403)"]
    LocalOnly -->|knowledge_graph| Queue["QUEUE (offline)"]
    LocalOnly -->|other| TryLocal["Try LocalProvider"]

    Privacy -->|false| Classify["Scheduler.classify(task)"]

    Classify -->|complex_agent| MustCloud["CLOUD (must)"]
    Classify -->|knowledge_graph| MustCloud
    Classify -->|rag_qa/summary| LocalFirst["LOCAL preferred"]
    Classify -->|quiz| CloudFirst["CLOUD preferred"]

    LocalFirst --> CheckLocal{"LocalProvider<br/>available?"}
    CheckLocal -->|Yes| ExecLocal["Execute Local"]
    CheckLocal -->|No| FallbackCloud["Fallback CLOUD"]

    ExecLocal --> Confidence{"Confidence ≥ 0.6?"}
    Confidence -->|Yes| Return["Return result"]
    Confidence -->|No| Upgrade["Upgrade to CLOUD"]

    MustCloud --> Return
    FallbackCloud --> Return
    Upgrade --> Return
    TryLocal -->|available| ExecLocal
    TryLocal -->|unavailable| Return
    CloudFirst --> Return
```

---

## Data Flow: Book Sharing

```mermaid
sequenceDiagram
    actor Owner as Book Owner
    participant FE as Frontend
    participant API as /api/books
    participant DB as SQLite

    Owner->>FE: Click "Share" on book
    FE->>API: POST /{book_id}/share {username}
    API->>DB: Verify book ownership
    API->>DB: INSERT BookShare
    API->>DB: INSERT Book copy (owner=target, shared_by=owner_name, original_book_id=source.id)
    API-->>FE: {shared_book_id, shared_with}

    actor Recipient as Recipient
    Recipient->>FE: Refresh Library
    FE->>API: GET /api/books/
    API->>DB: SELECT books WHERE owner_id=recipient
    Note over DB: Returns owned + shared copies
    API-->>FE: [{...shared_by: "owner_name"...}]

    Recipient->>FE: Open shared book
    FE->>API: GET /api/books/{copyId}
    Note over Recipient: Has independent progress & notes
    FE->>API: GET /files/download/{path}
    Note over API: File access via BookShare JOIN
```

---

## Embedding & Local Search Architecture

```mermaid
flowchart TB
    subgraph Backend["Backend Python"]
        SentenceTF["sentence-transformers<br/>all-MiniLM-L6-v2 (384-dim)"]
        EmbedAPI["POST /api/embed"]
        ChunkAPI["GET /api/books/chunks/embeddings"]
    end

    subgraph Frontend["Frontend Browser"]
        Worker["Web Worker<br/>@xenova/transformers<br/>all-MiniLM-L6-v2 (384-dim)"]
        IDB["IndexedDB<br/>chunk cache"]
        LocalSearch["localSearch.ts<br/>keyword + vector hybrid"]
        EmbedRouter["localEmbedding.ts<br/>worker first → server fallback"]
        Progress["ModelDownloadProgress<br/>progress_callback → UI"]
    end

    ChunkAPI -->|"on load"| IDB
    Worker -->|"progress events"| Progress
    Worker -->|"embed query"| EmbedRouter
    EmbedRouter -->|"worker failed"| EmbedAPI
    EmbedRouter --> LocalSearch
    IDB --> LocalSearch
    SentenceTF --> EmbedAPI
    SentenceTF --> ChunkAPI
```

---

## Component Tree

```mermaid
graph TD
    App["App.tsx"]
    App --> Toast["ToastProvider"]
    App --> Theme["ThemeContext"]
    App --> Router["RouterContainer"]

    Router --> Layout["Layout.tsx"]
    Router --> Login["Login"]
    Router --> Register["Register"]

    Layout --> Offline["OfflineIndicator"]
    Layout --> ModelProgress["ModelDownloadProgress"]
    Layout --> SearchBar["SearchBar (header)"]
    Layout --> Nav["Navigation"]

    Nav --> Library["Library.tsx"]
    Nav --> Reader["Reader.tsx"]
    Nav --> KGPage["KnowledgeGraph.tsx"]
    Nav --> Review["Review.tsx"]
    Nav --> Settings["Settings.tsx"]
    Nav --> Billing["Billing.tsx"]

    Library --> BookCard["BookCard"]
    Library --> BookListRow["BookListRow"]
    Library --> NoBooks["NoBooks"]
    Library --> FileUpload["FileUpload"]
    Library --> ShareDialog["ShareDialog (unshare)"]

    Reader --> PDFViewer["PDFViewer / NativePDFViewer"]
    Reader --> EPUBViewer["EPUBViewer"]
    Reader --> MarkdownViewer["MarkdownViewer"]
    Reader --> AIPanel["AIPanel"]
    Reader --> TTSBar["TTSControlBar"]

    AIPanel --> AgentChat["BookAgentChat"]
    AIPanel --> Notes["RecentNotesList"]
    AIPanel --> KPList["KnowledgePoints (sidebar)"]
    AgentChat --> SourceBadge["Provider Source Badge<br/>(Mock/Local/Cloud)"]

    KGPage --> KGCanvas["KnowledgeGraphCanvas"]
    KGPage --> KPList2["KnowledgeList"]
    KGPage --> KPDetail["KnowledgeDetail"]

    Review --> FlashCard["FlashCard"]
    Review --> NoteList["Note List"]

    Settings --> LangSwitch["LanguageSwitcher"]
    Settings --> ThemeToggle["ThemeSegmentedToggle"]
    Settings --> PrivacyToggle["Privacy Mode Switch"]
```

---

## Database Schema (Key Tables)

```mermaid
erDiagram
    users ||--o{ books : owns
    users ||--o{ book_shares : "owner_id"
    users ||--o{ book_shares : "shared_with_id"
    users ||--o{ knowledge_points : has
    users ||--o{ flashcards : has

    books ||--o{ document_chunks : contains
    books ||--o{ book_comments : has
    books ||--o{ book_shares : "book_id"
    books ||--o| books : "original_book_id"

    files ||--o{ books : "uploaded file"

    knowledge_points ||--o{ knowledge_links : "source"
    knowledge_points ||--o{ knowledge_links : "target"

    flashcards ||--o{ review_items : generates
    learning_notes }o--|| books : belongs_to

    offline_queue }o--|| users : queued_by

    users {
        int id
        string username
        string email
        string fsrs_params
    }

    books {
        int id
        int owner_id
        string title
        string shared_by
        int original_book_id
        int current_page
        real progress_percentage
        datetime last_read_time
    }

    book_shares {
        int id
        int book_id
        int owner_id
        int shared_with_id
        datetime created_at
    }
```

---

## Key Design Rules

| Rule | Implementation |
|------|---------------|
| **Never send document text to cloud in privacy mode** | `PrivacyGuard` middleware returns 403 for `/api/books/search`, `/api/embed` when `X-Privacy-Mode: true`; `validate_document_safety()` blocks >10K char context in QA/summary |
| **Local providers must NOT block the UI** | Transformers.js runs in Web Worker; Ollama calls handled server-side |
| **Storage dual-path** | Desktop (Tauri): SQLite file cache; Browser: IndexedDB chunk cache + file cache |
| **User always knows the source** | AI reply shows "Mock" / "Local" / "Cloud" badge via `BookAgentChat` provider tag |
| **Search quality** | 4-stage pipeline: Title match → BM25+Vector hybrid → Book dedup → Cross-encoder rerank → Score threshold 0.5 |
| **Book sharing with independent copies** | Shared user gets own Book row with `shared_by` + `original_book_id`; independent progress/notes; original owner's file shared via BookShare JOIN |
