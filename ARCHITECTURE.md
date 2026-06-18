# AI Capability Routing Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │   Reader    │  │   AI Panel   │  │  Settings (privacy mode toggle) │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────────┬──────────────────┘ │
└─────────┼─────────────────┼─────────────────────────┼────────────────────┘
          │                 │                         │
          ▼                 ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED AI MIDDLEWARE                             │
│                                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Capability   │  │  Scheduler    │  │ Confidence  │  │ Offline      │ │
│  │ Scanner      │  │  (task-aware) │  │ Gate        │  │ Queue        │ │
│  └──────┬───────┘  └───────┬───────┘  └──────┬──────┘  └──────┬───────┘ │
│         │                  │                 │                │         │
└─────────┼──────────────────┼─────────────────┼────────────────┼─────────┘
          │                  │                 │                │
          ▼                  ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI BACKEND ABSTRACTION                            │
│                                                                          │
│    interface AIProvider {                                                │
│      generate(prompt, ctx) → AsyncStream<Chunk>                          │
│      embed(text) → number[]                                              │
│      rerank(query, docs) → ScoredDoc[]                                   │
│      isAvailable() → boolean                                             │
│    }                                                                     │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐ │
│  │   LOCAL PROVIDER    │  │   CLOUD PROVIDER    │  │  HYBRID PROVIDER  │ │
│  └─────────┬───────────┘  └─────────┬───────────┘  └─────────┬─────────┘ │
└────────────┼─────────────────────────┼────────────────────────┼──────────┘
             │                         │                        │
             ▼                         ▼                        ▼
┌────────────────────────┐  ┌─────────────────────────────────────────────┐
│     LOCAL RUNTIME      │  │              CLOUD API                       │
│                        │  │                                              │
│  ┌──────────────────┐  │  │  ┌──────────────────────────────────────┐   │
│  │ Ollama / Llama   │  │  │  │ Embedding Service                    │   │
│  │ (desktop LLM)    │  │  │  │ (remote embedding model)             │   │
│  ├──────────────────┤  │  │  ├──────────────────────────────────────┤   │
│  │ Transformers.js  │  │  │  │ LLM Service                          │   │
│  │ (browser embed)  │  │  │  │ (remote LLM API)                     │   │
│  ├──────────────────┤  │  │  ├──────────────────────────────────────┤   │
│  │ FSRS Scheduler   │  │  │  │ Reranker Service                     │   │
│  │ (pure math)      │  │  │  │ (cross‑encoder model)                │   │
│  ├──────────────────┤  │  │  ├──────────────────────────────────────┤   │
│  │ Tesseract WASM   │  │  │  │ Knowledge Graph Builder              │   │
│  │ (OCR)            │  │  │  │ (multi‑doc relation extraction)      │   │
│  ├──────────────────┤  │  │  └──────────────────────────────────────┘   │
│  │ Web Speech API   │  │  │                                              │
│  │ (TTS)            │  │  │                                              │
│  ├──────────────────┤  │  │                                              │
│  │ ONNX Runtime Web │  │  │                                              │
│  │ (rerank)         │  │  │                                              │
│  └────────┬─────────┘  │  │                                              │
│           │            │  │                                              │
│  ┌────────▼─────────┐  │  │                                              │
│  │  LOCAL STORAGE   │  │  │                                              │
│  │                  │  │  │                                              │
│  │  Desktop: SQLite │  │  │                                              │
│  │   (Tauri plugin) │  │  │                                              │
│  │  Browser:        │  │  │                                              │
│  │   IndexedDB      │  │  │                                              │
│  └──────────────────┘  │  │                                              │
└────────────────────────┘  └─────────────────────────────────────────────┘
```

---

## Task Routing Matrix

| Capability               | Priority            | Fallback         | Offline OK | Notes                         |
|--------------------------|---------------------|------------------|------------|-------------------------------|
| Embedding / Retrieval    | Local (Transformers.js) | Cloud API     | Yes        | Quantized ONNX model ~50 MB   |
| Text Search (keyword)    | Local (SQLite / IndexedDB) | —           | Yes        | Desktop→SQLite, Browser→IDB   |
| Simple QA / Explain      | Local (Ollama)      | Cloud LLM        | Yes        | Desktop only; browser→cloud   |
| Complex Agent Reasoning  | Cloud LLM           | —                | No         | Multi‑tool, needs context     |
| Summary Generation       | Local (desktop)     | Cloud LLM        | Partial    | Bullet‑pts ok local; SQ3R→cloud |
| Reranking                | Local (ONNX)        | Cloud cross‑enc  | Yes        | Lightweight model             |
| Quiz Generation          | Cloud LLM           | Local LLM        | Partial    | Falls back to simpler quiz    |
| Knowledge Graph Building | Cloud LLM           | Queue offline    | No         | Multi‑doc context heavy       |
| Spaced Repetition (FSRS) | Local (pure math)   | —                | Yes        | Zero server required          |
| OCR (scanned PDF)        | Local (Tesseract)   | —                | Yes        | WASM, no upload               |
| TTS (text‑to‑speech)     | Local (Web Speech)  | —                | Yes        | Browser native                |

---

## Routing Decision Flow

```
                  ┌──────────────────┐
                  │  User Request    │
                  │ (search, QA,     │
                  │  summarize, etc) │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Privacy Mode?   │──── Yes ────▶ LOCAL ONLY
                  │  (Settings flag) │
                  └────────┬─────────┘
                           │ No
                           ▼
                  ┌──────────────────┐
                  │  Task requires   │──── Yes ────▶ CLOUD (must)
                  │  large context?  │               (Knowledge Graph,
                  │                  │                Complex Agent)
                  └────────┬─────────┘
                           │ No
                           ▼
                  ┌──────────────────┐
                  │  Local provider  │──── No  ─────▶ CLOUD (fallback)
                  │  available?      │
                  └────────┬─────────┘
                           │ Yes
                           ▼
                  ┌──────────────────┐
                  │  Execute LOCAL   │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Confidence      │─── < threshold ──▶ CLOUD (upgrade)
                  │  score OK?       │
                  └────────┬─────────┘
                           │ OK
                           ▼
                     RETURN LOCAL
```

---

## Provider Lifecycle

1. **Startup Scan** — `CapabilityScanner` probes:
   - `window.__TAURI__` → Desktop mode detected → use SQLite storage
   - `navigator.gpu` → WebGPU available (WebLLM voter)
   - `fetch('http://localhost:11434/api/tags')` → Ollama running
   - `IndexedDB` (browser) / Tauri SQLite plugin (desktop) → cache ready
   - Builds `RuntimeCapabilities { isDesktop, localLLM, localEmbed, webGPU, storageType }`

2. **Middleware Dispatch** — `Scheduler.classify(task)`:
   - `task.type` → lookup routing matrix
   - `task.contextSize` → enforces cloud-only threshold
   - `privacyMode` → overrides all to local

3. **Upgrade Path** — `ConfidenceGate`:
   - Local result wrapped as `{ result, confidence: 0..1, source: 'local' }`
   - If `confidence < 0.6` and not privacy mode → transparent cloud retry
   - User never sees a failed local result

4. **Offline Queue**:
   - **Desktop (Tauri):** Tauri SQLite plugin — persists pending cloud tasks in `offline_queue` table
   - **Browser:** IndexedDB store `pending-tasks`
   ```
   pending_tasks: [{ type: 'knowledge_graph', book_ids: [1,2,3], queued_at }]
   ```
   - Flushed when `navigator.onLine` becomes `true`
   - Backend picks up and processes sequentially
   - Notification shown on completion

---

## Hybrid Provider Example (Embedding)

```
HybridEmbedProvider implements AIProvider
  ├── local: Transformers.js (all‑MiniLM‑L6‑v2)
  │     ✓ Desktop browser → runs in WebWorker
  │     ✓ Fallback to CPU via WASM if no WebGPU
  │     ✓ Model cached in local storage (desktop: SQLite, browser: IndexedDB)
  │       after first download
  │
  └── remote: Cloud embedding API
        └── used when: local model not yet loaded, or privacy mode off
```

## Key Design Rules

- **Never send document text to cloud in privacy mode**
- **Local providers must NOT block the UI** — all run in Web Workers or Tauri sidecar
- **Storage dual-path** — Desktop (Tauri) uses SQLite for all local data (file cache, annotations, offline queue, model cache); Browser uses IndexedDB
- **User always knows the source** — small badge shows "Local" / "Cloud" on every AI response
