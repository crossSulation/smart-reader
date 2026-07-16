"""
FSRS optimizer service — train spaced repetition parameters from review history.

The fsrs-optimizer library (pip install fsrs-optimizer) fits 13 parameters (w0-w12)
to personal review data. Once trained, the scheduler switches from SM-2 to FSRS.

Usage from admin/setup:
    python -m app.services.fsrs_service --user-id 1
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import and_

logger = logging.getLogger(__name__)

RATING_MAP = {"again": 1, "hard": 2, "good": 3, "easy": 4}


def export_review_logs(db: Session, user_id: int) -> list[dict]:
    """
    Export all review history for a user in fsrs-optimizer format.
    Returns list of revlog dicts:
        [{card_id, review_date, rating, elapsed_days, scheduled_days}, ...]
    """
    from app.models import ReviewItem, Flashcard

    rows = (
        db.query(ReviewItem, Flashcard)
        .join(Flashcard, Flashcard.id == ReviewItem.flashcard_id)
        .filter(Flashcard.user_id == user_id, ReviewItem.last_rating.isnot(None))
        .order_by(Flashcard.id, ReviewItem.updated_at)
        .all()
    )

    logs = []
    for item, card in rows:
        rating_num = RATING_MAP.get(item.last_rating, 0)
        if rating_num == 0:
            continue
        logs.append({
            "card_id": card.id,
            "review_date": item.updated_at.isoformat() if item.updated_at else None,
            "rating": rating_num,
            "elapsed_days": item.interval_days or 0,
            "scheduled_days": item.interval_days or 0,
        })
    return logs


def train_fsrs_params(user_id: int, db: Session) -> Optional[dict]:
    """
    Train FSRS parameters from user review history.
    Returns the trained parameters dict (w0-w12) or None if training fails.
    """
    try:
        from fsrs_optimizer import optimize, power_curve
    except ImportError:
        logger.warning("fsrs-optimizer not installed. Run: pip install fsrs-optimizer")
        return None

    logs = export_review_logs(db, user_id)
    if len(logs) < 50:
        logger.warning("Not enough review data for FSRS training (need ≥50, have %d)", len(logs))
        return None

    try:
        dataset = [(log["rating"], log["elapsed_days"]) for log in logs]
        params = optimize(dataset)

        result = {
            "w": params.w if hasattr(params, "w") else [float(p) for p in params],
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "review_count": len(logs),
        }

        from app.models import User
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.fsrs_params = json.dumps(result)
            db.commit()
            logger.info("FSRS params trained for user=%d: %d reviews → w0-w12 saved", user_id, len(logs))
        return result
    except Exception as e:
        logger.error("FSRS training failed: %s", e)
        return None


if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    from app.database import SessionLocal
    user_id = 1
    for arg in sys.argv[1:]:
        if arg.startswith("--user-id="):
            user_id = int(arg.split("=")[1])

    db = SessionLocal()
    try:
        result = train_fsrs_params(user_id, db)
        if result:
            print(json.dumps(result, indent=2))
        else:
            print("Training failed. Check logs for details.")
    finally:
        db.close()
