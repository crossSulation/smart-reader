from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqlfunc

from app.database import get_db
from app.models import User, Book, DocumentChunk, CreditTransaction, TokenUsageLog
from app.routers.auth import require_admin
from app.services.credit_service import add_credits

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Dashboard ──────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    total_users = db.query(sqlfunc.count(User.id)).scalar()
    total_books = db.query(sqlfunc.count(Book.id)).scalar()
    total_chunks = db.query(sqlfunc.count(DocumentChunk.id)).scalar()
    chunks_with_embeddings = db.query(sqlfunc.count(DocumentChunk.id)).filter(DocumentChunk.embedding.isnot(None)).scalar()
    total_credits = db.query(sqlfunc.sum(User.credits)).scalar() or 0
    total_tokens = db.query(sqlfunc.sum(TokenUsageLog.total_tokens)).scalar() or 0

    return {
        "total_users": total_users,
        "total_books": total_books,
        "total_chunks": total_chunks,
        "chunks_with_embeddings": chunks_with_embeddings or 0,
        "total_credits": float(total_credits),
        "total_tokens": int(total_tokens),
    }


# ── Users ──────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(User)
    if search:
        q = q.filter(User.username.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "is_admin": u.is_admin,
                "credits": float(u.credits),
                "book_count": len(u.books),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if "is_admin" in payload:
        user.is_admin = bool(payload["is_admin"])
    if "username" in payload:
        existing = db.query(User).filter(User.username == payload["username"], User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")
        user.username = payload["username"]

    db.commit()
    return {"ok": True}

# ── Credits ────────────────────────────────────────────────────

@router.get("/credits/transactions")
def list_credit_transactions(
    user_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(CreditTransaction).options(joinedload(CreditTransaction.user))
    if user_id:
        q = q.filter(CreditTransaction.user_id == user_id)

    total = q.count()
    transactions = q.order_by(CreditTransaction.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": t.id,
                "user_id": t.user_id,
                "username": t.user.username if t.user else None,
                "type": t.type,
                "amount": float(t.amount),
                "balance_after": float(t.balance_after),
                "note": t.note,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in transactions
        ],
    }


@router.post("/credits/grant")
def admin_grant_credits(
    payload: dict,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    user_id = payload.get("user_id")
    amount = payload.get("amount", 0)
    note = payload.get("note", "Admin grant")

    if not user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="user_id and positive amount are required")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    add_credits(db, user_id, amount, "admin_grant", None, note)
    return {"ok": True, "balance_after": float(user.credits)}


# ── Books ──────────────────────────────────────────────────────

@router.get("/books")
def list_books(
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(Book).options(joinedload(Book.owner))
    if search:
        q = q.filter(Book.title.ilike(f"%{search}%"))

    total = q.count()
    books = q.order_by(Book.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": b.id,
                "title": b.title,
                "owner_id": b.owner_id,
                "owner_username": b.owner.username if b.owner else None,
                "total_pages": b.total_pages,
                "progress_percentage": float(b.progress_percentage or 0),
                "chunk_count": len(b.chunks) if hasattr(b, "chunks") else db.query(sqlfunc.count(DocumentChunk.id)).filter(DocumentChunk.book_id == b.id).scalar(),
                "shared_by": b.shared_by,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in books
        ],
    }


@router.delete("/books/{book_id}")
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    db.delete(book)
    db.commit()
    return {"ok": True}


# ── Embeddings ─────────────────────────────────────────────────

@router.get("/embeddings")
def list_embeddings(
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    q = db.query(DocumentChunk)
    if search:
        q = q.filter(DocumentChunk.text.ilike(f"%{search}%"))

    total = q.count()
    chunks = q.order_by(DocumentChunk.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": c.id,
                "book_id": c.book_id,
                "chunk_index": c.chunk_index,
                "text_preview": (c.text or "")[:200],
                "token_count": c.token_count,
                "has_embedding": c.embedding is not None,
                "embedding_model": c.embedding_model,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in chunks
        ],
    }


@router.post("/embeddings/delete-unindexed")
def delete_unindexed_chunks(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    deleted = db.query(DocumentChunk).filter(DocumentChunk.embedding.is_(None)).delete()
    db.commit()
    return {"ok": True, "deleted_count": deleted}
