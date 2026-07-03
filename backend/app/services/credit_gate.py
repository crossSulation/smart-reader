"""
Credit gate — FastAPI dependency that checks credit balance before cloud AI calls.

Usage:
    @router.post("/qa")
    async def qa(..., credit_status: dict = Depends(check_credit_gate)):
        ...

The gate skips credit checks for local/mock providers.
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.routers.auth import get_current_user
from app.services.credit_service import ensure_monthly_credits

logger = logging.getLogger(__name__)

# Thresholds for credit warnings
LOW_CREDIT_THRESHOLD = 10000  # Warn when below this
EXHAUSTED_THRESHOLD = 0


def _resolve_credit_status(balance: float) -> str:
    if balance <= EXHAUSTED_THRESHOLD:
        return "exhausted"
    if balance <= LOW_CREDIT_THRESHOLD:
        return "low"
    return "ok"


def check_credit_gate(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Gate that checks user credit balance for cloud AI calls.
    Skips if provider is local/ollama/mock.

    Returns a dict with credit info for response headers.
    Raises HTTP 402 if credits are exhausted.
    """
    settings = get_settings()
    provider = (settings.LLM_PROVIDER or "mock").lower()

    # Local/offline providers don't consume credits
    if provider in ("mock", "ollama"):
        return {
            "credit_balance": 0.0,
            "credit_status": "ok",
            "is_cloud_call": False,
        }

    user_id = current_user["id"]
    balance = ensure_monthly_credits(db, user_id)
    status = _resolve_credit_status(balance)

    if status == "exhausted":
        raise HTTPException(
            status_code=402,
            detail={
                "message": "Insufficient credits for cloud AI call",
                "balance": round(balance, 4),
                "status": status,
            },
        )

    return {
        "credit_balance": round(balance, 4),
        "credit_status": status,
        "is_cloud_call": True,
    }


def get_credit_response_headers(credit_status: dict) -> dict[str, str]:
    """Return response headers reflecting current credit state."""
    if not credit_status.get("is_cloud_call"):
        return {}
    return {
        "X-Credit-Balance": str(credit_status.get("credit_balance", 0)),
        "X-Credit-Status": credit_status.get("credit_status", "ok"),
    }


def recommendation_pack(
    db: Session,
    user_id: int,
) -> Optional[dict]:
    """
    Suggest a credit pack based on consumption patterns.
    Returns None if current free tier is sufficient, or a suggested pack.
    """
    from app.models import TokenUsageLog

    settings = get_settings()
    free_limit = settings.FREE_MONTHLY_CREDITS or 1000000

    from datetime import datetime
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    days_in_month = 30  # approximation
    days_elapsed = max(1, (now - month_start).days)
    daily_avg = 0.0

    rows = (
        db.query(TokenUsageLog)
        .filter(TokenUsageLog.user_id == user_id, TokenUsageLog.created_at >= month_start)
        .all()
    )
    month_tokens = sum(r.total_tokens for r in rows)
    if days_elapsed > 0:
        daily_avg = month_tokens / days_elapsed

    projected = daily_avg * days_in_month
    if projected <= free_limit * 0.8:
        return None

    # Suggest smallest pack that covers the projected shortfall
    shortfall = projected - free_limit
    from app.models import CreditPack
    packs = (
        db.query(CreditPack)
        .filter(CreditPack.is_active == 1, CreditPack.credits >= shortfall)
        .order_by(CreditPack.credits.asc())
        .limit(1)
        .all()
    )
    if not packs:
        # Return largest pack if no single pack covers the gap
        packs = (
            db.query(CreditPack)
            .filter(CreditPack.is_active == 1)
            .order_by(CreditPack.credits.desc())
            .limit(1)
            .all()
        )

    if not packs:
        return None

    p = packs[0]
    return {
        "suggested_pack_id": p.id,
        "name": p.name,
        "credits": p.credits,
        "price_cents": p.price_cents,
        "projected_usage": round(projected, 0),
        "free_limit": free_limit,
        "projected_shortfall": round(max(0, projected - free_limit), 0),
    }
