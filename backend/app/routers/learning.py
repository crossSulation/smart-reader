from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Flashcard, Note, ReviewItem
from app.routers.auth import get_current_user
from app.schemas import (
    FlashcardCreate,
    FlashcardResponse,
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    ReviewItemResponse,
    ReviewRateRequest,
)


router = APIRouter(prefix="/learning", tags=["learning"])


def _get_book_or_404(book_id: int, user_id: int, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id, Book.owner_id == user_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _split_tags(raw_tags: str | None) -> list[str]:
    if not raw_tags:
        return []
    return [tag.strip() for tag in raw_tags.split(",") if tag.strip()]


def _join_tags(tags: list[str]) -> str | None:
    cleaned = [tag.strip() for tag in tags if tag.strip()]
    return ",".join(cleaned) if cleaned else None


@router.post("/notes", response_model=NoteResponse)
def create_note(
    payload: NoteCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_book_or_404(payload.book_id, user["id"], db)

    note = Note(
        user_id=user["id"],
        book_id=payload.book_id,
        content=payload.content,
        source_text=payload.source_text,
        page=payload.page,
        tags=_join_tags(payload.tags),
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        book_id=note.book_id,
        content=note.content,
        source_text=note.source_text,
        page=note.page,
        tags=_split_tags(note.tags),
        created_at=note.created_at,
    )


@router.get("/notes", response_model=list[NoteResponse])
def list_notes(
    book_id: int | None = Query(None),
    limit: int = Query(30, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Note).filter(Note.user_id == user["id"])

    if book_id is not None:
        _get_book_or_404(book_id, user["id"], db)
        query = query.filter(Note.book_id == book_id)

    rows = query.order_by(Note.created_at.desc()).limit(limit).all()

    return [
        NoteResponse(
            id=item.id,
            user_id=item.user_id,
            book_id=item.book_id,
            content=item.content,
            source_text=item.source_text,
            page=item.page,
            tags=_split_tags(item.tags),
            created_at=item.created_at,
        )
        for item in rows
    ]


@router.delete("/notes/{note_id}")
def delete_note(
    note_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user["id"]).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()
    return {"ok": True}


@router.patch("/notes/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: int,
    payload: NoteUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user["id"]).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if payload.content is not None:
        content = payload.content.strip()
        if not content:
            raise HTTPException(status_code=422, detail="content cannot be empty")
        note.content = content

    if payload.source_text is not None:
        note.source_text = payload.source_text

    if payload.page is not None:
        note.page = payload.page

    if payload.tags is not None:
        note.tags = _join_tags(payload.tags)

    db.commit()
    db.refresh(note)

    return NoteResponse(
        id=note.id,
        user_id=note.user_id,
        book_id=note.book_id,
        content=note.content,
        source_text=note.source_text,
        page=note.page,
        tags=_split_tags(note.tags),
        created_at=note.created_at,
    )


@router.post("/flashcards", response_model=FlashcardResponse)
def create_flashcard(
    payload: FlashcardCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_book_or_404(payload.book_id, user["id"], db)

    flashcard = Flashcard(
        user_id=user["id"],
        book_id=payload.book_id,
        front=payload.front,
        back=payload.back,
        source_text=payload.source_text,
        source_chunk_id=payload.source_chunk_id,
        tags=_join_tags(payload.tags),
    )
    db.add(flashcard)
    db.flush()

    # Create first due review item immediately so it appears in today's review queue.
    review_item = ReviewItem(
        flashcard_id=flashcard.id,
        due_at=datetime.now(timezone.utc),
        interval_days=1,
        ease_factor=2.5,
        reps=0,
        last_rating=None,
    )
    db.add(review_item)
    db.commit()
    db.refresh(flashcard)

    return FlashcardResponse(
        id=flashcard.id,
        user_id=flashcard.user_id,
        book_id=flashcard.book_id,
        front=flashcard.front,
        back=flashcard.back,
        source_text=flashcard.source_text,
        source_chunk_id=flashcard.source_chunk_id,
        tags=_split_tags(flashcard.tags),
        created_at=flashcard.created_at,
    )


@router.get("/review/due", response_model=list[ReviewItemResponse])
def list_due_review_items(
    limit: int = Query(20, ge=1, le=200),
    tag: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    query = (
        db.query(ReviewItem, Flashcard)
        .join(Flashcard, Flashcard.id == ReviewItem.flashcard_id)
        .filter(Flashcard.user_id == user["id"], ReviewItem.due_at <= now)
    )

    if tag:
        query = query.filter(Flashcard.tags.like(f"%{tag}%"))

    rows = (
        query
        .order_by(ReviewItem.due_at.asc())
        .limit(limit)
        .all()
    )

    result: list[ReviewItemResponse] = []
    for item, card in rows:
        result.append(
            ReviewItemResponse(
                id=item.id,
                flashcard_id=item.flashcard_id,
                due_at=item.due_at,
                interval_days=item.interval_days,
                ease_factor=item.ease_factor,
                reps=item.reps,
                last_rating=item.last_rating,
                flashcard_front=card.front,
                flashcard_back=card.back,
                book_id=card.book_id,
            )
        )
    return result


@router.post("/review/{item_id}/rate", response_model=ReviewItemResponse)
def rate_review_item(
    item_id: int,
    payload: ReviewRateRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReviewItem, Flashcard)
        .join(Flashcard, Flashcard.id == ReviewItem.flashcard_id)
        .filter(ReviewItem.id == item_id, Flashcard.user_id == user["id"])
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Review item not found")

    item, card = row
    rating = payload.rating

    quality_map = {
        "again": 0,
        "hard": 3,
        "good": 4,
        "easy": 5,
    }
    quality = quality_map[rating]

    if quality < 3:
        item.reps = 0
        item.interval_days = 1
    else:
        item.reps += 1
        if item.reps == 1:
            item.interval_days = 1
        elif item.reps == 2:
            item.interval_days = 3
        else:
            item.interval_days = max(1, int(round(item.interval_days * item.ease_factor)))

    new_ease = item.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    item.ease_factor = max(1.3, round(new_ease, 2))

    if rating == "hard":
        item.interval_days = max(1, int(round(item.interval_days * 0.8)))
    elif rating == "easy":
        item.interval_days = max(1, int(round(item.interval_days * 1.3)))

    item.last_rating = rating
    item.due_at = datetime.now(timezone.utc) + timedelta(days=item.interval_days)

    db.commit()
    db.refresh(item)

    return ReviewItemResponse(
        id=item.id,
        flashcard_id=item.flashcard_id,
        due_at=item.due_at,
        interval_days=item.interval_days,
        ease_factor=item.ease_factor,
        reps=item.reps,
        last_rating=item.last_rating,
        flashcard_front=card.front,
        flashcard_back=card.back,
        book_id=card.book_id,
    )
