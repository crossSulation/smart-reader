import logging
from typing import Optional

from fastapi import Request

from app.config import get_settings
from app.middleware.capability_scanner import get_capabilities
from app.middleware.scheduler import classify, TaskType, RouteDecision
from app.middleware.confidence_gate import ConfidenceGate
from app.providers.base import AIProvider
from app.providers.registry import get_registry

logger = logging.getLogger(__name__)


class AIRouter:
    def __init__(self):
        self.settings = get_settings()
        self.confidence_gate = ConfidenceGate()

    def route(self, task_type: TaskType, privacy_mode: bool = False, context_size: int = 0) -> tuple[AIProvider, RouteDecision]:
        decision = classify(task_type, privacy_mode, context_size)
        registry = get_registry()
        capabilities = get_capabilities()

        if decision.target == "reject":
            raise RuntimeError(f"Task {task_type} rejected: {decision.reason}")

        if decision.target == "queue":
            from app.providers.base import AIProvider as _AIProvider
            raise RuntimeError(f"Task {task_type} should be queued: {decision.reason}")

        provider = registry.get(decision.target)
        if provider is None:
            logger.warning("Provider '%s' not found, falling back to cloud", decision.target)
            provider = registry.get("cloud")

        if provider is None:
            raise RuntimeError("No AI provider available")

        return provider, decision


_router: Optional[AIRouter] = None


def get_ai_router() -> AIRouter:
    global _router
    if _router is None:
        _router = AIRouter()
    return _router
