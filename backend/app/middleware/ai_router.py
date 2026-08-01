import logging
from typing import Optional

from fastapi import Request, Depends

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

        if decision.target == "reject":
            raise RuntimeError(f"Task {task_type} rejected: {decision.reason}")

        if decision.target == "queue":
            raise RuntimeError(f"Task {task_type} should be queued: {decision.reason}")

        provider = registry.get(decision.target)
        if provider is None:
            logger.warning("Provider '%s' not found, falling back to hybrid", decision.target)
            provider = registry.get("hybrid")

        if provider is None:
            logger.warning("Falling back to cloud")
            provider = registry.get("cloud")

        if provider is None:
            raise RuntimeError("No AI provider available")

        return provider, decision

    def resolve(self, task_type: TaskType = "rag_qa", privacy_mode: bool = False) -> AIProvider:
        decision = classify(task_type, privacy_mode)
        registry = get_registry()

        if self.settings.ENABLE_AI_ROUTER:
            hybrid = registry.get("hybrid")
            if hybrid:
                return hybrid

        provider = registry.get(decision.target)
        if provider is None:
            provider = registry.get("cloud")
        return provider


_router: Optional[AIRouter] = None


def get_ai_router() -> AIRouter:
    global _router
    if _router is None:
        _router = AIRouter()
    return _router


def get_provider(
    task_type: TaskType = "rag_qa",
    privacy_mode: bool = False,
) -> AIProvider:
    router = get_ai_router()
    return router.resolve(task_type, privacy_mode)
