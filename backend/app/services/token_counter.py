"""
Token counter service — records LLM token consumption and tracks credit usage.

Every cloud LLM call should call log_token_usage() after completion.
"""

import logging
import decimal
from typing import Optional
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Default pricing: 1 credit = 1 token
DEFAULT_CREDITS_PER_TOKEN: decimal.Decimal = decimal.Decimal("1.0")

MODEL_MULTIPLIERS: dict[str, decimal.Decimal] = {
    "gpt-4": decimal.Decimal("5.0"),
    "gpt-4-0314": decimal.Decimal("5.0"),
    "gpt-4-32k": decimal.Decimal("10.0"),
    "gpt-4-turbo": decimal.Decimal("3.0"),
    "gpt-4o": decimal.Decimal("2.5"),
    "gpt-4o-mini": decimal.Decimal("0.5"),
    "gpt-3.5-turbo": decimal.Decimal("1.0"),
    "gpt-3.5-turbo-0125": decimal.Decimal("1.0"),
    "claude-3-opus": decimal.Decimal("5.0"),
    "claude-3-sonnet": decimal.Decimal("2.0"),
    "claude-3-haiku": decimal.Decimal("0.5"),
    "deepseek-chat": decimal.Decimal("0.2"),
    "deepseek-coder": decimal.Decimal("0.2"),
}


def _multiplier_for_model(model: str) -> decimal.Decimal:
    """Return the pricing multiplier for a given model name."""
    raw = model.strip().lower()
    if not raw:
        return decimal.Decimal("1.0")
    return MODEL_MULTIPLIERS.get(raw, decimal.Decimal("1.0"))


def log_token_usage(
    db: Session,
    user_id: int,
    capability: str,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    interaction_id: Optional[int] = None,
) -> tuple[int, decimal.Decimal]:
    """
    Record token consumption to token_usage_logs and deduct credits from user.

    Returns (log_record_id, credit_cost).
    Raises ValueError if user has insufficient credits.
    """
    from app.models import TokenUsageLog, User

    total = prompt_tokens + completion_tokens
    multiplier = _multiplier_for_model(model)
    credit_cost = (
        decimal.Decimal(str(total)) * multiplier / DEFAULT_CREDITS_PER_TOKEN
    ).quantize(decimal.Decimal("0.0001"))

    user = db.query(User).with_for_update().filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Ensure free monthly credits are granted before deduction
    from app.services.credit_service import ensure_monthly_credits
    balance = ensure_monthly_credits(db, user_id)

    # Only deduct for cloud providers; skip for mock/ollama (cost is 0 anyway)
    if provider not in ("mock", "ollama") and credit_cost > 0:
        current_balance = decimal.Decimal(str(balance))
        if current_balance < credit_cost:
            logger.warning(
                "Insufficient credits user=%s balance=%s cost=%s — logging without deduction",
                user_id, current_balance, credit_cost,
            )
        else:
            user.credits = float(current_balance - credit_cost)

    log_record = TokenUsageLog(
        user_id=user_id,
        interaction_id=interaction_id,
        capability=capability,
        provider=provider,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total,
        credit_cost=float(credit_cost),
    )
    db.add(log_record)
    db.flush()

    # Record credit transaction
    from app.models import CreditTransaction
    txn = CreditTransaction(
        user_id=user_id,
        type="consumption",
        amount=float(-credit_cost),
        balance_after=float(getattr(user, "credits", 0) or 0),
        reference_type="token_usage",
        reference_id=log_record.id,
        note=f"Tokens: {total} ({capability}, {model})",
    )
    db.add(txn)

    # Commit immediately so token usage is never lost
    db.commit()

    logger.info(
        "Token usage recorded: user=%s capability=%s provider=%s tokens=%s cost=%s",
        user_id,
        capability,
        provider,
        total,
        credit_cost,
    )

    return (log_record.id, credit_cost)
