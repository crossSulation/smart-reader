import os

os.environ["DATABASE_URL"] = "sqlite:////tmp/smart_reader_test.db"
os.environ["ENVIRONMENT"] = "development"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["DB_ECHO"] = "false"

import pytest
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app.database as _db
import app.models  # Register table metadata
from app.main import app

_db.Base.metadata.create_all(bind=_db.sync_engine)

from app.database import get_db as _get_db_fn


def _test_get_db():
    db = _db.SessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[_get_db_fn] = _test_get_db


@pytest.fixture(autouse=True)
def reset_db():
    """Clear all tables between tests."""
    for table in reversed(_db.Base.metadata.sorted_tables):
        try:
            with _db.sync_engine.connect() as conn:
                conn.execute(table.delete())
                conn.commit()
        except Exception:
            pass
    yield


@pytest.fixture
def mock_settings():
    class Mock:
        LLM_PROVIDER = "mock"
        LLM_MODEL = "mock"
        LLM_BASE_URL = "http://localhost:11434"
        LLM_API_KEY = ""
        LLM_MAX_TOKENS = 512
        LLM_TEMPERATURE = 0.3
        EMBEDDING_MODEL = "all-MiniLM-L6-v2"
        QA_EVIDENCE_THRESHOLD = 0.5
    return Mock()


@pytest.fixture
def openai_settings():
    class Mock:
        LLM_PROVIDER = "openai"
        LLM_MODEL = "gpt-3.5-turbo"
        LLM_BASE_URL = "https://api.openai.com"
        LLM_API_KEY = "sk-test-key"
        LLM_MAX_TOKENS = 512
        LLM_TEMPERATURE = 0.3
        EMBEDDING_MODEL = "all-MiniLM-L6-v2"
        QA_EVIDENCE_THRESHOLD = 0.5
    return Mock()
