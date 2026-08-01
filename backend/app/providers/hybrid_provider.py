from __future__ import annotations
import logging

from app.providers.base import AIProvider, ProviderResult, EmbedResult, RerankResult
from app.providers.registry import get_registry
from app.middleware.scheduler import classify, TaskType
from app.middleware.confidence_gate import ConfidenceGate

logger = logging.getLogger(__name__)


class HybridLLMProvider(AIProvider):
    provider_name = "hybrid"

    def __init__(self):
        self.gate = ConfidenceGate()

    async def generate(self, prompt: str, system: str = "", **kwargs) -> ProviderResult:
        task_type: TaskType = kwargs.get("task_type", "rag_qa")
        privacy_mode: bool = kwargs.get("privacy_mode", False)
        registry = get_registry()

        decision = classify(task_type, privacy_mode=privacy_mode)
        preferred = registry.get(decision.target)
        fallback_provider = registry.get(decision.fallback) if decision.fallback else None

        # Try preferred (local)
        if preferred and await self._is_provider_available(preferred):
            try:
                result = await preferred.generate(prompt, system, **kwargs)
                result.metadata["route"] = decision.target
                result.metadata["fallback_used"] = False
                return result
            except Exception as exc:
                logger.warning("Preferred provider '%s' failed: %s", decision.target, exc)

        # Fallback to cloud or queue
        if fallback_provider and await self._is_provider_available(fallback_provider):
            try:
                result = await fallback_provider.generate(prompt, system, **kwargs)
                result.metadata["route"] = decision.fallback
                result.metadata["fallback_used"] = True
                result.metadata["fallback_reason"] = f"{decision.target} unavailable"
                return result
            except Exception as exc:
                logger.error("Fallback provider '%s' also failed: %s", decision.fallback, exc)

        raise RuntimeError(
            f"No available provider for {task_type}: preferred={decision.target}, fallback={decision.fallback}"
        )

    async def embed(self, texts: list[str]) -> list[EmbedResult]:
        registry = get_registry()
        local = registry.get("local")
        cloud = registry.get("cloud")

        if local and await self._is_provider_available(local):
            try:
                return await local.embed(texts)
            except Exception as exc:
                logger.warning("Local embed failed: %s", exc)

        if cloud and await self._is_provider_available(cloud):
            return await cloud.embed(texts)

        raise RuntimeError("No embedding provider available")

    async def rerank(self, query: str, documents: list[dict], top_k: int = 10) -> RerankResult:
        registry = get_registry()
        cloud = registry.get("cloud")
        if cloud:
            return await cloud.rerank(query, documents, top_k)
        raise RuntimeError("No reranker available")

    async def is_available(self) -> bool:
        return True

    async def _is_provider_available(self, provider: AIProvider) -> bool:
        try:
            return await provider.is_available()
        except Exception:
            return False
