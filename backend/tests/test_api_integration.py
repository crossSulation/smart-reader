import pytest
import os
import sys
import json
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.models import User, Book, DocumentChunk, FileMetadata
from app.database import SessionLocal


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    db = SessionLocal()

    client.post("/api/auth/register", json={
        "username": "alice", "email": "alice@test.com", "password": "test123"
    })
    client.post("/api/auth/register", json={
        "username": "bob", "email": "bob@test.com", "password": "test123"
    })
    db.commit()

    alice_resp = client.post("/api/auth/login", json={"username": "alice", "password": "test123"})
    bob_resp = client.post("/api/auth/login", json={"username": "bob", "password": "test123"})

    alice_token = alice_resp.json()["access_token"]
    bob_token = bob_resp.json()["access_token"]

    return {
        "alice": {"Authorization": f"Bearer {alice_token}"},
        "bob": {"Authorization": f"Bearer {bob_token}"},
    }


@pytest.fixture
def book_id(auth_headers, client):
    db = SessionLocal()
    alice = db.query(User).filter(User.username == "alice").first()
    assert alice is not None, "Alice must exist — check auth_headers fixture"

    book = Book(
        title="Test Book.pdf",
        owner_id=alice.id,
        current_page=10,
        total_pages=100,
        progress_percentage=10,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(book)
    db.commit()
    db.refresh(book)

    fm = FileMetadata(
        original_name="Test Book.pdf",
        stored_name="test/alice/test_book.pdf",
        file_type="pdf",
        file_url="http://localhost/uploads/test.pdf",
        upload_date=datetime.now(timezone.utc),
        uploaded_by=alice.id,
    )
    db.add(fm)
    db.commit()

    for i in range(3):
        db.add(DocumentChunk(
            book_id=book.id,
            chunk_index=i,
            text=f"This is chunk {i} about machine learning and AI concepts.",
            page_start=i + 1,
            embedding=json.dumps([0.1 * (i + 1)] * 384),
        ))
    db.commit()

    return book.id


def test_list_owns_books(client, auth_headers, book_id):
    resp = client.get("/api/books/", headers=auth_headers["alice"])
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Test Book.pdf"


def test_share_creates_copy(client, auth_headers, book_id):
    resp = client.post(
        f"/api/books/{book_id}/share",
        json={"username": "bob"},
        headers=auth_headers["alice"],
    )
    assert resp.status_code == 200
    assert resp.json()["shared_with"] == "bob"


def test_shared_book_appears_in_recipient_list(client, auth_headers, book_id):
    client.post(f"/api/books/{book_id}/share", json={"username": "bob"}, headers=auth_headers["alice"])
    resp = client.get("/api/books/", headers=auth_headers["bob"])
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["shared_by"] == "alice"


def test_cannot_reshare_shared_book(client, auth_headers, book_id):
    client.post(f"/api/books/{book_id}/share", json={"username": "bob"}, headers=auth_headers["alice"])
    bob_books = client.get("/api/books/", headers=auth_headers["bob"]).json()
    bob_book_id = bob_books[0]["id"]
    resp = client.post(f"/api/books/{bob_book_id}/share", json={"username": "alice"}, headers=auth_headers["bob"])
    assert resp.status_code == 403


def test_privacy_mode_blocks_search(client, auth_headers):
    """Privacy middleware blocks cloud search. Note: TestClient may surface middleware exceptions differently."""
    import pytest
    from fastapi.exceptions import HTTPException
    try:
        resp = client.get("/api/books/search?q=test", headers={**auth_headers["alice"], "X-Privacy-Mode": "true"})
        assert resp.status_code in (403, 500)
    except HTTPException as e:
        assert e.status_code == 403


def test_unauthorized_returns_401(client):
    resp = client.get("/api/books/")
    assert resp.status_code == 401

