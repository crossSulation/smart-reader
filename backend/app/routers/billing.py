"""Billing router — token usage tracking and credit management."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import TokenUsageLog, User, CreditPack
from app.routers.auth import get_current_user
from app.services.credit_service import (
    ensure_monthly_credits,
    list_available_packs,
    add_credits,
    get_transaction_history,
)
from app.services.credit_gate import recommendation_pack

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/usage")
async def get_usage(
    period: str = Query("month", regex="^(day|week|month)$"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated token consumption by capability for the given period."""
    user_id = current_user["id"]
    now = datetime.utcnow()

    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # month
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    rows = (
        db.query(TokenUsageLog)
        .filter(TokenUsageLog.user_id == user_id, TokenUsageLog.created_at >= start)
        .all()
    )

    total_tokens = sum(r.total_tokens for r in rows)
    total_cost = sum(float(r.credit_cost) for r in rows)

    by_capability: dict[str, dict] = {}
    for r in rows:
        cap = r.capability
        if cap not in by_capability:
            by_capability[cap] = {"tokens": 0, "cost": 0.0}
        by_capability[cap]["tokens"] += r.total_tokens
        by_capability[cap]["cost"] += float(r.credit_cost)

    return {
        "period": period,
        "start_date": start.isoformat(),
        "total_tokens": total_tokens,
        "total_cost": round(total_cost, 4),
        "by_capability": by_capability,
    }


@router.get("/usage/history")
async def get_usage_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detailed token usage log, newest first."""
    user_id = current_user["id"]

    total = (
        db.query(func.count(TokenUsageLog.id))
        .filter(TokenUsageLog.user_id == user_id)
        .scalar()
    )

    rows = (
        db.query(TokenUsageLog)
        .filter(TokenUsageLog.user_id == user_id)
        .order_by(TokenUsageLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total or 0,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": r.id,
                "capability": r.capability,
                "provider": r.provider,
                "model": r.model,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "total_tokens": r.total_tokens,
                "credit_cost": float(r.credit_cost),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/stats")
def get_billing_stats(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current credit balance and monthly usage summary."""
    user_id = current_user["id"]

    # Ensure monthly credits are up-to-date
    balance = ensure_monthly_credits(db, user_id)

    user = db.query(User).filter(User.id == user_id).first()

    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    month_rows = (
        db.query(TokenUsageLog)
        .filter(TokenUsageLog.user_id == user_id, TokenUsageLog.created_at >= month_start)
        .all()
    )
    month_tokens = sum(r.total_tokens for r in month_rows)
    month_cost = sum(float(r.credit_cost) for r in month_rows)

    # Daily breakdown for current month
    daily_usage: list[dict] = []
    daily_map: dict[str, dict] = {}
    for r in month_rows:
        day = r.created_at.strftime("%Y-%m-%d") if r.created_at else ""
        if day not in daily_map:
            daily_map[day] = {"date": day, "tokens": 0, "cost": 0.0}
        daily_map[day]["tokens"] += r.total_tokens
        daily_map[day]["cost"] += float(r.credit_cost)
    daily_usage = sorted(daily_map.values(), key=lambda x: x["date"])

    return {
        "balance": round(balance, 4),
        "monthly_tokens": month_tokens,
        "monthly_cost": round(month_cost, 4),
        "reset_at": user.monthly_credits_reset_at.isoformat() if user and user.monthly_credits_reset_at else None,
        "daily_usage": daily_usage,
    }


class PurchaseRequest(BaseModel):
    pack_id: int


@router.get("/packs")
async def get_packs(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List available credit packs for purchase."""
    return {"packs": list_available_packs(db)}


@router.post("/purchase")
async def purchase_pack(
    body: PurchaseRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Purchase a credit pack (payment gateway stub)."""
    user_id = current_user["id"]

    pack = db.query(CreditPack).filter(CreditPack.id == body.pack_id, CreditPack.is_active == 1).first()
    if not pack:
        raise HTTPException(status_code=404, detail="Credit pack not found")

    # In future: integrate Stripe/Paddle payment here
    new_balance = add_credits(
        db,
        user_id,
        float(pack.credits),
        ref_type="credit_pack",
        ref_id=pack.id,
        note=f"Purchased pack: {pack.name}",
    )

    return {
        "message": f"Successfully purchased {pack.name}",
        "credits_added": pack.credits,
        "balance": round(new_balance, 4),
    }


@router.get("/transactions")
async def get_transactions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Credit transaction history."""
    user_id = current_user["id"]
    return get_transaction_history(db, user_id, limit=limit, offset=offset)


@router.get("/recommendation")
async def get_recommendation(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Suggested credit pack based on consumption patterns."""
    user_id = current_user["id"]
    rec = recommendation_pack(db, user_id)
    if rec is None:
        return {"recommendation": None, "message": "Current usage is within free tier limits."}
    return {"recommendation": rec}
