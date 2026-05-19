from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Flashcard, Note, ReviewItem, User
from app.routers.auth import get_current_user
from app.schemas import (
    PersonalizationProfileResponse,
    PersonalizationProfileUpdate,
    WeeklySummaryResponse,
)


profile_router = APIRouter(prefix="/personalization", tags=["personalization"])
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _join_csv(items: list[str] | None) -> str | None:
    if items is None:
        return None
    cleaned = [item.strip() for item in items if item and item.strip()]
    return ",".join(cleaned) if cleaned else None


@profile_router.get("/profile", response_model=PersonalizationProfileResponse)
def get_personalization_profile(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.id == user["id"]).first()
    return PersonalizationProfileResponse(
        user_id=db_user.id,
        explanation_level=db_user.explanation_level or "intermediate",
        study_goal=db_user.study_goal,
        weak_topics=_split_csv(db_user.weak_topics),
        frequently_reviewed_tags=_split_csv(db_user.frequently_reviewed_tags),
    )


@profile_router.put("/profile", response_model=PersonalizationProfileResponse)
def update_personalization_profile(
    payload: PersonalizationProfileUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_user = db.query(User).filter(User.id == user["id"]).first()

    if payload.explanation_level is not None:
        db_user.explanation_level = payload.explanation_level
    if payload.study_goal is not None:
        db_user.study_goal = payload.study_goal.strip() or None
    if payload.weak_topics is not None:
        db_user.weak_topics = _join_csv(payload.weak_topics)
    if payload.frequently_reviewed_tags is not None:
        db_user.frequently_reviewed_tags = _join_csv(payload.frequently_reviewed_tags)

    db.commit()
    db.refresh(db_user)

    return PersonalizationProfileResponse(
        user_id=db_user.id,
        explanation_level=db_user.explanation_level or "intermediate",
        study_goal=db_user.study_goal,
        weak_topics=_split_csv(db_user.weak_topics),
        frequently_reviewed_tags=_split_csv(db_user.frequently_reviewed_tags),
    )


@analytics_router.get("/weekly-summary", response_model=WeeklySummaryResponse)
def get_weekly_summary(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    period_days = 7
    cutoff = now - timedelta(days=period_days)

    books = db.query(Book).filter(Book.owner_id == user["id"]).all()
    pages_read = sum(max(0, int(book.current_page or 0)) for book in books)

    notes_created = (
        db.query(Note)
        .filter(Note.user_id == user["id"], Note.created_at >= cutoff)
        .count()
    )

    flashcards_created = (
        db.query(Flashcard)
        .filter(Flashcard.user_id == user["id"], Flashcard.created_at >= cutoff)
        .count()
    )

    reviewed_rows = (
        db.query(ReviewItem, Flashcard)
        .join(Flashcard, Flashcard.id == ReviewItem.flashcard_id)
        .filter(
            Flashcard.user_id == user["id"],
            ReviewItem.last_rating.isnot(None),
            ReviewItem.updated_at >= cutoff,
        )
        .all()
    )
    reviews_completed = len(reviewed_rows)

    positive_ratings = {"good", "easy"}
    review_accuracy = 0.0
    if reviews_completed > 0:
        positive_count = sum(
            1 for item, _ in reviewed_rows if (item.last_rating or "").lower() in positive_ratings
        )
        review_accuracy = round((positive_count / reviews_completed) * 100.0, 1)

    weak_topic_counter: Counter[str] = Counter()
    for item, card in reviewed_rows:
        rating = (item.last_rating or "").lower()
        if rating not in {"again", "hard"}:
            continue
        for tag in _split_csv(card.tags):
            weak_topic_counter[tag] += 1

    top_weak_topics = [topic for topic, _ in weak_topic_counter.most_common(5)]

    return WeeklySummaryResponse(
        user_id=user["id"],
        period_days=period_days,
        pages_read=pages_read,
        notes_created=notes_created,
        flashcards_created=flashcards_created,
        reviews_completed=reviews_completed,
        review_accuracy=review_accuracy,
        top_weak_topics=top_weak_topics,
    )
