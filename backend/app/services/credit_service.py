"""
Credit service — free credit allowance, monthly reset, credit pack management.
"""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.config import get_settings

logger = logging.getLogger(__name__)


def _next_reset_date(day: int = 1) -> datetime:
    """Return the next monthly reset date (1st of next month at midnight UTC)."""
    now = datetime.utcnow()
    if now.day < day:
        return now.replace(day=day, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        return datetime(now.year + 1, 1, day, 0, 0, 0)
    return datetime(now.year, now.month + 1, day, 0, 0, 0)


def grant_free_credits(db: Session, user_id: int, commit: bool = True) -> Optional[float]:
    """
    Grant free monthly credits to a user.  Should be called on registration
    and periodically (or lazily on next check) when the reset date has passed.
    Returns the new balance or None if user not found.
    """
    from app.models import User

    settings = get_settings()
    amount = float(settings.FREE_MONTHLY_CREDITS or 1000000)
    reset_at = _next_reset_date(settings.CREDIT_RESET_DAY or 1)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    user.credits = float(amount)
    user.monthly_credits_reset_at = reset_at

    if commit:
        db.commit()

    logger.info("Free credits granted: user=%s amount=%s", user_id, amount)
    return amount


def ensure_monthly_credits(db: Session, user_id: int) -> float:
    """
    Check and perform monthly credit reset if needed.
    Called before any credit operation. Returns current balance.
    """
    from app.models import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return 0.0

    now = datetime.utcnow()
    if user.monthly_credits_reset_at and now >= user.monthly_credits_reset_at:
        return grant_free_credits(db, user_id, commit=True) or 0.0

    # If no reset date set (migration from old users), grant now
    if not user.monthly_credits_reset_at:
        return grant_free_credits(db, user_id, commit=True) or 0.0

    return float(user.credits or 0.0)


def add_credits(
    db: Session,
    user_id: int,
    amount: float,
    ref_type: str,
    ref_id: Optional[int] = None,
    note: str = "",
    commit: bool = True,
) -> float:
    """
    Add credits to a user (purchase, admin grant, etc.).
    Records a credit_transaction. Returns new balance.
    """
    from app.models import User, CreditTransaction

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    current = float(user.credits or 0.0)
    user.credits = current + amount

    txn = CreditTransaction(
        user_id=user_id,
        type="purchase" if ref_type == "credit_pack" else "admin_grant",
        amount=amount,
        balance_after=user.credits,
        reference_type=ref_type,
        reference_id=ref_id,
        note=note,
    )
    db.add(txn)

    if commit:
        db.commit()

    logger.info("Credits added: user=%s amount=%s balance=%s", user_id, amount, user.credits)
    return float(user.credits)


def list_available_packs(db: Session) -> list[dict]:
    """Return active credit packs available for purchase."""
    from app.models import CreditPack

    packs = (
        db.query(CreditPack)
        .filter(CreditPack.is_active == True)
        .order_by(CreditPack.sort_order)
        .all()
    )
    return [
        {
            "id": p.id,
            "name": p.name,
            "credits": p.credits,
            "price_cents": p.price_cents,
        }
        for p in packs
    ]


def get_transaction_history(
    db: Session,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Return credit transaction history for a user."""
    from app.models import CreditTransaction

    total = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == user_id)
        .count()
    )

    rows = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == user_id)
        .order_by(CreditTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": r.id,
                "type": r.type,
                "amount": float(r.amount),
                "balance_after": float(r.balance_after),
                "reference_type": r.reference_type,
                "note": r.note,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
