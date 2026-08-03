# Smart Reader Testing Architecture

## Quick Reference

```bash
cd backend
uv run pytest tests/ -v        # Run all tests
uv run pytest tests/test_providers.py -v   # Provider unit tests only
uv run pytest tests/test_middleware.py -v  # Middleware unit tests only
uv run pytest tests/test_api_integration.py -v  # API integration tests only
```

## Test Structure

```
backend/tests/
├── conftest.py                # Shared fixtures, DB setup, dependency overrides
├── test_providers.py          # Provider layer unit tests (16 tests)
├── test_middleware.py         # Middleware layer unit tests (16 tests)
└── test_api_integration.py    # API integration tests (6 tests)
```

## Test Database

Tests use a **file-based SQLite database** at `/tmp/smart_reader_test.db` to avoid the per-connection isolation issues of `sqlite:///:memory:`.

`conftest.py` handles:
- Setting `DATABASE_URL`, `ENVIRONMENT`, `LLM_PROVIDER` environment variables before any app imports
- Importing `app.models` to register all table metadata in SQLAlchemy's `Base`
- Overriding FastAPI's `get_db` dependency injection to use the test database
- Resetting all tables between tests (truncate rows, preserve schema)
- Providing `mock_settings` and `openai_settings` fixtures for provider tests

## Test Categories

### 1. Provider Layer Unit Tests (`test_providers.py`)

Tests the AI provider abstraction without database or network dependencies.

| Test Class | Count | Coverage |
|------------|-------|----------|
| `TestProviderBase` | 4 | `ProviderResult`, `EmbedResult`, `RerankResult` data classes — defaults, full construction, dimension validation |
| `TestMockProvider` | 4 | `generate()` returns valid result, `embed()` returns 384-dim vectors, `rerank()` returns scored docs, `is_available()` returns true |
| `TestCloudProvider` | 2 | Not available without API key, available with API key configured |
| `TestLocalProvider` | 1 | Not available by default (no Ollama running in test) |
| `TestProviderRegistry` | 5 | Registration, get by name, resolve with preference, fallback when preference unavailable |

### 2. Middleware Layer Unit Tests (`test_middleware.py`)

Tests the routing and quality-control logic without HTTP or database dependencies.

| Test Class | Count | Coverage |
|------------|-------|----------|
| `TestScheduler` | 7 | 7 task types in routing matrix; `rag_qa` → cloud, `complex_agent` → cloud (must), `knowledge_graph` → cloud (must); privacy mode forces local/reject/queue |
| `TestConfidenceGate` | 4 | High confidence passes through; low confidence triggers cloud upgrade; privacy mode blocks upgrade; graceful degradation when cloud call fails |
| `TestPrivacyGuard` | 6 | Context creation, enabled/disabled states, header parsing, document safety validation (blocks >10K chars in privacy mode, allows small context, skips when disabled) |

### 3. API Integration Tests (`test_api_integration.py`)

End-to-end HTTP tests using FastAPI's `TestClient` with a real SQLite database.

| Test | Coverage |
|------|----------|
| `test_list_owns_books` | User registers, logs in, lists own books, verifies count and title |
| `test_share_creates_copy` | Alice shares book with Bob, verifies response contains `shared_with` and `shared_book_id` |
| `test_shared_book_appears_in_recipient_list` | After sharing, Bob's book list shows the shared book with `shared_by: "alice"` |
| `test_cannot_reshare_shared_book` | Bob tries to re-share a book he received → 403 Forbidden |
| `test_privacy_mode_blocks_search` | Request with `X-Privacy-Mode: true` header is blocked by PrivacyGuard middleware → 403 |
| `test_unauthorized_returns_401` | Unauthenticated request to `/api/books/` → 401 |

## Adding New Tests

### Adding a provider test
```python
class TestNewProvider:
    @pytest.mark.asyncio
    async def test_my_feature(self, mock_settings):
        provider = MyProvider(mock_settings)
        result = await provider.generate("hello")
        assert result.content
```

### Adding a middleware test
```python
class TestNewMiddleware:
    def test_my_routing_rule(self):
        decision = classify("rag_qa", privacy_mode=True)
        assert decision.target == "local"
```

### Adding an API integration test
```python
def test_my_endpoint(client, auth_headers):
    resp = client.get("/api/my-endpoint", headers=auth_headers["alice"])
    assert resp.status_code == 200
    assert resp.json()["field"] == "expected"
```

## Test Configuration

```toml
# pyproject.toml (test-related sections)
[dependency-groups]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.28.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

## Current Status

```
38 tests — 38 passed
├── Provider layer:  16 passed
├── Middleware layer: 16 passed  
└── API integration:  6 passed
```

## Future Test Expansion

- [ ] Frontend component tests (React Testing Library)
- [ ] Search pipeline end-to-end test with real embedding model
- [ ] Knowledge graph extraction integration test (requires real LLM)
- [ ] Performance/load tests for search and embedding endpoints
- [ ] E2E tests with Playwright/Cypress
